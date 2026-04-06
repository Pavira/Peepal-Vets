from __future__ import annotations

import io
from datetime import UTC, date, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.firebase import get_firestore

router = APIRouter()


REPORT_COLUMNS = [
    ("Owner Name", "customerName"),
    ("Phone Number", "phone"),
    ("Pet Name", "petName"),
    ("Pet Type", "petType"),
    ("Appointment Date", "date"),
    ("Doctor Fee", "doctorFee"),
    ("Status", "status"),
]


def _parse_iso_date(value: str | None, field_name: str) -> date | None:
    if value is None:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(
            status_code=422, detail=f"Invalid {field_name}. Expected YYYY-MM-DD."
        ) from exc


def _build_filters(from_date: date | None, to_date: date | None):
    filters: list[tuple[str, str, str]] = []
    if from_date:
        filters.append(("date", ">=", from_date.isoformat()))
    if to_date:
        filters.append(("date", "<=", to_date.isoformat()))
    return filters


def _apply_filters(query, filters: list[tuple[str, str, str]]):
    for field_name, operator, value in filters:
        query = query.where(field_name, operator, value)
    return query


def _normalize_report_row(doc) -> dict[str, Any]:
    data = doc.to_dict() or {}
    return {
        "id": doc.id,
        "customerName": data.get("customerName") or "-",
        "phone": data.get("phone") or "-",
        "petName": data.get("petName") or "-",
        "petType": data.get("petType") or "-",
        "date": data.get("date") or "-",
        "doctorFee": data.get("doctorFee") or 0,
        "status": (data.get("status") or "active"),
    }


def _fetch_all_filtered_appointments(
    db, from_date: date | None, to_date: date | None
) -> list[dict[str, Any]]:
    filters = _build_filters(from_date, to_date)
    query = db.collection("appointments")
    query = _apply_filters(query, filters)
    query = query.order_by("date", direction="DESCENDING").order_by(
        "created_at", direction="DESCENDING"
    )

    docs = list(query.stream())
    return [_normalize_report_row(doc) for doc in docs]


def _date_range_label(from_date: date | None, to_date: date | None) -> str:
    if from_date and to_date:
        return f"{from_date.isoformat()} to {to_date.isoformat()}"
    if from_date:
        return f"From {from_date.isoformat()}"
    if to_date:
        return f"Up to {to_date.isoformat()}"
    return "All dates"


@router.get("/appointments")
def get_appointments_report(
    from_date: str | None = Query(default=None),
    to_date: str | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=100),
    cursor: str | None = Query(default=None),
):
    parsed_from = _parse_iso_date(from_date, "from_date")
    parsed_to = _parse_iso_date(to_date, "to_date")

    if parsed_from and parsed_to and parsed_from > parsed_to:
        raise HTTPException(
            status_code=422, detail="from_date must be less than or equal to to_date."
        )

    db = get_firestore()
    appointments_ref = db.collection("appointments")
    filters = _build_filters(parsed_from, parsed_to)

    query = _apply_filters(appointments_ref, filters)
    query = query.order_by("date", direction="DESCENDING").order_by(
        "created_at", direction="DESCENDING"
    )
    all_docs = list(query.stream())
    total = len(all_docs)

    start_idx = 0
    if cursor:
        for idx, doc in enumerate(all_docs):
            if doc.id == cursor:
                start_idx = idx + 1
                break

    docs = all_docs[start_idx : start_idx + limit + 1]
    has_next = len(docs) > limit
    selected_docs = docs[:limit]
    appointments = [_normalize_report_row(doc) for doc in selected_docs]
    next_cursor = selected_docs[-1].id if has_next and selected_docs else None

    return {
        "appointments": appointments,
        "limit": limit,
        "next_cursor": next_cursor,
        "has_next": has_next,
        "total": total,
    }


