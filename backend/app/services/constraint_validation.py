"""Checks that preference references point to items in the same project."""
from app.models.schemas import Constraints, ProjectData


def reference_errors(constraints: Constraints, data: ProjectData) -> list[dict]:
    faculty_ids = {faculty.id for faculty in data.faculty}
    slot_ids = {slot.id for slot in data.slots}
    errors: list[dict] = []

    for index, preference in enumerate(constraints.preferences):
        if preference.faculty_id not in faculty_ids:
            errors.append({
                "field": f"body.preferences.{index}.faculty_id",
                "message": f"Faculty ID '{preference.faculty_id}' does not exist in this project.",
            })
        for slot_index, slot_id in enumerate(preference.slot_ids):
            if slot_id not in slot_ids:
                errors.append({
                    "field": f"body.preferences.{index}.slot_ids.{slot_index}",
                    "message": f"Slot ID '{slot_id}' does not exist in this project.",
                })
    return errors
