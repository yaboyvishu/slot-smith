"""The OR-Tools CP-SAT model.

One yes/no variable per way of placing one class session:
    x[course, session number, start slot, room]  = 1  means "this session starts in
    that slot, in that room".
A session of session_length_slots = 2 occupies its start slot AND the next consecutive
slot (see rules.slot_run), so it blocks the teacher and the room for both.

Hard rules (Phase 2):
  - every session is placed exactly once
  - room capacity >= student_count            (if constraints.room_capacity)
  - a teacher is never in two places at once  (if constraints.no_teacher_clash)
  - a room is never double-booked             (if constraints.no_room_clash)
(Two sessions of one course can never overlap while the teacher rule is on, because a
course has exactly one teacher. These are the same rules rules.find_clashes checks.)
Teacher preferences are NOT optimised yet (Phase 3); they are only counted afterwards.

This module imports OR-Tools, which is large, so the app only imports it when
generate is actually called.
"""
from collections import defaultdict

from ortools.sat.python import cp_model

from app import config
from app.models.schemas import Constraints, ProjectData, TimetableEntry
from app.services import rules
from app.services.solve_types import SolveOutcome


def solve(
    data: ProjectData,
    constraints: Constraints,
    time_limit_seconds: float | None = None,
) -> SolveOutcome:
    ordered_slots = rules.sort_slots(data.slots)
    slot_index = {s.id: i for i, s in enumerate(ordered_slots)}

    model = cp_model.CpModel()

    # Every placement option, remembered so the answer can be read back afterwards.
    # (variable, course, start slot id, room id, slot ids occupied)
    placements: list[tuple[cp_model.IntVar, object, str, str, list[str]]] = []

    # Variables that would use the same teacher / room at the same slot.
    teacher_cell: dict[tuple[str, str], list] = defaultdict(list)
    room_cell: dict[tuple[str, str], list] = defaultdict(list)

    for course in data.courses:
        length = course.session_length_slots

        # Start slots that really have `length` back-to-back slots after them.
        starts = []
        for slot in ordered_slots:
            run = rules.slot_run(data.slots, slot.id, length)
            if len(run) == length:
                starts.append((slot.id, run))

        rooms = [
            r for r in data.rooms
            if not constraints.room_capacity or r.capacity >= course.student_count
        ]

        previous_start_index = None  # expression: start position of the previous session
        for session in range(course.sessions_per_week):
            options = []
            start_position_terms = []
            for start_id, run in starts:
                for room in rooms:
                    var = model.NewBoolVar(f"x_{course.id}_{session}_{start_id}_{room.id}")
                    placements.append((var, course, start_id, room.id, run))
                    options.append(var)
                    start_position_terms.append(slot_index[start_id] * var)
                    for sid in run:
                        teacher_cell[(course.faculty_id, sid)].append(var)
                        room_cell[(room.id, sid)].append(var)

            # The caller (generator) rejects courses with no possible placement before
            # calling the solver, so `options` is never empty here.
            model.AddExactlyOne(options)

            # Sessions of one course are interchangeable, so require them in increasing
            # start order. This removes mirror-image solutions (faster) and never loses a
            # real solution. It is strict while the teacher rule is on (two sessions of a
            # course would otherwise share their teacher at the same time), and allows
            # equal starts when that rule is off.
            position = sum(start_position_terms)
            if previous_start_index is not None:
                if constraints.no_teacher_clash:
                    model.Add(previous_start_index < position)
                else:
                    model.Add(previous_start_index <= position)
            previous_start_index = position

    if constraints.no_teacher_clash:
        for variables in teacher_cell.values():
            if len(variables) > 1:
                model.AddAtMostOne(variables)
    if constraints.no_room_clash:
        for variables in room_cell.values():
            if len(variables) > 1:
                model.AddAtMostOne(variables)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = (
        time_limit_seconds if time_limit_seconds is not None else config.solver_time_limit()
    )
    solver.parameters.num_workers = config.solver_workers()
    solver.parameters.random_seed = 1

    status = solver.Solve(model)

    if status == cp_model.INFEASIBLE:
        return SolveOutcome(status="infeasible")
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        if status == cp_model.MODEL_INVALID:
            raise RuntimeError("The solver rejected the model as invalid (this is a bug).")
        return SolveOutcome(status="timeout")

    chosen = [p for p in placements if solver.BooleanValue(p[0])]
    # Stable, readable order: by day and time, then room, then course.
    chosen.sort(key=lambda p: (slot_index[p[2]], p[3], p[1].code, p[1].id))
    entries = [
        TimetableEntry(
            id=f"E{n}",
            course_id=course.id,
            faculty_id=course.faculty_id,
            room_id=room_id,
            start_slot_id=start_id,
            length_slots=course.session_length_slots,
            slot_ids=run,
        )
        for n, (_, course, start_id, room_id, run) in enumerate(chosen, start=1)
    ]
    return SolveOutcome(status="solved", entries=entries)