@router.get("/appointments/export/excel")
def export_appointments_report_excel(
    from_date: str | None = Query(default=None),
    to_date: str | None = Query(default=None),
):
    parsed_from = _parse_iso_date(from_date, "from_date")
    parsed_to = _parse_iso_date(to_date, "to_date")

    if parsed_from and parsed_to and parsed_from > parsed_to:
        raise HTTPException(
            status_code=422, detail="from_date must be less than or equal to to_date."
        )

    db = get_firestore()
    appointments = _fetch_all_filtered_appointments(db, parsed_from, parsed_to)
    date_range = _date_range_label(parsed_from, parsed_to)

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Appointments Report"

    sheet.append(["Appointments Report"])
    sheet.append([f"Date Range: {date_range}"])
    sheet.append([f"Total Appointments: {len(appointments)}"])
    sheet.append([])
    sheet.append([column_title for column_title, _ in REPORT_COLUMNS])

    for appointment in appointments:
        row = []
        for _, key in REPORT_COLUMNS:
            value = appointment.get(key)
            if key == "doctorFee":
                try:
                    value = float(value or 0)
                except (TypeError, ValueError):
                    value = 0
            row.append(value if value is not None else "-")
        sheet.append(row)

    for column_cells in sheet.columns:
        max_len = 0
        column_letter = column_cells[0].column_letter
        for cell in column_cells:
            value = "" if cell.value is None else str(cell.value)
            max_len = max(max_len, len(value))
        sheet.column_dimensions[column_letter].width = min(max(max_len + 2, 14), 40)

    output = io.BytesIO()
    workbook.save(output)
    output.seek(0)

    filename = f"appointments_report_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/appointments/export/pdf")
def export_appointments_report_pdf(
    from_date: str | None = Query(default=None),
    to_date: str | None = Query(default=None),
):
    parsed_from = _parse_iso_date(from_date, "from_date")
    parsed_to = _parse_iso_date(to_date, "to_date")

    if parsed_from and parsed_to and parsed_from > parsed_to:
        raise HTTPException(
            status_code=422, detail="from_date must be less than or equal to to_date."
        )

    db = get_firestore()
    appointments = _fetch_all_filtered_appointments(db, parsed_from, parsed_to)
    date_range = _date_range_label(parsed_from, parsed_to)
    generated_on = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC")

    output = io.BytesIO()
    doc = SimpleDocTemplate(
        output,
        pagesize=landscape(A4),
        rightMargin=24,
        leftMargin=24,
        topMargin=24,
        bottomMargin=24,
    )

    styles = getSampleStyleSheet()
    elements = [
        Paragraph("Appointments Report", styles["Title"]),
        Spacer(1, 8),
        Paragraph(f"Date Range: {date_range}", styles["Normal"]),
        Paragraph(f"Total Appointments: {len(appointments)}", styles["Normal"]),
        Paragraph(f"Generated On: {generated_on}", styles["Normal"]),
        Spacer(1, 12),
    ]

    table_data: list[list[str]] = [[column_title for column_title, _ in REPORT_COLUMNS]]
    if appointments:
        for appointment in appointments:
            table_data.append(
                [
                    str(appointment.get("customerName", "-")),
                    str(appointment.get("phone", "-")),
                    str(appointment.get("petName", "-")),
                    str(appointment.get("petType", "-")),
                    str(appointment.get("date", "-")),
                    str(appointment.get("doctorFee", 0)),
                    str(appointment.get("status", "active")),
                ]
            )
    else:
        table_data.append(["No appointments found", "", "", "", "", "", ""])

    table = Table(table_data, repeatRows=1)
    table_style_commands = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
    ]
    if not appointments:
        table_style_commands.extend(
            [
                ("SPAN", (0, 1), (-1, 1)),
                ("ALIGN", (0, 1), (-1, 1), "CENTER"),
            ]
        )
    table.setStyle(TableStyle(table_style_commands))

    elements.append(table)
    doc.build(elements)
    output.seek(0)

    filename = f"appointments_report_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}.pdf"
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
