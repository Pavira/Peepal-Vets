from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query

from app.core.firebase import get_firestore
from app.schemas.drug import (
    DrugCreate,
    DrugEntryCreate,
    DrugQuantityAdjustmentCreate,
    DrugNameUpdate,
    DrugTemplateCreate,
)
from app.services.dashboard_stats_service import (
    decrement_drugs,
    get_dashboard_stats,
    increment_drugs,
)

router = APIRouter()


def _normalize_number(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def normalize_name(name: str | None) -> str | None:
    if name is None:
        return None
    cleaned = " ".join(name.strip().split())
    return cleaned.lower()


def _build_history_entry(
    date: str,
    quantity: float,
    price: float,
    gst_percent: float = 0,
) -> dict[str, Any]:
    qty = _normalize_number(quantity)
    unit_price = _normalize_number(price)
    gst_value = _normalize_number(gst_percent)
    base_amount = qty * unit_price
    gst_amount = base_amount * gst_value / 100
    return {
        "id": f"entry_{uuid4().hex}",
        "date": date,
        "entryType": "stock_entry",
        "quantity": qty,
        "price": unit_price,
        "gstPercent": gst_value,
        "baseAmount": base_amount,
        "gstAmount": gst_amount,
        "totalBill": base_amount + gst_amount,
        "reason": "Stock purchase",
        # "remark": "",
    }


def _build_adjustment_entry(
    date: str,
    adjustment_type: str,
    quantity: float,
    reason: str,
    # remark: str | None,
) -> dict[str, Any]:
    normalized_adjustment = (adjustment_type or "").strip().lower()
    qty = _normalize_number(quantity)
    signed_quantity = qty if normalized_adjustment == "add" else -qty

    return {
        "id": f"entry_{uuid4().hex}",
        "date": date,
        "entryType": "adjustment",
        "adjustmentType": normalized_adjustment,
        "quantity": signed_quantity,
        "price": 0,
        "gstPercent": 0,
        "baseAmount": 0,
        "gstAmount": 0,
        "totalBill": 0,
        "reason": (reason or "").strip(),
        # "remark": (remark or "").strip(),
    }


def _recalculate_drug_fields(drug_data: dict[str, Any]) -> dict[str, Any]:
    history = drug_data.get("history") or []
    present_quantity = sum(
        _normalize_number(entry.get("quantity")) for entry in history
    )
    if present_quantity < 0:
        present_quantity = 0
    total_bill = sum(_normalize_number(entry.get("totalBill")) for entry in history)

    purchase_entries = [
        entry
        for entry in history
        if _normalize_number(entry.get("price")) > 0
        or entry.get("entryType") == "stock_entry"
    ]
    latest_purchase_entry = purchase_entries[0] if purchase_entries else None
    oldest_purchase_entry = purchase_entries[-1] if purchase_entries else None

    return {
        **drug_data,
        "presentQuantity": present_quantity,
        "totalBill": total_bill,
        "latestPrice": (
            _normalize_number(latest_purchase_entry.get("price"))
            if latest_purchase_entry
            else 0
        ),
        "lastAddedDate": (
            latest_purchase_entry.get("date") if latest_purchase_entry else None
        ),
        "addedOn": (
            oldest_purchase_entry.get("date")
            if oldest_purchase_entry
            else drug_data.get("addedOn")
        ),
    }


@router.post("/")
def create_drug(payload: DrugCreate):
    try:
        db = get_firestore()
        drugs_ref = db.collection("drugs")

        name = payload.name.strip()
        existing = list(drugs_ref.where("name", "==", name).stream())
        if existing:
            raise HTTPException(status_code=400, detail="Drug name already exists")

        now = datetime.now(timezone.utc)
        doc_ref = drugs_ref.document()

        entry = _build_history_entry(
            payload.date,
            payload.quantity,
            payload.price,
            payload.gstPercent,
        )
        doc_ref.set(
            {
                "id": doc_ref.id,
                "name": name,
                "name_lower": normalize_name(name),
                "addedOn": payload.date,
                "lastAddedDate": payload.date,
                "presentQuantity": entry["quantity"],
                "latestPrice": entry["price"],
                "totalBill": entry["totalBill"],
                "history": [entry],
                "created_at": now,
                "updated_at": None,
            }
        )
        increment_drugs()

        return {"success": True, "drug_id": doc_ref.id, "id": doc_ref.id}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@router.get("/")
def get_all_drugs(
    limit: int = Query(10, ge=1, le=100),
    cursor: str | None = Query(None),
    search: str | None = Query(None),
):
    db = get_firestore()
    drugs_ref = db.collection("drugs")

    term = normalize_name(search) if search else None
    if term:
        query = (
            drugs_ref.order_by("name_lower").start_at([term]).end_at([f"{term}\uf8ff"])
        )
    else:
        query = drugs_ref.order_by("created_at", direction="DESCENDING")

    if cursor:
        cursor_doc = drugs_ref.document(cursor).get()
        if cursor_doc.exists:
            query = query.start_after(cursor_doc)

    query = query.limit(limit + 1)

    docs = list(query.stream())
    has_next = len(docs) > limit
    selected_docs = docs[:limit] if has_next else docs

    drugs = []
    for doc in selected_docs:
        drug_data = doc.to_dict() or {}
        drug_data["id"] = doc.id
        drugs.append(drug_data)

    next_cursor = selected_docs[-1].id if has_next and selected_docs else None

    stats = get_dashboard_stats()
    total = int(stats.get("total_drugs", 0) or 0)

    return {
        "drugs": drugs,
        "limit": limit,
        "next_cursor": next_cursor,
        "has_next": has_next,
        "total": total,
    }


# @router.get("/")
# def get_all_drugs(
#     limit: int = Query(10, ge=1, le=100),
#     cursor: str | None = Query(None),
#     search: str | None = Query(None),
# ):
#     start_total = time.time()
#
#     t0 = time.time()
#     db = get_firestore()
#     drugs_ref = db.collection("drugs")
#     print(f"[TIME] Drugs DB init: {time.time() - t0:.4f}s")
#
#     t1 = time.time()
#     term = normalize_name(search) if search else None
#     if term:
#         query = (
#             drugs_ref.order_by("name_lower").start_at([term]).end_at([f"{term}\uf8ff"])
#         )
#         count_query = query
#     else:
#         query = drugs_ref.order_by("created_at", direction="DESCENDING")
#         count_query = drugs_ref
#     print(f"[TIME] Drugs query build: {time.time() - t1:.4f}s")
#
#     t2 = time.time()
#     if cursor:
#         cursor_doc = drugs_ref.document(cursor).get()
#         if cursor_doc.exists:
#             query = query.start_after(cursor_doc)
#     print(f"[TIME] Drugs cursor handling: {time.time() - t2:.4f}s")
#
#     query = query.limit(limit + 1)
#
#     t3 = time.time()
#     docs = list(query.stream())
#     print(f"[TIME] Drugs DB fetch (stream): {time.time() - t3:.4f}s")
#
#     has_next = len(docs) > limit
#     selected_docs = docs[:limit] if has_next else docs
#
#     t4 = time.time()
#     drugs = []
#     for doc in selected_docs:
#         drug_data = doc.to_dict() or {}
#         drug_data["id"] = doc.id
#         drugs.append(drug_data)
#     print(f"[TIME] Drugs normalize: {time.time() - t4:.4f}s")
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
#     print(f"[TIME] Drugs count query: {time.time() - t5:.4f}s")
#
#     print(f"[TIME] Drugs TOTAL API: {time.time() - start_total:.4f}s")
#
#     return {
#         "drugs": drugs,
#         "limit": limit,
#         "next_cursor": next_cursor,
#         "has_next": has_next,
#         "total": total,
#     }


@router.get("/name-quantity")
def get_drug_name_and_quantity(
    search: str | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
):
    db = get_firestore()
    drugs_ref = db.collection("drugs")

    term = normalize_name(search) if search else None

    if term:
        query = (
            drugs_ref.order_by("name_lower").start_at([term]).end_at([f"{term}\uf8ff"])
        )
    else:
        query = drugs_ref.order_by("created_at", direction="DESCENDING")

    query = query.limit(limit)
    docs = list(query.stream())

    drugs = []
    for doc in docs:
        drug_data = doc.to_dict() or {}
        drugs.append(
            {
                "id": doc.id,
                "name": drug_data.get("name", ""),
                "presentQuantity": drug_data.get("presentQuantity", 0),
            }
        )

    return {"drugs": drugs}


@router.get("/{drug_id}")
def get_drug_by_id(drug_id: str):
    db = get_firestore()
    doc_ref = db.collection("drugs").document(drug_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Drug not found")

    drug_data = doc.to_dict() or {}
    drug_data["id"] = doc.id
    return {"drug": drug_data}


@router.put("/{drug_id}/name")
def update_drug_name(drug_id: str, payload: DrugNameUpdate):
    db = get_firestore()
    drugs_ref = db.collection("drugs")
    doc_ref = drugs_ref.document(drug_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Drug not found")

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Drug name is required")
    existing = list(drugs_ref.where("name", "==", name).stream())
    if any(match.id != drug_id for match in existing):
        raise HTTPException(status_code=400, detail="Drug name already exists")

    doc_ref.update(
        {
            "name": name,
            "name_lower": normalize_name(name),
            "updated_at": datetime.now(timezone.utc),
        }
    )
    return {"success": True}


@router.post("/{drug_id}/entries")
def add_drug_entry(drug_id: str, payload: DrugEntryCreate):
    db = get_firestore()
    doc_ref = db.collection("drugs").document(drug_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Drug not found")

    current = doc.to_dict() or {}
    history = current.get("history") or []
    entry = _build_history_entry(
        payload.date,
        payload.quantity,
        payload.price,
        payload.gstPercent,
    )
    updated_history = [entry, *history]

    updated = _recalculate_drug_fields({**current, "history": updated_history})
    updated["updated_at"] = datetime.now(timezone.utc)

    doc_ref.update(
        {
            "history": updated["history"],
            "presentQuantity": updated["presentQuantity"],
            "totalBill": updated["totalBill"],
            "latestPrice": updated["latestPrice"],
            "lastAddedDate": updated["lastAddedDate"],
            "addedOn": updated["addedOn"],
            "updated_at": updated["updated_at"],
        }
    )
    return {"success": True}


@router.post("/{drug_id}/adjustments")
def adjust_drug_quantity(drug_id: str, payload: DrugQuantityAdjustmentCreate):
    db = get_firestore()
    doc_ref = db.collection("drugs").document(drug_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Drug not found")

    current = doc.to_dict() or {}
    history = current.get("history") or []
    current_quantity = _normalize_number(current.get("presentQuantity"))

    adjustment_type = payload.adjustmentType.strip().lower()
    adjustment_quantity = _normalize_number(payload.quantity)
    if adjustment_type == "reduce" and adjustment_quantity > current_quantity:
        raise HTTPException(
            status_code=400,
            detail="Insufficient stock to reduce the requested quantity",
        )

    reason = payload.reason.strip()
    # if not reason:
    #     raise HTTPException(status_code=422, detail="Reason is required")

    entry = _build_adjustment_entry(
        payload.date,
        adjustment_type,
        adjustment_quantity,
        reason,
        # payload.remark,
    )

    updated_history = [entry, *history]
    updated = _recalculate_drug_fields({**current, "history": updated_history})
    updated["updated_at"] = datetime.now(timezone.utc)

    doc_ref.update(
        {
            "history": updated["history"],
            "presentQuantity": updated["presentQuantity"],
            "totalBill": updated["totalBill"],
            "latestPrice": updated["latestPrice"],
            "lastAddedDate": updated["lastAddedDate"],
            "addedOn": updated["addedOn"],
            "updated_at": updated["updated_at"],
        }
    )
    return {"success": True}


@router.delete("/{drug_id}/entries/{entry_id}")
def delete_drug_entry(drug_id: str, entry_id: str):
    db = get_firestore()
    doc_ref = db.collection("drugs").document(drug_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Drug not found")

    current = doc.to_dict() or {}
    history = current.get("history") or []
    updated_history = [entry for entry in history if entry.get("id") != entry_id]
    if len(updated_history) == len(history):
        raise HTTPException(status_code=404, detail="History entry not found")

    updated = _recalculate_drug_fields({**current, "history": updated_history})
    updated["updated_at"] = datetime.now(timezone.utc)

    doc_ref.update(
        {
            "history": updated["history"],
            "presentQuantity": updated["presentQuantity"],
            "totalBill": updated["totalBill"],
            "latestPrice": updated["latestPrice"],
            "lastAddedDate": updated["lastAddedDate"],
            "addedOn": updated["addedOn"],
            "updated_at": updated["updated_at"],
        }
    )
    return {"success": True}


@router.delete("/{drug_id}")
def delete_drug(drug_id: str):
    db = get_firestore()
    doc_ref = db.collection("drugs").document(drug_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Drug not found")

    doc_ref.delete()
    decrement_drugs()
    return {"success": True}


@router.post("/manage/templates")
def create_drug_template(payload: DrugTemplateCreate):
    try:
        db = get_firestore()
        templates_ref = db.collection("drug_templates")
        name = payload.templateName.strip()
        if not name:
            raise HTTPException(status_code=422, detail="Template name is required")

        existing = list(
            templates_ref.where("templateName", "==", name).limit(1).stream()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Template name already exists")

        now = datetime.now(timezone.utc)
        doc_ref = templates_ref.document()
        doc_ref.set(
            {
                "id": doc_ref.id,
                "templateName": name,
                "medicines": payload.medicines or [],
                "created_at": now,
                "updated_at": None,
            }
        )
        return {"success": True, "template_id": doc_ref.id, "id": doc_ref.id}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@router.get("/manage/templates")
def get_all_drug_templates():
    db = get_firestore()
    docs = (
        db.collection("drug_templates")
        .select(["templateName", "medicines", "created_at"])
        .order_by("created_at", direction="DESCENDING")
        .stream()
    )

    templates = []
    for doc in docs:
        item = doc.to_dict() or {}
        item["id"] = doc.id
        templates.append(item)

    return {"templates": templates}


@router.get("/manage/templates/{template_id}")
def get_drug_template_by_id(template_id: str):
    db = get_firestore()
    doc_ref = db.collection("drug_templates").document(template_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Template not found")
    template = doc.to_dict() or {}
    template["id"] = doc.id
    return {"template": template}


@router.delete("/manage/templates/{template_id}")
def delete_drug_template(template_id: str):
    db = get_firestore()
    doc_ref = db.collection("drug_templates").document(template_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Template not found")
    doc_ref.delete()
    return {"success": True}
