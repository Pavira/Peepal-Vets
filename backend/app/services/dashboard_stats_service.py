from __future__ import annotations

from datetime import datetime
from typing import Any

from google.api_core.exceptions import NotFound
from google.cloud.firestore import Increment

from app.core.firebase import get_firestore


DEFAULT_DASHBOARD_STATS = {
    "total_customers": 0,
    "total_drugs": 0,
    "total_revenue": 0,
    "total_billing": 0,
    "total_appointments_active": 0,
    "total_appointments_completed": 0,
    "total_appointments_cancelled": 0,
}


def _stats_doc_ref():
    db = get_firestore()
    return db.collection("metadata").document("dashboard")


def _ensure_dashboard_doc() -> None:
    doc_ref = _stats_doc_ref()
    snapshot = doc_ref.get()
    if not snapshot.exists:
        doc_ref.set(
            {
                **DEFAULT_DASHBOARD_STATS,
                # "updated_at": datetime.utcnow(),
            }
        )
        return

    existing = snapshot.to_dict() or {}
    missing_fields = {
        key: value
        for key, value in DEFAULT_DASHBOARD_STATS.items()
        if key not in existing
    }
    if missing_fields:
        doc_ref.set(
            {
                **missing_fields,
                # "updated_at": datetime.utcnow(),
            },
            merge=True,
        )


def _increment(field_name: str, value: float | int) -> None:
    if not value:
        return

    doc_ref = _stats_doc_ref()
    payload = {
        field_name: Increment(value),
        # "updated_at": datetime.utcnow(),
    }
    try:
        doc_ref.update(payload)
    except NotFound:
        _ensure_dashboard_doc()
        doc_ref.update(payload)


def _normalize_appointment_status(status: str | None) -> str:
    normalized = (status or "active").strip().lower()
    if normalized in {"active", "completed", "cancelled"}:
        return normalized
    return "active"


def get_dashboard_stats() -> dict[str, Any]:
    _ensure_dashboard_doc()
    doc = _stats_doc_ref().get()
    if not doc.exists:
        return {
            **DEFAULT_DASHBOARD_STATS,
            "total_appointments": 0,
        }

    data = doc.to_dict() or {}
    stats = {**DEFAULT_DASHBOARD_STATS, **data}
    legacy_closed = int(stats.get("total_appointments_closed", 0) or 0)
    if legacy_closed:
        stats["total_appointments_completed"] = (
            int(stats.get("total_appointments_completed", 0) or 0) + legacy_closed
        )
    stats["total_appointments"] = (
        int(stats.get("total_appointments_active", 0) or 0)
        + int(stats.get("total_appointments_completed", 0) or 0)
        + int(stats.get("total_appointments_cancelled", 0) or 0)
    )
    return stats


def increment_customers() -> None:
    _increment("total_customers", 1)


def decrement_customers() -> None:
    _increment("total_customers", -1)


def increment_drugs() -> None:
    _increment("total_drugs", 1)


def decrement_drugs() -> None:
    _increment("total_drugs", -1)


# def update_drug_quantity(delta_quantity: int | int) -> None:
#     _increment("total_drugs", delta_quantity)


def increment_active_appointments() -> None:
    _increment("total_appointments_active", 1)


def decrement_active_appointments() -> None:
    _increment("total_appointments_active", -1)


def increment_completed_appointments() -> None:
    _increment("total_appointments_completed", 1)


def decrement_completed_appointments() -> None:
    _increment("total_appointments_completed", -1)


def increment_cancelled_appointments() -> None:
    _increment("total_appointments_cancelled", 1)


def decrement_cancelled_appointments() -> None:
    _increment("total_appointments_cancelled", -1)


def increment_revenue(amount: float | int) -> None:
    _increment("total_revenue", abs(float(amount or 0)))


def decrement_revenue(amount: float | int) -> None:
    _increment("total_revenue", -abs(float(amount or 0)))


def increment_billing() -> None:
    _increment("total_billing", 1)


def decrement_billing() -> None:
    _increment("total_billing", -1)


def apply_appointment_status_delta(
    old_status: str | None, new_status: str | None
) -> None:
    previous = (
        _normalize_appointment_status(old_status) if old_status is not None else None
    )
    current = (
        _normalize_appointment_status(new_status) if new_status is not None else None
    )

    if previous == current:
        return

    if previous == "active":
        decrement_active_appointments()
    elif previous == "completed":
        decrement_completed_appointments()
    elif previous == "cancelled":
        decrement_cancelled_appointments()

    if current == "active":
        increment_active_appointments()
    elif current == "completed":
        increment_completed_appointments()
    elif current == "cancelled":
        increment_cancelled_appointments()


def status_bucket(status: str | None) -> str:
    return _normalize_appointment_status(status)


# Backward-compatible aliases.
def increment_closed_appointments() -> None:
    increment_completed_appointments()


def decrement_closed_appointments() -> None:
    decrement_completed_appointments()


def rebuild_dashboard_stats() -> dict[str, Any]:
    db = get_firestore()

    total_customers = 0
    for _ in db.collection("customers").stream():
        total_customers += 1

    total_drugs = 0
    for _ in db.collection("drugs").stream():
        total_drugs += 1

    total_billing = 0
    for _ in db.collection("billing").stream():
        total_billing += 1

    total_revenue = 0.0
    total_active = 0
    total_completed = 0
    total_cancelled = 0
    for doc in db.collection("appointments").stream():
        data = doc.to_dict() or {}
        bucket = status_bucket(data.get("status"))
        if bucket == "active":
            total_active += 1
        elif bucket == "completed":
            total_completed += 1
            try:
                total_revenue += float(data.get("doctorFee", 0) or 0)
            except (TypeError, ValueError):
                pass
        elif bucket == "cancelled":
            total_cancelled += 1

    rebuilt = {
        "total_customers": int(total_customers),
        "total_drugs": int(total_drugs),
        "total_revenue": float(total_revenue),
        "total_billing": int(total_billing),
        "total_appointments_active": int(total_active),
        "total_appointments_completed": int(total_completed),
        "total_appointments_cancelled": int(total_cancelled),
        # "updated_at": datetime.utcnow(),
    }

    _stats_doc_ref().set(rebuilt, merge=True)
    return get_dashboard_stats()
