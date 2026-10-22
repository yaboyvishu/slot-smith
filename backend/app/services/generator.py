"""Turns a project into a GenerateResult.

Order of work:
  1. reject obvious problems with plain-English messages (missing teachers, no room
     big enough, no block of consecutive slots)  -> status "impossible"
  1b. exact counting checks (explain.quick_checks): overloaded teacher, too little room time
  2. run the solver                               -> "impossible" if the rules clash
     (then explain.explain_infeasible names the clashing courses / rules)
  3. double-check the solver's answer with rules.find_clashes
  4. count how many teacher preferences the timetable meets

The solver is passed in (`solve_fn`) so this file can be tested without OR-Tools.
"""
from typing import Callable

from app import config
from app.models.schemas import (
    Conflict,
    Constraints,
    GenerateResult,
    Project,
    ProjectData,
)
from app.services import explain, rules
from app.services.solve_types import SolveOutcome


class SolverTimeout(Exception):
    """The solver hit its time limit without proving anything."""


class SolverBug(Exception):
    """The solver returned a timetable that breaks a rule. Should never happen."""


def _label(course) -> str:
    return f"{course.name} ({course.code})"


def impossible(conflicts: list[Conflict]) -> GenerateResult:
    return GenerateResult(
        status="impossible",
        timetable=[],
        unmet_constraints=conflicts,
        preferences_met=0,
        preferences_total=0,
    )


def check_references(data: ProjectData) -> list[Conflict]:
    """Courses whose teacher is blank or does not exist."""
    teacher_ids = {f.id for f in data.faculty}
    problems = []
    for course in data.courses:
        if course.faculty_id in teacher_ids:
            continue
        message = (
            f"{_label(course)} has no teacher chosen."
            if not course.faculty_id
            else f"{_label(course)} has no valid teacher: '{course.faculty_id}' is not in the Faculty list."
        )
        problems.append(Conflict(
            type="missing_reference",
            message=message,
            suggested_fix="Choose an existing teacher for this course.",
        ))
    return problems


def find_unplaceable(data: ProjectData, constraints: Constraints) -> list[Conflict]:
    """Courses that cannot be placed at all, whatever else happens."""
    conflicts = []
    for course in data.courses:
        label = _label(course)
        length = course.session_length_slots

        rooms = [
            r for r in data.rooms
            if not constraints.room_capacity or r.capacity >= course.student_count
        ]
        if not rooms:
            if not data.rooms:
                conflicts.append(Conflict(
                    type="no_room_big_enough",
                    message=f"There are no rooms, so {label} cannot be placed.",
                    suggested_fix="Add at least one room.",
                ))
            else:
                largest = max(data.rooms, key=lambda r: r.capacity)
                conflicts.append(Conflict(
                    type="no_room_big_enough",
                    message=(
                        f"No room can hold {label}: it has {course.student_count} students, "
                        f"but the largest room, {largest.name}, seats {largest.capacity}."
                    ),
                    suggested_fix=(
                        f"Add a room with at least {course.student_count} seats, increase "
                        f"{largest.name}'s capacity, or turn off the room capacity rule."
                    ),
                ))

        has_block = any(
            len(rules.slot_run(data.slots, s.id, length)) == length for s in data.slots
        )
        if not has_block:
            if not data.slots:
                conflicts.append(Conflict(
                    type="not_enough_slots",
                    message=f"There are no time slots, so {label} cannot be placed.",
                    suggested_fix="Add time slots.",
                ))
            else:
                conflicts.append(Conflict(
                    type="no_consecutive_block",
                    message=(
                        f"{label} needs {length} back-to-back time slots on one day, "
                        f"but no such block exists."
                    ),
                    suggested_fix=(
                        "Add consecutive slots (a slot must end exactly when the next one starts), "
                        "or reduce this course's session length."
                    ),
                ))
    return conflicts


def generate(
    project: Project,
    time_limit: float | None = None,
    solve_fn: Callable[..., SolveOutcome] | None = None,
) -> GenerateResult:
    data, constraints = project.data, project.constraints

    problems = check_references(data) + find_unplaceable(data, constraints)
    if not problems:
        problems = explain.quick_checks(data, constraints)  # exact counting proofs, no solver needed
    if problems:
        return impossible(problems)

    if data.courses:
        if solve_fn is None:
            from app.services import solver  # imported late: OR-Tools is big

            solve_fn = solver.solve
        outcome = solve_fn(data, constraints, time_limit or config.solver_time_limit())
    else:
        outcome = SolveOutcome(status="solved", entries=[])

    if outcome.status == "timeout":
        raise SolverTimeout()
    if outcome.status == "infeasible":
        found = explain.explain_infeasible(data, constraints, solve_fn, config.explain_time_limit())
        return impossible(found or [Conflict(
            type="blocking_rules",
            message=(
                "The rules cannot all be satisfied at the same time with the current "
                "courses, teachers, rooms and time slots."
            ),
            suggested_fix=(
                "Try adding rooms or time slots, reducing sessions per week, "
                "or switching off a rule."
            ),
        )])

    entries = outcome.entries
    clashes = rules.find_clashes(data, constraints, entries)
    if clashes:
        raise SolverBug("; ".join(c.message for c in clashes))

    met, total, unmet = rules.preference_stats(data, constraints, entries)
    # The solver's own tally may only UNDER-count (a teacher can be met by luck while the
    # solver's flag says 0). Counting more than reality would mean the model is wrong.
    if outcome.preferences_met is not None:
        never_taught = total - sum(
            1 for fid in rules.preferred_slots_by_teacher(data, constraints)
            if any(c.faculty_id == fid for c in data.courses)
        )
        if outcome.preferences_met + never_taught > met:
            raise SolverBug(
                f"the solver claims {outcome.preferences_met} preferences met but only {met} are"
            )
    return GenerateResult(
        status="complete_with_unmet_preferences" if unmet else "complete",
        timetable=entries,
        unmet_constraints=unmet,
        preferences_met=met,
        preferences_total=total,
    )
