"""Shared timetable rules: the single source of truth.

The solver (Phase 2) and /validate (Phase 5) must both use the functions in this
file, so the grid and the generated timetable can never disagree about what
counts as a clash or as "consecutive" slots.

Phase 1 contains the slot-adjacency logic. Clash checks arrive in Phase 5.
"""
from app.models.schemas import TimeSlot, TimetableEntry

DAY_ORDER = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5}


def sort_slots(slots: list[TimeSlot]) -> list[TimeSlot]:
    """Slots in week order: by day, then start time."""
    return sorted(slots, key=lambda s: (DAY_ORDER[s.day], s.start, s.end))


def are_consecutive(first: TimeSlot, second: TimeSlot) -> bool:
    """Two slots are consecutive only if on the same day and first.end == second.start.

    A lunch gap (11:00-12:00 free, no slot) therefore blocks a 2-slot lab from
    spanning it, with no special flag needed.
    """
    return first.day == second.day and first.end == second.start


def slot_run(slots: list[TimeSlot], start_slot_id: str, length: int) -> list[str]:
    """Ids of the slots a class occupies, starting at start_slot_id.

    Returns up to `length` ids. The result is SHORTER than `length` when the
    consecutive block runs out (or empty if start_slot_id does not exist); the
    caller decides what that means (Phase 5 /validate reports it as a clash).
    """
    ordered = sort_slots(slots)
    index = next((i for i, s in enumerate(ordered) if s.id == start_slot_id), None)
    if index is None:
        return []
    run = [ordered[index]]
    while len(run) < length and index + 1 < len(ordered):
        candidate = ordered[index + 1]
        if not are_consecutive(run[-1], candidate):
            break
        run.append(candidate)
        index += 1
    return [s.id for s in run]


def fill_slot_ids(entries: list[TimetableEntry], slots: list[TimeSlot]) -> list[TimetableEntry]:
    """Return copies of the entries with slot_ids recomputed from the project's slots.

    Whatever slot_ids the client sent is ignored. If the start slot is unknown,
    slot_ids falls back to [start_slot_id] so the frontend still has a cell to draw.
    """
    filled = []
    for entry in entries:
        ids = slot_run(slots, entry.start_slot_id, entry.length_slots) or [entry.start_slot_id]
        filled.append(entry.model_copy(update={"slot_ids": ids}))
    return filled
