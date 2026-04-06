from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.core.firebase import get_firestore
from app.schemas.billing import BillingCreate, BillingUpdate
from app.services.dashboard_stats_service import (
    decrement_billing,
    get_dashboard_stats,
    increment_billing,
)

router = APIRouter()


def _normalize_billing_fields(data: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for key, value in data.items():
        if isinstance(value, str):
            value = value.strip()
            normalized[key] = value if value else None
        else:
            normalized[key] = value
    return normalized


def normalize_name(name: str | None) -> str | None:
    if name is None:
        return None
    stripped = " ".join(name.strip().split())
    return stripped.lower()


def _reduce_drug_inventory(db, items: list[dict[str, Any]]) -> None:
    if not items:
        return

    drugs_ref = db.collection("drugs")
    now = datetime.now(timezone.utc)

    for item in items:
        service_name = (item.get("service_or_item") or "").strip()
        if not service_name:
            continue

        quantity_to_reduce = float(item.get("quantity", 0) or 0)
        if quantity_to_reduce <= 0:
            continue

        normalized_service = normalize_name(service_name)
        query = drugs_ref.where("name_lower", "==", normalized_service).limit(1)
        matched = list(query.stream())

        if not matched:
            continue

        drug_doc = matched[0]
        drug_ref = drugs_ref.document(drug_doc.id)
        drug_data = drug_doc.to_dict() or {}

        current_quantity = float(drug_data.get("presentQuantity", 0) or 0)
        next_quantity = max(0, current_quantity - quantity_to_reduce)

        drug_ref.update({"presentQuantity": next_quantity, "updated_at": now})


@router.post("/")
def create_billing(payload: BillingCreate):
    try:
        db = get_firestore()
        now = datetime.now(timezone.utc)

        billing_data = _normalize_billing_fields(payload.model_dump())
        billing_data["patient_name"] = billing_data.get("patient_name", "").strip()
        billing_data["patient_name_lower"] = normalize_name(
            billing_data.get("patient_name")
        )

        # Recalculate amounts to enforce consistency
        items = []
        total = 0.0
        for item in billing_data.get("items", []):
            q = float(item.get("quantity", 0) or 0)
            r = float(item.get("rate", 0) or 0)
            a = q * r
            items.append(
                {
                    "service_or_item": item.get("service_or_item", "").strip(),
                    "quantity": q,
                    "rate": r,
                    "amount": a,
                }
            )
            total += a

        billing_data["items"] = items
        billing_data["total_amount"] = float(total)

        # Reduce drug inventory for billed items
        _reduce_drug_inventory(db, items)

        doc_ref = db.collection("billing").document()

        doc_ref.set(
            {
                "id": doc_ref.id,
                **billing_data,
                "created_at": now,
                "updated_at": None,
            }
        )
        increment_billing()

        return {"success": True, "billing_id": doc_ref.id, "id": doc_ref.id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{billing_id}")
def update_billing(billing_id: str, payload: BillingUpdate):
    db = get_firestore()
    doc_ref = db.collection("billing").document(billing_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Billing record not found")

    update_data = payload.model_dump(exclude_unset=True)
    update_data = _normalize_billing_fields(update_data)

    if "patient_name" in update_data and update_data["patient_name"] is None:
        raise HTTPException(status_code=422, detail="Patient name cannot be empty")

    if "patient_name" in update_data and update_data["patient_name"]:
        update_data["patient_name_lower"] = normalize_name(update_data["patient_name"])

    if "items" in update_data and update_data.get("items") is not None:
        items = []
        total = 0.0
        for item in update_data["items"]:
            q = float(item.get("quantity", 0) or 0)
            r = float(item.get("rate", 0) or 0)
            a = q * r
            items.append(
                {
                    "service_or_item": item.get("service_or_item", "").strip(),
                    "quantity": q,
                    "rate": r,
                    "amount": a,
                }
            )
            total += a
        update_data["items"] = items
        update_data["total_amount"] = float(total)

    if "total_amount" in update_data and update_data.get("total_amount") is None:
        update_data.pop("total_amount", None)

    if "items" in update_data and update_data.get("items") is not None:
        _reduce_drug_inventory(db, update_data["items"])

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided for update")

    update_data["updated_at"] = datetime.now(timezone.utc)
    doc_ref.update(update_data)

    return {"success": True}


@router.get("/")
def get_all_billing(
    limit: int = Query(10, ge=1, le=100),
    cursor: str | None = Query(None),
    search: str | None = Query(None, min_length=1),
):
    db = get_firestore()
    billing_ref = db.collection("billing")

    def normalize_doc(doc):
        d = doc.to_dict() or {}
        return {
            "id": doc.id,
            "patient_name": d.get("patient_name"),
            "phone_number": d.get("phone_number"),
            "pet_name": d.get("pet_name"),
            "address": d.get("address"),
            "date": d.get("date"),
            "total_amount": d.get("total_amount", 0),
        }

    if search:
        term = normalize_name(search)
        if term is None or term == "":
            term = ""

        query = (
            billing_ref.order_by("patient_name_lower")
            .start_at([term])
            .end_at([f"{term}\uf8ff"])
        )
    else:
        query = billing_ref.order_by("created_at", direction="DESCENDING")

    if cursor:
        cursor_doc = billing_ref.document(cursor).get()
        if cursor_doc.exists:
            query = query.start_after(cursor_doc)

    query = query.limit(limit + 1)

    docs = list(query.stream())
    has_next = len(docs) > limit
    selected_docs = docs[:limit] if has_next else docs

    billings = [normalize_doc(doc) for doc in selected_docs]

    next_cursor = selected_docs[-1].id if has_next and selected_docs else None

    stats = get_dashboard_stats()
    total = int(stats.get("total_billing", 0) or 0)

    return {
        "billings": billings,
        "limit": limit,
        "next_cursor": next_cursor,
        "has_next": has_next,
        "total": total,
    }


@router.delete("/{billing_id}")
def delete_billing(billing_id: str):
    db = get_firestore()
    doc_ref = db.collection("billing").document(billing_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Billing record not found")

    doc_ref.delete()
    decrement_billing()

    return {"success": True}


# @router.get("/")
# def get_all_billing(
#     limit: int = Query(10, ge=1, le=100),
#     cursor: str | None = Query(None),
#     search: str | None = Query(None, min_length=1),
# ):
#     start_total = time.time()
#
#     t0 = time.time()
#     db = get_firestore()
#     billing_ref = db.collection("billing")
#     print(f"[TIME] Billing DB init: {time.time() - t0:.4f}s")
#
#     def normalize_doc(doc):
#         d = doc.to_dict() or {}
#         return {
#             "id": doc.id,
#             "patient_name": d.get("patient_name"),
#             "phone_number": d.get("phone_number"),
#             "pet_name": d.get("pet_name"),
#             "address": d.get("address"),
#             "date": d.get("date"),
#             "total_amount": d.get("total_amount", 0),
#         }
#
#     t1 = time.time()
#     if search:
#         term = normalize_name(search) or ""
#         query = (
#             billing_ref.order_by("patient_name_lower")
#             .start_at([term])
#             .end_at([f"{term}\uf8ff"])
#         )
#         count_query = query
#     else:
#         query = billing_ref.order_by("created_at", direction="DESCENDING")
#         count_query = billing_ref
#     print(f"[TIME] Billing query build: {time.time() - t1:.4f}s")
#
#     t2 = time.time()
#     if cursor:
#         cursor_doc = billing_ref.document(cursor).get()
#         if cursor_doc.exists:
#             query = query.start_after(cursor_doc)
#     print(f"[TIME] Billing cursor handling: {time.time() - t2:.4f}s")
#
#     query = query.limit(limit + 1)
#
#     t3 = time.time()
#     docs = list(query.stream())
#     print(f"[TIME] Billing DB fetch (stream): {time.time() - t3:.4f}s")
#
#     has_next = len(docs) > limit
#     selected_docs = docs[:limit] if has_next else docs
#
#     t4 = time.time()
#     billings = [normalize_doc(doc) for doc in selected_docs]
#     print(f"[TIME] Billing normalize: {time.time() - t4:.4f}s")
#
#     next_cursor = selected_docs[-1].id if has_next and selected_docs else None
#
#     t5 = time.time()
#     total = 0
#     try:
#         count_agg = count_query.count()
#         count_snapshot = count_agg.get()
#         if count_snapshot:
#             total = int(count_snapshot[0].value)
#     except Exception:
#         total = sum(1 for _ in count_query.stream())
#     print(f"[TIME] Billing count query: {time.time() - t5:.4f}s")
#
#     print(f"[TIME] Billing TOTAL API: {time.time() - start_total:.4f}s")
#
#     return {
#         "billings": billings,
#         "limit": limit,
#         "next_cursor": next_cursor,
#         "has_next": has_next,
#         "total": total,
#     }


@router.get("/{billing_id}")
def get_billing_by_id(billing_id: str):
    db = get_firestore()
    doc_ref = db.collection("billing").document(billing_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Billing record not found")

    billing_data = doc.to_dict() or {}
    billing_data["id"] = doc.id

    return {"billing": billing_data}
