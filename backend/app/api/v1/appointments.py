from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, logger

from app.core.firebase import get_firestore
from app.schemas.appointment import AppointmentCreate, AppointmentUpdate
from app.services.dashboard_stats_service import (
    apply_appointment_status_delta,
    decrement_revenue,
    get_dashboard_stats,
    increment_revenue,
    status_bucket,
)
from pathlib import Path

router = APIRouter()

VALID_STATUSES = {"active", "completed", "cancelled"}


def _normalize_fields(data: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for key, value in data.items():
        if isinstance(value, str):
            trimmed = value.strip()
            normalized[key] = trimmed if trimmed else None
        else:
            normalized[key] = value
    return normalized


def normalize_name(name: str | None) -> str | None:
    if name is None:
        return None
    stripped = " ".join(name.strip().split())
    return stripped.lower()


def _validate_status(status: Optional[str]) -> Optional[str]:
    if status is None:
        return None
    normalized = status.strip().lower()
    if normalized not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid appointment status")
    return normalized


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _duration_multiplier(unit: Optional[str]) -> float:
    normalized = (unit or "").strip().lower()
    if normalized == "weeks":
        return 7
    if normalized == "months":
        return 30
    if normalized == "year":
        return 365
    return 1


def _medicine_consumed_quantity(medicine: dict[str, Any]) -> float:
    timing = medicine.get("timing") or {}
    per_day = sum(_to_float(timing.get(slot), 0) for slot in ["M", "A", "E", "N"])
    duration = _to_float(medicine.get("duration"), 0)
    multiplier = _duration_multiplier(medicine.get("unit"))
    quantity = per_day * duration * multiplier
    return quantity if quantity > 0 else 0


def _reduce_drug_inventory(
    db, medicines: list[dict[str, Any]], appointment_date: Optional[str]
) -> None:
    if not medicines:
        return

    drugs_ref = db.collection("drugs")
    now = datetime.now(timezone.utc)

    for medicine in medicines:
        drug_name = (medicine.get("drugName") or "").strip()
        if not drug_name:
            continue

        quantity_to_reduce = _medicine_consumed_quantity(medicine)
        if quantity_to_reduce <= 0:
            continue

        matched_drugs = list(drugs_ref.where("name", "==", drug_name).limit(1).stream())
        if not matched_drugs:
            continue

        doc = matched_drugs[0]
        drug_doc_ref = drugs_ref.document(doc.id)
        drug_data = doc.to_dict() or {}

        current_quantity = _to_float(drug_data.get("presentQuantity"), 0)
        next_quantity = max(0, current_quantity - quantity_to_reduce)

        drug_doc_ref.update(
            {
                "presentQuantity": next_quantity,
                "updated_at": now,
            }
        )


@router.post("/")
def create_appointment(payload: AppointmentCreate):
    try:
        db = get_firestore()
        doc_ref = db.collection("appointments").document()

        appointment_data = _normalize_fields(payload.model_dump())
        appointment_data["customerId"] = payload.customerId.strip()
        appointment_data["customerName"] = payload.customerName.strip()
        appointment_data["customerName_lower"] = normalize_name(
            appointment_data["customerName"]
        )
        appointment_data["date"] = payload.date
        appointment_data["status"] = _validate_status(payload.status) or "active"
        appointment_data["scannedImages"] = appointment_data.get("scannedImages") or []

        customer_doc = (
            db.collection("customers").document(payload.customerId.strip()).get()
        )
        if customer_doc.exists:
            customer_data = customer_doc.to_dict() or {}
            appointment_data["customerName"] = (
                customer_data.get("name") or ""
            ).strip() or appointment_data["customerName"]
            appointment_data["customerName_lower"] = normalize_name(
                appointment_data["customerName"]
            )
            appointment_data["phone"] = customer_data.get(
                "phone"
            ) or appointment_data.get("phone")
            appointment_data["petName"] = customer_data.get(
                "petName"
            ) or appointment_data.get("petName")
            appointment_data["petAgeYears"] = customer_data.get("petAgeYears")
            appointment_data["petAgeMonths"] = customer_data.get("petAgeMonths")
            appointment_data["petType"] = customer_data.get(
                "petType"
            ) or appointment_data.get("petType")
            appointment_data["petSex"] = customer_data.get(
                "petSex"
            ) or appointment_data.get("petSex")
            appointment_data["petBreed"] = customer_data.get(
                "petBreed"
            ) or appointment_data.get("petBreed")
            appointment_data["address"] = customer_data.get(
                "address"
            ) or appointment_data.get("address")
            appointment_data["vaccinated"] = customer_data.get(
                "vaccinated"
            ) or appointment_data.get("vaccinated")
            appointment_data["deworming"] = customer_data.get(
                "deworming"
            ) or appointment_data.get("deworming")
            appointment_data["dewormingStartDate"] = customer_data.get(
                "dewormingStartDate"
            ) or appointment_data.get("dewormingStartDate")
            appointment_data["dewormingEndDate"] = customer_data.get(
                "dewormingNextDueDate"
            ) or appointment_data.get("dewormingEndDate")
            appointment_data["vaccinationStartDate"] = customer_data.get(
                "vaccinationStartDate"
            ) or appointment_data.get("vaccinationStartDate")
            appointment_data["vaccinationEndDate"] = customer_data.get(
                "vaccinationEndDate"
            ) or appointment_data.get("vaccinationEndDate")

        now = datetime.now(timezone.utc)
        doc_ref.set(
            {
                "id": doc_ref.id,
                **appointment_data,
                "created_at": now,
                "updated_at": None,
            }
        )
        apply_appointment_status_delta(None, appointment_data["status"])
        if status_bucket(appointment_data["status"]) == "completed":
            increment_revenue(_to_float(appointment_data.get("doctorFee"), 0))

        return {"success": True, "appointment_id": doc_ref.id, "id": doc_ref.id}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@router.get("/")
def get_all_appointments(
    date: Optional[str] = Query(default=None),
    customer_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    minimal: bool = Query(default=False),
):
    db = get_firestore()
    base_query = db.collection("appointments")

    if minimal:
        base_query = base_query.select(
            [
                "customerId",
                "customerName",
                "phone",
                "petName",
                "petAgeYears",
                "petAgeMonths",
                "petType",
                "petBreed",
                "petSex",
                "vaccinated",
                "vaccinationStartDate",
                "vaccinationEndDate",
                "deworming",
                "date",
                "time",
                "status",
                "created_at",
            ]
        )

    query = base_query.order_by("created_at", direction="DESCENDING")

    if date:
        query = query.where("date", "==", date)
    if customer_id:
        query = query.where("customerId", "==", customer_id)
    if status:
        normalized_status = _validate_status(status)
        query = query.where("status", "==", normalized_status)

    docs = query.stream()
    appointments = []
    for doc in docs:
        appointment_data = doc.to_dict() or {}
        appointment_data["id"] = doc.id
        appointments.append(appointment_data)
    stats = get_dashboard_stats()
    return {
        "appointments": appointments,
        "total_appointments_active": int(
            stats.get("total_appointments_active", 0) or 0
        ),
        "total_appointments_completed": int(
            stats.get("total_appointments_completed", 0) or 0
        ),
        "total_appointments_cancelled": int(
            stats.get("total_appointments_cancelled", 0) or 0
        ),
    }


# @router.get("/")
# def get_all_appointments(
#     date: Optional[str] = Query(default=None),
#     customer_id: Optional[str] = Query(default=None),
#     status: Optional[str] = Query(default=None),
#     minimal: bool = Query(default=False),
#     limit: int = Query(10, ge=1, le=100),
#     cursor: str | None = Query(None),
#     search: str | None = Query(None, min_length=1),
# ):
#     start_total = time.time()
#
#     t0 = time.time()
#     db = get_firestore()
#     base_query = db.collection("appointments")
#     print(f"[TIME] Appointments DB init: {time.time() - t0:.4f}s")
#
#     if minimal:
#         base_query = base_query.select(
#             [
#                 "customerId",
#                 "customerName",
#                 "phone",
#                 "petName",
#                 "petAgeYears",
#                 "petAgeMonths",
#                 "petType",
#                 "petBreed",
#                 "petSex",
#                 "vaccinated",
#                 "vaccinationStartDate",
#                 "vaccinationEndDate",
#                 "deworming",
#                 "date",
#                 "time",
#                 "status",
#                 "created_at",
#             ]
#         )
#
#     t1 = time.time()
#     if search:
#         term = normalize_name(search) or ""
#         query = (
#             base_query.order_by("customerName_lower")
#             .start_at([term])
#             .end_at([f"{term}\uf8ff"])
#         )
#     else:
#         query = base_query.order_by("created_at", direction="DESCENDING")
#
#     if date:
#         query = query.where("date", "==", date)
#     if customer_id:
#         query = query.where("customerId", "==", customer_id)
#     if status:
#         normalized_status = _validate_status(status)
#         query = query.where("status", "==", normalized_status)
#
#     count_query = query
#     print(f"[TIME] Appointments query build: {time.time() - t1:.4f}s")
#
#     t2 = time.time()
#     appointments_ref = db.collection("appointments")
#     if cursor:
#         cursor_doc = appointments_ref.document(cursor).get()
#         if cursor_doc.exists:
#             query = query.start_after(cursor_doc)
#     print(f"[TIME] Appointments cursor handling: {time.time() - t2:.4f}s")
#
#     query = query.limit(limit + 1)
#
#     t3 = time.time()
#     docs = list(query.stream())
#     print(f"[TIME] Appointments DB fetch (stream): {time.time() - t3:.4f}s")
#
#     has_next = len(docs) > limit
#     selected_docs = docs[:limit] if has_next else docs
#
#     t4 = time.time()
#     appointments = []
#     for doc in selected_docs:
#         appointment_data = doc.to_dict() or {}
#         appointment_data["id"] = doc.id
#         appointments.append(appointment_data)
#     print(f"[TIME] Appointments normalize: {time.time() - t4:.4f}s")
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
#     print(f"[TIME] Appointments count query: {time.time() - t5:.4f}s")
#
#     print(f"[TIME] Appointments TOTAL API: {time.time() - start_total:.4f}s")
#
#     return {
#         "appointments": appointments,
#         "limit": limit,
#         "next_cursor": next_cursor,
#         "has_next": has_next,
#         "total": total,
#     }


@router.get("/{appointment_id}")
def get_appointment_by_id(appointment_id: str):
    db = get_firestore()
    doc_ref = db.collection("appointments").document(appointment_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Appointment not found")

    appointment_data = doc.to_dict() or {}
    appointment_data["id"] = doc.id
    return {"appointment": appointment_data}


@router.put("/{appointment_id}")
def update_appointment(appointment_id: str, payload: AppointmentUpdate):
    db = get_firestore()
    doc_ref = db.collection("appointments").document(appointment_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Appointment not found")

    existing_data = doc.to_dict() or {}
    update_data = payload.model_dump(exclude_unset=True)
    update_data = _normalize_fields(update_data)

    if "status" in update_data:
        update_data["status"] = _validate_status(update_data["status"])

    if "customerId" in update_data and not update_data["customerId"]:
        raise HTTPException(status_code=422, detail="Customer is required")

    if "customerName" in update_data and not update_data["customerName"]:
        raise HTTPException(status_code=422, detail="Customer name is required")
    if "customerName" in update_data and update_data["customerName"]:
        update_data["customerName_lower"] = normalize_name(update_data["customerName"])

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided for update")

    current_status = (existing_data.get("status") or "active").strip().lower()
    next_status = update_data.get("status", current_status)
    if next_status == "completed" and current_status != "completed":
        medicines = update_data.get("medicines", existing_data.get("medicines") or [])
        appointment_date = update_data.get("date", existing_data.get("date"))
        _reduce_drug_inventory(db, medicines, appointment_date)

    old_bucket = status_bucket(current_status)
    new_bucket = status_bucket(next_status)
    old_fee = _to_float(existing_data.get("doctorFee"), 0)
    new_fee = _to_float(update_data.get("doctorFee", old_fee), old_fee)

    update_data["updated_at"] = datetime.now(timezone.utc)
    doc_ref.update(update_data)

    apply_appointment_status_delta(current_status, next_status)

    if old_bucket == "completed" and new_bucket == "completed":
        diff = new_fee - old_fee
        if diff > 0:
            increment_revenue(diff)
        elif diff < 0:
            decrement_revenue(abs(diff))
    elif old_bucket != "completed" and new_bucket == "completed":
        increment_revenue(new_fee)
    elif old_bucket == "completed" and new_bucket != "completed":
        decrement_revenue(old_fee)

    return {"success": True}


@router.patch("/{appointment_id}/status")
def update_appointment_status(appointment_id: str, status: str = Query(...)):
    db = get_firestore()
    doc_ref = db.collection("appointments").document(appointment_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Appointment not found")

    current_data = doc.to_dict() or {}
    current_status = (current_data.get("status") or "active").strip().lower()
    new_status = _validate_status(status)

    if new_status == current_status:
        return {"success": True, "message": "Status unchanged"}

    update_payload = {"status": new_status, "updated_at": datetime.now(timezone.utc)}

    if new_status == "completed" and current_status != "completed":
        medicines = current_data.get("medicines", [])
        appointment_date = current_data.get("date")
        _reduce_drug_inventory(db, medicines, appointment_date)

    doc_ref.update(update_payload)
    apply_appointment_status_delta(current_status, new_status)

    fee = _to_float(current_data.get("doctorFee"), 0)
    old_bucket = status_bucket(current_status)
    new_bucket = status_bucket(new_status)
    if old_bucket != "completed" and new_bucket == "completed":
        increment_revenue(fee)
    elif old_bucket == "completed" and new_bucket != "completed":
        decrement_revenue(fee)

    return {"success": True, "status": new_status}


@router.delete("/{appointment_id}")
def delete_appointment(appointment_id: str):
    db = get_firestore()
    doc_ref = db.collection("appointments").document(appointment_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Appointment not found")

    existing_data = doc.to_dict() or {}
    existing_status = existing_data.get("status")
    existing_fee = _to_float(existing_data.get("doctorFee"), 0)

    doc_ref.delete()
    apply_appointment_status_delta(existing_status, None)
    if status_bucket(existing_status) == "completed":
        decrement_revenue(existing_fee)

    return {"success": True}


# @router.get("/{appointment_id}/pdf")
# async def get_appointment_pdf(appointment_id: str, download: bool = False):
#     """
#     Generate and return PDF for an appointment using WeasyPrint

#     Args:
#         appointment_id: The appointment document ID

#     Returns:
#         PDF file as bytes
#     """
#     try:
#         from fastapi.responses import StreamingResponse
#         from jinja2 import Environment, FileSystemLoader
#         from weasyprint import HTML, CSS

#         db = get_firestore()
#         doc_ref = db.collection("appointments").document(appointment_id)
#         doc = doc_ref.get()

#         if not doc.exists:
#             raise HTTPException(status_code=404, detail="Appointment not found")

#         appointment_data = doc.to_dict() or {}

#         # Setup Jinja2 environment with absolute path
#         backend_root = Path(__file__).resolve().parents[3]
#         template_dir = backend_root / "app" / "template"
#         template_name = "peepalvets.html"

#         if not (template_dir / template_name).exists():
#             raise HTTPException(
#                 status_code=500,
#                 detail=f"Template not found: {template_name} in {template_dir}",
#             )

#         env = Environment(loader=FileSystemLoader(str(template_dir)))
#         template = env.get_template(template_name)

#         # Render HTML from Jinja2 template
#         html_content = template.render(appointment_data=appointment_data)

#         # Get CSS
#         css_path = template_dir / "peepalvets.css"
#         css = CSS(string=css_path.read_text(encoding="utf-8"))

#         # Generate PDF using WeasyPrint
#         pdf_bytes = HTML(string=html_content).write_pdf(stylesheets=[css])

#         filename = f"appointment_{appointment_data.get('id', 'document')}.pdf"
#         disposition = "attachment" if download else "inline"

#         # Return PDF
#         return StreamingResponse(
#             iter([pdf_bytes]),
#             media_type="application/pdf",
#             headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
#         )

#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"Error generating PDF: {str(e)}")
#         raise HTTPException(status_code=500, detail=f"Error generating PDF: {str(e)}")
