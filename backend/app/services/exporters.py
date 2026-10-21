"""PDF and iCalendar exports for a saved timetable."""
from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta, timezone
from html import escape
from io import BytesIO
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models.schemas import Project
from app.services import rules


class ExportInputError(ValueError):
    """The requested export options are invalid."""


class ExportDataError(ValueError):
    """The saved project does not contain a timetable that can be exported."""


def filename(project_name: str, extension: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9_-]+", "-", project_name).strip("-_").lower() or "timetable"
    return f"{stem}.{extension}"


def _ready_entries(project: Project):
    if not project.timetable:
        raise ExportDataError("There is no saved timetable to export. Generate or save one first.")
    entries = rules.fill_slot_ids(project.timetable, project.data.slots)
    slots = {slot.id: slot for slot in project.data.slots}
    courses = {course.id: course for course in project.data.courses}
    faculty = {teacher.id: teacher for teacher in project.data.faculty}
    rooms = {room.id: room for room in project.data.rooms}
    positions = {slot.id: index for index, slot in enumerate(rules.sort_slots(project.data.slots))}

    for entry in entries:
        if entry.course_id not in courses:
            raise ExportDataError(f"Timetable entry {entry.id} refers to unknown course {entry.course_id}.")
        if entry.faculty_id not in faculty:
            raise ExportDataError(f"Timetable entry {entry.id} refers to unknown teacher {entry.faculty_id}.")
        if entry.room_id not in rooms:
            raise ExportDataError(f"Timetable entry {entry.id} refers to unknown room {entry.room_id}.")
        run = rules.slot_run(project.data.slots, entry.start_slot_id, entry.length_slots)
        if len(run) != entry.length_slots:
            raise ExportDataError(f"Timetable entry {entry.id} does not fit in consecutive time slots.")

    entries.sort(key=lambda entry: (positions.get(entry.start_slot_id, 10**9), entry.id))
    return entries, slots, courses, faculty, rooms


def build_pdf(project: Project) -> bytes:
    entries, slots, courses, faculty, rooms = _ready_entries(project)
    buffer = BytesIO()
    page_size = landscape(A4)
    document = SimpleDocTemplate(
        buffer,
        pagesize=page_size,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=18 * mm,
        title=f"{project.name} timetable",
        author="Slot Smith",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "TimetableTitle", parent=styles["Title"], alignment=TA_CENTER,
        textColor=colors.HexColor("#17324D"), fontSize=19, leading=23, spaceAfter=4,
    )
    cell_style = ParagraphStyle("TimetableCell", parent=styles["BodyText"], fontSize=8, leading=10)
    header_style = ParagraphStyle(
        "TimetableHeader", parent=cell_style, textColor=colors.white, fontName="Helvetica-Bold",
    )
    story = [
        Paragraph(escape(project.name), title_style),
        Paragraph("Weekly timetable", ParagraphStyle("Subtitle", parent=styles["Normal"], alignment=TA_CENTER)),
        Spacer(1, 5 * mm),
    ]

    data = [[Paragraph(label, header_style) for label in ("Day", "Time", "Course", "Teacher", "Room", "Length")]]
    for entry in entries:
        run = rules.slot_run(project.data.slots, entry.start_slot_id, entry.length_slots)
        first, last = slots[run[0]], slots[run[-1]]
        course, teacher, room = courses[entry.course_id], faculty[entry.faculty_id], rooms[entry.room_id]
        values = (
            first.day,
            f"{first.start} - {last.end}",
            f"{course.code} - {course.name}",
            teacher.name,
            room.name,
            f"{entry.length_slots} slot{'s' if entry.length_slots != 1 else ''}",
        )
        data.append([Paragraph(escape(value), cell_style) for value in values])

    table = Table(data, colWidths=[42, 88, 225, 145, 145, 62], repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#17324D")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#AAB7C4")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F1F5F8")]),
    ]))
    story.append(table)

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#536575"))
        canvas.drawRightString(page_size[0] - 16 * mm, 9 * mm, f"Page {doc.page}")
        canvas.restoreState()

    document.build(story, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()


def _escape_ical(value: str) -> str:
    return (value.replace("\\", "\\\\").replace("\r\n", "\n").replace("\r", "\n")
            .replace("\n", "\\n").replace(",", "\\,").replace(";", "\\;"))


def _fold_ical(line: str) -> str:
    """Fold a content line at 75 UTF-8 octets as required by RFC 5545."""
    output: list[str] = []
    current: list[str] = []
    size = 0
    for char in line:
        char_size = len(char.encode("utf-8"))
        if size + char_size > 75:
            output.append("".join(current))
            current = [" ", char]
            size = 1 + char_size
        else:
            current.append(char)
            size += char_size
    output.append("".join(current))
    return "\r\n".join(output)


def build_ics(project: Project, term_start: date, term_end: date, timezone_name: str) -> bytes:
    if term_start > term_end:
        raise ExportInputError("term_start must be on or before term_end.")
    if term_end - term_start > timedelta(days=366):
        raise ExportInputError("The export date range cannot exceed 367 calendar days.")
    try:
        tz = ZoneInfo(timezone_name)
    except (ZoneInfoNotFoundError, ValueError):
        raise ExportInputError(f"Unknown IANA timezone '{timezone_name}'.")

    entries, slots, courses, faculty, rooms = _ready_entries(project)
    events: list[list[str]] = []
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    for entry in entries:
        run = rules.slot_run(project.data.slots, entry.start_slot_id, entry.length_slots)
        first, last = slots[run[0]], slots[run[-1]]
        course, teacher, room = courses[entry.course_id], faculty[entry.faculty_id], rooms[entry.room_id]
        current = term_start
        while current <= term_end:
            if current.weekday() == rules.DAY_ORDER[first.day]:
                local_start = datetime.combine(current, time.fromisoformat(first.start), tzinfo=tz)
                local_end = datetime.combine(current, time.fromisoformat(last.end), tzinfo=tz)
                start_utc = local_start.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
                end_utc = local_end.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
                uid = f"{project.id}-{entry.id}-{current:%Y%m%d}@slot-smith"
                description = f"Teacher: {teacher.name}; Room: {room.name}"
                events.append([
                    "BEGIN:VEVENT",
                    f"UID:{_escape_ical(uid)}",
                    f"DTSTAMP:{stamp}",
                    f"DTSTART:{start_utc}",
                    f"DTEND:{end_utc}",
                    f"SUMMARY:{_escape_ical(course.code + ' - ' + course.name)}",
                    f"LOCATION:{_escape_ical(room.name)}",
                    f"DESCRIPTION:{_escape_ical(description)}",
                    "END:VEVENT",
                ])
            current += timedelta(days=1)

    if not events:
        raise ExportInputError("The requested date range contains no occurrences of this timetable.")

    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Team Curly Coders//Slot Smith//EN", "CALSCALE:GREGORIAN"]
    for event in events:
        lines.extend(event)
    lines.append("END:VCALENDAR")
    return ("\r\n".join(_fold_ical(line) for line in lines) + "\r\n").encode("utf-8")
