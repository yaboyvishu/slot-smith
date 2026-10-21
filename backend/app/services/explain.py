"""Explains WHY a project is impossible, in plain English (Phase 4).

Three layers, cheapest first:
  1. quick_checks()       - exact counting checks that need no solver:
                            a teacher with more class-slots than the week has, or classes
                            that need more room-time than the rooms offer.
  2. explain_infeasible() - after the solver said "infeasible", find
        a. a small group of courses that cannot all be scheduled together
           (remove one course at a time; keep each removal that leaves it impossible), and
        b. which hard rules clash (re-solve with rules switched off, smallest sets first).
Every claim is backed by a solver run, and everything has a time budget. If the budget runs
out the answer is still honest: it just says less (the caller falls back to a generic message).

`solve_fn(data, constraints, seconds)` is the same function generate() uses, so this file can
be tested without OR-Tools.
"""
import time
from itertools import combinations
from typing import Callable

from app.models.schemas import Conflict, Constraints, Course, ProjectData
from app.services.solve_types import SolveOutcome

_RULE_TEXT = {
    "no_teacher_clash": "no teacher in two places at once",
    "no_room_clash": "no room used twice at the same time",
    "room_capacity": "every class in a room big enough for it",
}
_RULE_ORDER = ["no_teacher_clash", "no_room_clash", "room_capacity"]


def _label(course: Course) -> str:
    return f"{course.name} ({course.code})"


def _names(courses: list[Course], limit: int = 6) -> str:
    texts = [c.code for c in courses]
    if len(texts) > limit:
        texts = texts[:limit] + [f"and {len(courses) - limit} more"]
    return ", ".join(texts[:-1]) + (" and " if len(texts) > 1 else "") + texts[-1]


def _demand(course: Course) -> int:
    """Time slots one course needs per week."""
    return course.sessions_per_week * course.session_length_slots


# ---------------------------------------------------------------- layer 1: counting

def quick_checks(data: ProjectData, constraints: Constraints) -> list[Conflict]:
    conflicts: list[Conflict] = []
    total_slots = len(data.slots)
    faculty = {f.id: f for f in data.faculty}

    if constraints.no_teacher_clash:
        for fid, teacher in faculty.items():
            taught = [c for c in data.courses if c.faculty_id == fid]
            need = sum(_demand(c) for c in taught)
            if need > total_slots:
                conflicts.append(Conflict(
                    type="teacher_overloaded",
                    message=(
                        f"{teacher.name} teaches {_names(taught)}, which need {need} time slots "
                        f"per week, but the week only has {total_slots} slots."
                    ),
                    suggested_fix=(
                        "Add time slots, reduce sessions per week or session length, give a course "
                        "to another teacher, or turn off the teacher clash rule."
                    ),
                ))

    # Overloaded teachers usually also overflow the rooms; report the teacher first, and the
    # room shortage only when no teacher is to blame (one problem at a time reads better).
    if not conflicts and constraints.no_room_clash and data.rooms and data.courses:
        # Courses that need a bigger room can only use a subset of the rooms, and these
        # subsets are nested, so checking each student-count level is enough.
        smallest = min(r.capacity for r in data.rooms)
        seen: set[frozenset[str]] = set()
        levels = sorted({c.student_count for c in data.courses}) if constraints.room_capacity else [0]
        for level in levels:
            group = [c for c in data.courses if c.student_count >= level] if constraints.room_capacity else list(data.courses)
            rooms = [r for r in data.rooms if (r.capacity >= level if constraints.room_capacity else True)]
            need = sum(_demand(c) for c in group)
            have = len(rooms) * total_slots
            key = frozenset(c.id for c in group)
            if not rooms or need <= have or key in seen:
                continue
            seen.add(key)
            big = constraints.room_capacity and level > smallest
            if big:
                conflicts.append(Conflict(
                    type="no_room_big_enough",
                    message=(
                        f"Classes with {level} or more students ({_names(group)}) need {need} room-slots "
                        f"per week, but only {len(rooms)} room(s) can hold them, which gives {have} "
                        f"room-slots ({len(rooms)} × {total_slots})."
                    ),
                    suggested_fix=(
                        "Add a large room, add time slots, reduce sessions per week, "
                        "or turn off the room capacity rule."
                    ),
                ))
            else:
                conflicts.append(Conflict(
                    type="not_enough_slots",
                    message=(
                        f"All classes together need {need} room-slots per week, but "
                        f"{len(rooms)} room(s) × {total_slots} time slots only give {have}."
                    ),
                    suggested_fix="Add rooms or time slots, or reduce sessions per week.",
                ))
            if len(conflicts) >= 3:
                break
    return conflicts


