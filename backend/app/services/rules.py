"""Shared timetable rules: the single source of truth.

The solver (Phase 2) and /validate (Phase 5) must both use the functions in this
file, so the grid and the generated timetable can never disagree about what
counts as a clash or as "consecutive" slots.

Contents:
  - slot adjacency (sort_slots, slot_run, fill_slot_ids)
  - find_clashes: every way a timetable can break a rule (used to double-check the
    solver's output now, and by POST /validate in Phase 5)
  - preference_stats: how many teacher preferences a timetable meets
"""
from collections import defaultdict

from app.models.schemas import (
    Conflict,
    Constraints,
    ProjectData,
    TimeSlot,
    TimetableEntry,
)

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


# ---------------------------------------------------------------------------
# Wording helpers
# ---------------------------------------------------------------------------

_COUNT_WORDS = {2: "two", 3: "three", 4: "four", 5: "five"}


def slot_text(slot: TimeSlot) -> str:
    return slot.label or f"{slot.day} {slot.start}-{slot.end}"


def _join(items: list[str]) -> str:
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def _count_phrase(names: list[str]) -> str:
    """['A', 'A', 'B'] -> 'A (twice) and B'"""
    counts: dict[str, int] = {}
    for name in names:
        counts[name] = counts.get(name, 0) + 1
    parts = []
    for name, n in counts.items():
        parts.append(name if n == 1 else f"{name} (twice)" if n == 2 else f"{name} ({n} times)")
    return _join(parts)


# ---------------------------------------------------------------------------
# Clash detection
# ---------------------------------------------------------------------------

def find_clashes(
    data: ProjectData, constraints: Constraints, entries: list[TimetableEntry]
) -> list[Conflict]:
    """Every rule the timetable breaks, as plain-English Conflict items.

    Only rules switched on in `constraints` are checked (teacher clash, room clash,
    room capacity). Missing references and too-short slot blocks are always reported.
    The entries' own slot_ids are ignored: occupied slots are recomputed from
    start_slot_id and length_slots, so a stale client value can never hide a clash.
    """
    courses = {c.id: c for c in data.courses}
    faculty = {f.id: f for f in data.faculty}
    rooms = {r.id: r for r in data.rooms}
    slots = {s.id: s for s in data.slots}
    week_pos = {s.id: i for i, s in enumerate(sort_slots(data.slots))}

    def ordered(slot_ids) -> list[str]:
        return sorted({s for s in slot_ids if s in slots}, key=lambda s: week_pos[s])

    def course_name(entry: TimetableEntry) -> str:
        course = courses.get(entry.course_id)
        return course.name if course else entry.course_id

    clashes: list[Conflict] = []
    occupied: dict[str, list[str]] = {}  # entry id -> slot ids it really occupies

    # 1. missing references and short blocks
    for e in entries:
        missing = []
        if e.course_id not in courses:
            missing.append(f"course '{e.course_id}'")
        if e.faculty_id not in faculty:
            missing.append(f"teacher '{e.faculty_id}'")
        if e.room_id not in rooms:
            missing.append(f"room '{e.room_id}'")
        if e.start_slot_id not in slots:
            missing.append(f"time slot '{e.start_slot_id}'")
        run = slot_run(data.slots, e.start_slot_id, e.length_slots)
        occupied[e.id] = run
        if missing:
            clashes.append(Conflict(
                type="missing_reference",
                message=f"A class of {course_name(e)} refers to {_join(missing)}, which does not exist.",
                suggested_fix="Move this class to an existing room and time slot, or delete it.",
                affected_entry_ids=[e.id],
                affected_slot_ids=ordered(run or [e.start_slot_id]),
            ))
        elif len(run) < e.length_slots:
            clashes.append(Conflict(
                type="no_consecutive_block",
                message=(
                    f"{course_name(e)} needs {e.length_slots} back-to-back slots starting at "
                    f"{slot_text(slots[e.start_slot_id])}, but only {len(run)} are available there."
                ),
                suggested_fix="Move it to a time with enough consecutive slots, or shorten the class.",
                affected_entry_ids=[e.id],
                affected_slot_ids=ordered(run),
            ))

    # 2. double-bookings (teacher / room). Slots shared by the same set of entries are
    #    merged, so a 2-slot overlap is one item, not two.
    def double_bookings(owner_of) -> list[tuple[str, tuple[str, ...], list[str]]]:
        by_cell: dict[tuple[str, str], list[str]] = defaultdict(list)
        for e in entries:
            for sid in occupied[e.id]:
                by_cell[(owner_of(e), sid)].append(e.id)
        groups: dict[tuple[str, tuple[str, ...]], list[str]] = defaultdict(list)
        for (owner, sid), ids in by_cell.items():
            if len(ids) > 1:
                groups[(owner, tuple(sorted(ids)))].append(sid)
        found = [(owner, ids, ordered(sids)) for (owner, ids), sids in groups.items()]
        found.sort(key=lambda g: (week_pos[g[2][0]], g[0], g[1]))
        return found

    by_id = {e.id: e for e in entries}

    if constraints.no_teacher_clash:
        for owner, ids, sids in double_bookings(lambda e: e.faculty_id):
            names = [course_name(by_id[i]) for i in ids]
            who = faculty[owner].name if owner in faculty else owner
            clashes.append(Conflict(
                type="teacher_clash",
                message=(
                    f"{who} is teaching {_COUNT_WORDS.get(len(ids), len(ids))} classes at "
                    f"{_join([slot_text(slots[s]) for s in sids])}: {_count_phrase(names)}."
                ),
                suggested_fix="Move one of these classes to a different time.",
                affected_entry_ids=list(ids),
                affected_slot_ids=sids,
            ))

    if constraints.no_room_clash:
        for owner, ids, sids in double_bookings(lambda e: e.room_id):
            names = [course_name(by_id[i]) for i in ids]
            where = rooms[owner].name if owner in rooms else owner
            times = "twice" if len(ids) == 2 else f"{len(ids)} times"
            clashes.append(Conflict(
                type="room_clash",
                message=(
                    f"{where} is booked {times} at "
                    f"{_join([slot_text(slots[s]) for s in sids])}: {_count_phrase(names)}."
                ),
                suggested_fix="Move one of these classes to another room or time.",
                affected_entry_ids=list(ids),
                affected_slot_ids=sids,
            ))

    # 3. room capacity
    if constraints.room_capacity:
        biggest = max(data.rooms, key=lambda r: r.capacity, default=None)
        for e in entries:
            course, room = courses.get(e.course_id), rooms.get(e.room_id)
            if course is None or room is None or room.capacity >= course.student_count:
                continue
            fix = (
                f"Move {course.name} to {biggest.name} ({biggest.capacity} seats)."
                if biggest is not None and biggest.capacity >= course.student_count
                else f"Move it to a room with at least {course.student_count} seats."
            )
            clashes.append(Conflict(
                type="room_capacity",
                message=f"{course.name} has {course.student_count} students, but {room.name} only seats {room.capacity}.",
                suggested_fix=fix,
                affected_entry_ids=[e.id],
                affected_slot_ids=ordered(occupied[e.id]),
            ))

    return clashes


