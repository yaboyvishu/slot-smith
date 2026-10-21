"""Parsing and validation for the four-file project CSV import."""
from __future__ import annotations

import csv
from io import StringIO

from pydantic import ValidationError

from app.models.schemas import ProjectData

MAX_FILE_BYTES = 2 * 1024 * 1024

TABLES = {
    "courses": {
        "required": ("id", "code", "name", "faculty_id", "student_count", "sessions_per_week"),
        "optional": ("session_length_slots",),
    },
    "faculty": {
        "required": ("id", "name"),
        "optional": ("preferred_slot_ids",),
    },
    "rooms": {"required": ("id", "name", "capacity"), "optional": ()},
    "slots": {"required": ("id", "day", "start", "end"), "optional": ("label",)},
}


class CsvImportError(ValueError):
    def __init__(self, details: list[dict[str, str]], status_code: int = 422):
        self.details = details
        self.status_code = status_code
        super().__init__("CSV import failed")


def _problem(filename: str, message: str, row: int | None = None, field: str | None = None):
    label = filename
    if row is not None:
        label += f" row {row}"
    if field:
        label += f" ({field})"
    return {"field": label, "message": message}


def _read_table(filename: str, content: bytes) -> tuple[list[dict[str, str]], list[int]]:
    if len(content) > MAX_FILE_BYTES:
        raise CsvImportError([
            _problem(filename, f"File exceeds the {MAX_FILE_BYTES // (1024 * 1024)} MiB limit.")
        ], status_code=413)
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise CsvImportError([_problem(filename, "File must use UTF-8 encoding.")])
    if not text.strip():
        raise CsvImportError([_problem(filename, "File is empty.")])

    reader = csv.reader(StringIO(text, newline=""), strict=True)
    try:
        headers = next(reader)
    except (StopIteration, csv.Error):
        raise CsvImportError([_problem(filename, "Could not read the CSV header.")])
    headers = [header.strip() for header in headers]
    if not all(headers):
        raise CsvImportError([_problem(filename, "Header names cannot be blank.")])
    duplicates = sorted({header for header in headers if headers.count(header) > 1})
    if duplicates:
        raise CsvImportError([_problem(filename, f"Duplicate header(s): {', '.join(duplicates)}.")])

    schema = TABLES[filename.removesuffix(".csv")]
    required = set(schema["required"])
    allowed = required | set(schema["optional"])
    missing = sorted(required - set(headers))
    unexpected = sorted(set(headers) - allowed)
    details = []
    if missing:
        details.append(_problem(filename, f"Missing required column(s): {', '.join(missing)}."))
    if unexpected:
        details.append(_problem(filename, f"Unknown column(s): {', '.join(unexpected)}."))
    if details:
        raise CsvImportError(details)

    records: list[dict[str, str]] = []
    row_numbers: list[int] = []
    try:
        for values in reader:
            row_number = reader.line_num
            if not values or all(not value.strip() for value in values):
                continue
            if len(values) != len(headers):
                details.append(_problem(
                    filename,
                    f"Expected {len(headers)} values but found {len(values)}.",
                    row=row_number,
                ))
                continue
            records.append({header: value.strip() for header, value in zip(headers, values)})
            row_numbers.append(row_number)
    except csv.Error as error:
        details.append(_problem(filename, f"Malformed CSV: {error}.", row=reader.line_num))
    if details:
        raise CsvImportError(details)
    if not records:
        raise CsvImportError([_problem(filename, "File must contain at least one data row.")])
    return records, row_numbers


def _pydantic_details(error: ValidationError, rows: dict[str, list[int]]) -> list[dict[str, str]]:
    details = []
    for item in error.errors():
        location = item.get("loc", ())
        table = str(location[0]) if location else "project"
        index = location[1] if len(location) > 1 and isinstance(location[1], int) else None
        field = ".".join(str(part) for part in location[2:]) if index is not None else ".".join(map(str, location))
        row = rows.get(table, [])[index] if index is not None and index < len(rows.get(table, [])) else None
        details.append(_problem(f"{table}.csv", str(item.get("msg", "Invalid value.")), row, field))
    return details


def parse_project_csv(files: dict[str, bytes]) -> ProjectData:
    """Parse all four CSVs and return a validated project dataset.

    All files are validated before this function returns, so callers can persist
    the resulting value atomically. ``preferred_slot_ids`` is a semicolon-
    separated list in its CSV cell.
    """
    tables: dict[str, list[dict[str, str]]] = {}
    row_numbers: dict[str, list[int]] = {}
    errors = []
    error_status = 422
    for filename in ("courses.csv", "faculty.csv", "rooms.csv", "slots.csv"):
        try:
            tables[filename.removesuffix(".csv")], row_numbers[filename.removesuffix(".csv")] = _read_table(
                filename, files[filename]
            )
        except CsvImportError as error:
            errors.extend(error.details)
            error_status = max(error_status, error.status_code)
    if errors:
        raise CsvImportError(errors, status_code=error_status)

    for course in tables["courses"]:
        if not course.get("session_length_slots"):
            course.pop("session_length_slots", None)
    for teacher in tables["faculty"]:
        raw = teacher.get("preferred_slot_ids", "")
        teacher["preferred_slot_ids"] = [item.strip() for item in raw.split(";") if item.strip()]
    for slot in tables["slots"]:
        if not slot.get("label"):
            slot.pop("label", None)

    try:
        data = ProjectData.model_validate(tables)
    except ValidationError as error:
        raise CsvImportError(_pydantic_details(error, row_numbers))

    faculty_ids = {teacher.id for teacher in data.faculty}
    slot_ids = {slot.id for slot in data.slots}
    for index, course in enumerate(data.courses):
        if course.faculty_id not in faculty_ids:
            errors.append(_problem(
                "courses.csv", f"Unknown faculty_id '{course.faculty_id}'.",
                row_numbers["courses"][index], "faculty_id",
            ))
    for index, teacher in enumerate(data.faculty):
        unknown_slots = [slot_id for slot_id in teacher.preferred_slot_ids if slot_id not in slot_ids]
        if unknown_slots:
            errors.append(_problem(
                "faculty.csv", f"Unknown preferred slot id(s): {', '.join(unknown_slots)}.",
                row_numbers["faculty"][index], "preferred_slot_ids",
            ))
    if errors:
        raise CsvImportError(errors)
    return data