# ------------------------------------------------- layer 2: which courses / which rules

class _Budget:
    def __init__(self, seconds: float):
        self.deadline = time.monotonic() + seconds
        self.per_call = max(0.5, seconds / 4)

    def left(self) -> float:
        return self.deadline - time.monotonic()


def _plain(data: ProjectData, courses: list[Course]) -> ProjectData:
    """Same project with some courses, and preferences stripped (they do not matter here)."""
    faculty = [f.model_copy(update={"preferred_slot_ids": []}) for f in data.faculty]
    return data.model_copy(update={"courses": courses, "faculty": faculty})


def _check(data, constraints, courses, solve_fn, budget: _Budget) -> str:
    """'infeasible', 'solved' or 'unknown' (out of time)."""
    if budget.left() <= 0.05:
        return "unknown"
    outcome: SolveOutcome = solve_fn(_plain(data, courses), constraints, min(budget.per_call, budget.left()))
    if outcome.status == "infeasible":
        return "infeasible"
    if outcome.status == "solved":
        return "solved"
    return "unknown"


def _clashing_courses(data, constraints, solve_fn, budget) -> tuple[list[Course], bool]:
    """A group of courses that cannot be scheduled together, and whether it is truly minimal."""
    group = list(data.courses)
    complete = True
    for course in list(group):
        if len(group) <= 1:
            break
        trial = [c for c in group if c is not course]
        status = _check(data, constraints, trial, solve_fn, budget)
        if status == "infeasible":
            group = trial
        elif status == "unknown":
            complete = False
    return group, complete


def _clashing_rules(data, constraints, solve_fn, budget) -> list[list[str]]:
    """Smallest sets of enabled rules that are impossible on their own."""
    enabled = [r for r in _RULE_ORDER if getattr(constraints, r)]
    if not enabled:
        return []

    def only(rule_set) -> Constraints:
        return Constraints(**{r: (r in rule_set) for r in _RULE_ORDER}, preferences=[])

    # With every rule off the project must be solvable, otherwise rules are not the cause.
    if _check(data, only(()), data.courses, solve_fn, budget) != "solved":
        return []
    found: list[set[str]] = []
    for size in range(1, len(enabled) + 1):
        for subset in combinations(enabled, size):
            if any(f <= set(subset) for f in found):
                continue
            if _check(data, only(subset), data.courses, solve_fn, budget) == "infeasible":
                found.append(set(subset))
    return [[r for r in _RULE_ORDER if r in f] for f in found]


def explain_infeasible(
    data: ProjectData,
    constraints: Constraints,
    solve_fn: Callable[..., SolveOutcome],
    budget_seconds: float,
) -> list[Conflict]:
    """Plain-English reasons the solver found no timetable. May be empty (caller falls back)."""
    budget = _Budget(budget_seconds)
    conflicts: list[Conflict] = []
    teachers = {f.id: f.name for f in data.faculty}

    group, complete = _clashing_courses(data, constraints, solve_fn, budget)
    if 2 <= len(group) < len(data.courses) or (len(group) >= 2 and complete):
        who = sorted({teachers.get(c.faculty_id, c.faculty_id) for c in group})
        shared = f" They all share {who[0]}." if len(who) == 1 else ""
        need = sum(_demand(c) for c in group)
        tail = (
            " Removing any one of them makes the rest schedulable."
            if complete else
            " (This list may include a course that is not strictly needed: the search ran out of time.)"
        )
        conflicts.append(Conflict(
            type="blocking_rules",
            message=(
                f"{_names(group)} cannot all be scheduled together: with the current rules they need "
                f"{need} time slots per week and the teachers, rooms and slots available do not allow it."
                f"{shared}{tail}"
            ),
            suggested_fix=(
                "Move one of these courses to another teacher, add rooms or time slots, "
                "reduce their sessions per week, or turn off a rule."
            ),
        ))

    for rule_set in _clashing_rules(data, constraints, solve_fn, budget):
        names = " + ".join(f"“{_RULE_TEXT[r]}”" for r in rule_set)
        what = "rule" if len(rule_set) == 1 else "rules"
        conflicts.append(Conflict(
            type="blocking_rules",
            message=(
                f"The {what} {names} cannot be satisfied with the current courses, teachers, "
                f"rooms and time slots. The project becomes solvable if "
                f"{'this rule is' if len(rule_set) == 1 else 'one of these rules is'} turned off."
            ),
            suggested_fix=(
                f"Turn off {'this rule' if len(rule_set) == 1 else 'one of these rules'}, "
                "or add rooms or time slots."
            ),
        ))
    return conflicts