# ---------------------------------------------------------------------------
# Teacher preferences
# ---------------------------------------------------------------------------

def preferred_slots_by_teacher(data: ProjectData, constraints: Constraints) -> dict[str, set[str]]:
    """Union of Faculty.preferred_slot_ids and Constraints.preferences, per teacher.

    Only teachers that exist and have at least one preferred slot are included.
    """
    wanted: dict[str, set[str]] = {f.id: set(f.preferred_slot_ids) for f in data.faculty}
    for pref in constraints.preferences:
        if pref.faculty_id in wanted:
            wanted[pref.faculty_id] |= set(pref.slot_ids)
    return {fid: slot_ids for fid, slot_ids in wanted.items() if slot_ids}


def preference_stats(
    data: ProjectData, constraints: Constraints, entries: list[TimetableEntry]
) -> tuple[int, int, list[Conflict]]:
    """(met, total, unmet items).

    total = teachers with at least one preferred slot. A teacher's preference is met
    when every slot used by every class of every course they teach is one of their
    preferred slots (a teacher with no classes is met automatically).
    """
    wanted = preferred_slots_by_teacher(data, constraints)
    courses = {c.id: c for c in data.courses}
    faculty = {f.id: f for f in data.faculty}
    slots = {s.id: s for s in data.slots}
    week_pos = {s.id: i for i, s in enumerate(sort_slots(data.slots))}

    def ordered(slot_ids) -> list[str]:
        return sorted({s for s in slot_ids if s in slots}, key=lambda s: week_pos[s])

    met, unmet = 0, []
    for fid in sorted(wanted, key=lambda f: [x.id for x in data.faculty].index(f)):
        teaching = [
            e for e in entries
            if e.faculty_id == fid or (e.course_id in courses and courses[e.course_id].faculty_id == fid)
        ]
        # e.slot_ids is trusted here: preference_stats runs on generated or stored timetables
        # whose slot_ids the backend computed itself.
        outside = [e for e in teaching if not set(e.slot_ids or [e.start_slot_id]) <= wanted[fid]]
        if not outside:
            met += 1
            continue
        liked = ordered(wanted[fid])
        unmet.append(Conflict(
            type="preference_unmet",
            message=(
                f"{faculty[fid].name} prefers {_join([slot_text(slots[s]) for s in liked])}, but "
                f"{len(outside)} of their {len(teaching)} class{'es' if len(teaching) != 1 else ''} "
                f"{'is' if len(outside) == 1 else 'are'} placed outside those slots."
            ),
            suggested_fix="Add more of their preferred slots or rooms, or relax this preference.",
            affected_entry_ids=[e.id for e in outside],
            affected_slot_ids=ordered(s for e in outside for s in (e.slot_ids or [e.start_slot_id])),
        ))
    return met, len(wanted), unmet
