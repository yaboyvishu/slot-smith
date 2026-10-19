"""Tests that run the real OR-Tools solver (skipped automatically if it is not installed)."""
import random

import pytest

pytest.importorskip("ortools")

from builders import course, hour_slots, project, room, slot, teacher  # noqa: E402
from reference_solver import is_feasible, max_preferences_met  # noqa: E402

from app.models.schemas import Constraints, Preference, Project  # noqa: E402
from app.services import fixtures, generator, rules, solver  # noqa: E402


def run(proj, **kw):
    return solver.solve(proj.data, proj.constraints, time_limit_seconds=kw.get("limit", 20))


def assert_clean(proj, entries):
    assert rules.find_clashes(proj.data, proj.constraints, entries) == []


def test_demo_project_is_solved_and_clash_free():
    proj = Project.model_validate(fixtures.load_fixture("sample_project.json"))
    outcome = run(proj)
    assert outcome.status == "solved" and len(outcome.entries) == 3
    assert_clean(proj, outcome.entries)
    assert [e.id for e in outcome.entries] == ["E1", "E2", "E3"]
    per_course = {}
    for e in outcome.entries:
        per_course.setdefault(e.course_id, []).append(e)
    assert len(per_course["C1"]) == 2 and len(per_course["C2"]) == 1
    lab = per_course["C2"][0]
    assert lab.length_slots == 2 and len(lab.slot_ids) == 2


def test_two_slot_class_never_spans_the_lunch_gap():
    slots = hour_slots("Mon", 9, 2) + [slot("MON_13", "Mon", "13:00", "14:00")]
    proj = project(courses=[course("LAB", length=2)], slots=slots)
    [e] = run(proj).entries
    assert e.start_slot_id == "MON_09" and e.slot_ids == ["MON_09", "MON_10"]


def test_two_slot_class_impossible_when_only_gapped_slots_exist():
    slots = [slot("MON_09", "Mon", "09:00", "10:00"), slot("MON_13", "Mon", "13:00", "14:00")]
    result = generator.generate(project(courses=[course("LAB", length=2)], slots=slots))
    assert result.status == "impossible" and result.unmet_constraints[0].type == "no_consecutive_block"


def test_teacher_cannot_be_in_two_places():
    proj = project(courses=[course("A"), course("B")], rooms=[room("R1"), room("R2")], slots=hour_slots("Mon", 9, 1))
    assert run(proj).status == "infeasible"
    proj.constraints = Constraints(no_teacher_clash=False)
    outcome = run(proj)
    assert outcome.status == "solved" and len(outcome.entries) == 2
    assert_clean(proj, outcome.entries)


def test_room_cannot_be_double_booked():
    proj = project(
        courses=[course("A", "F1"), course("B", "F2")], faculty=[teacher("F1"), teacher("F2")],
        slots=hour_slots("Mon", 9, 1),
    )
    assert run(proj).status == "infeasible"
    proj.constraints = Constraints(no_room_clash=False)
    assert run(proj).status == "solved"


def test_big_class_goes_to_the_big_room():
    proj = project(
        courses=[course("A", students=60), course("B", students=10)], faculty=[teacher("F1"), teacher("F2")],
        rooms=[room("SMALL", 20), room("BIG", 80)], slots=hour_slots("Mon", 9, 2),
    )
    proj.data.courses[1].faculty_id = "F2"
    outcome = run(proj)
    assert outcome.status == "solved"
    assert next(e for e in outcome.entries if e.course_id == "A").room_id == "BIG"
    assert_clean(proj, outcome.entries)


def test_capacity_rule_off_lets_a_big_class_use_a_small_room():
    proj = project(courses=[course("A", students=60)], rooms=[room("SMALL", 20)], slots=hour_slots("Mon", 9, 1),
                   constraints=Constraints(room_capacity=False))
    assert run(proj).status == "solved"


def test_more_sessions_than_slots_is_infeasible():
    assert run(project(courses=[course("A", sessions=3)], slots=hour_slots("Mon", 9, 2))).status == "infeasible"


def test_sessions_of_one_course_use_different_slots():
    proj = project(courses=[course("A", sessions=3)], slots=hour_slots("Mon", 9, 3) + hour_slots("Tue", 9, 3))
    outcome = run(proj)
    starts = [e.start_slot_id for e in outcome.entries]
    assert outcome.status == "solved" and len(set(starts)) == 3


def test_result_is_the_same_every_time():
    proj = Project.model_validate(fixtures.load_fixture("sample_project.json"))
    assert run(proj).entries == run(proj).entries


def test_generate_end_to_end_on_the_demo_project():
    proj = Project.model_validate(fixtures.load_fixture("sample_project.json"))
    result = generator.generate(proj)
    # Phase 3: the one teacher preference in the demo can be met, so the solver must meet it.
    assert result.status == "complete"
    assert (result.preferences_met, result.preferences_total) == (1, 1)


# ---- cross-check against the independent brute-force solver ----

def random_project(rng):
    slots = []
    for day in rng.sample(["Mon", "Tue"], k=rng.choice([1, 2])):
        slots += hour_slots(day, 9, rng.choice([2, 3]))
        if rng.random() < 0.4:
            slots.append(slot(f"{day.upper()}_14", day, "14:00", "15:00"))  # a gap
    teachers = [teacher(f"F{i}") for i in range(rng.choice([1, 2]))]
    rooms = [room(f"R{i}", rng.choice([20, 40])) for i in range(rng.choice([1, 2]))]
    courses = [
        course(f"C{i}", rng.choice(teachers).id, rng.choice([10, 30]), rng.choice([1, 2]), rng.choice([1, 1, 2]))
        for i in range(rng.choice([1, 2, 3]))
    ]
    constraints = Constraints(
        no_teacher_clash=rng.random() < 0.8,
        no_room_clash=rng.random() < 0.8,
        room_capacity=rng.random() < 0.8,
    )
    return project(courses=courses, faculty=teachers, rooms=rooms, slots=slots, constraints=constraints)


@pytest.mark.parametrize("seed", range(120))
def test_agrees_with_brute_force_on_random_small_projects(seed):
    proj = random_project(random.Random(seed))
    expected = is_feasible(proj.data, proj.constraints)
    result = generator.generate(proj, time_limit=20)  # also raises if the solver breaks a rule
    assert (result.status != "impossible") == expected, f"seed {seed}"
    if result.status != "impossible":
        assert_clean(proj, result.timetable)
        for c in proj.data.courses:
            assert sum(1 for e in result.timetable if e.course_id == c.id) == c.sessions_per_week


def test_a_realistic_sized_project_solves_quickly():
    rng = random.Random(7)
    slots = [s for d in ["Mon", "Tue", "Wed", "Thu", "Fri"] for s in hour_slots(d, 9, 6)]
    teachers = [teacher(f"F{i}") for i in range(8)]
    rooms = [room(f"R{i}", c) for i, c in enumerate([30, 40, 60, 60, 80])]
    courses = [
        course(f"C{i}", teachers[i % 8].id, rng.choice([25, 35, 55, 70]), 3, 1 if i % 5 else 2)
        for i in range(15)
    ]
    proj = project(courses=courses, faculty=teachers, rooms=rooms, slots=slots)
    result = generator.generate(proj, time_limit=20)
    assert result.status in ("complete", "complete_with_unmet_preferences")
    assert len(result.timetable) == 45
    assert_clean(proj, result.timetable)


# ---- Phase 3: preferences are optimised, never at the cost of a hard rule ----

def counted(proj, entries):
    return rules.preference_stats(proj.data, proj.constraints, entries)[:2]


def test_a_preference_that_can_be_met_is_met():
    # Only one of the three slots is liked; any valid timetable has several choices.
    proj = project(courses=[course("A")], faculty=[teacher("F1", preferred=["MON_11"])],
                   slots=hour_slots("Mon", 9, 3))
    outcome = run(proj)
    assert outcome.status == "solved" and outcome.entries[0].start_slot_id == "MON_11"
    assert counted(proj, outcome.entries) == (1, 1) and outcome.preferences_met == 1


def test_preference_set_through_constraints_works_too():
    proj = project(courses=[course("A")], slots=hour_slots("Mon", 9, 3))
    proj.constraints.preferences = [Preference(id="P1", type="faculty_prefers_slots", faculty_id="F1", slot_ids=["MON_10"])]
    assert run(proj).entries[0].start_slot_id == "MON_10"


def test_two_teachers_fighting_for_one_slot_exactly_one_wins():
    proj = project(
        courses=[course("A", "F1"), course("B", "F2")],
        faculty=[teacher("F1", ["MON_09"]), teacher("F2", ["MON_09"])],
        slots=hour_slots("Mon", 9, 2), rooms=[room("R1")],  # one room: they cannot share MON_09
    )
    outcome = run(proj)
    assert outcome.status == "solved"
    assert counted(proj, outcome.entries) == (1, 2) and outcome.preferences_met == 1
    assert_clean(proj, outcome.entries)


def test_a_preferred_slot_never_beats_a_hard_rule():
    # The teacher likes MON_09 but the only room that fits is double-booked there by the
    # other course: the preference must give way, the timetable must stay clash-free.
    proj = project(
        courses=[course("A", "F1", students=10), course("B", "F2", students=60)],
        faculty=[teacher("F1", ["MON_09"]), teacher("F2")],
        rooms=[room("BIG", 80)], slots=hour_slots("Mon", 9, 2),
    )
    outcome = run(proj)
    assert outcome.status == "solved"
    assert_clean(proj, outcome.entries)


def test_unsatisfiable_teacher_still_gets_as_many_classes_as_possible_in_liked_slots():
    # Teacher likes MON_09 and MON_10 but teaches 3 sessions: cannot be fully met, yet
    # the tie-breaker must still put two of the three sessions into the liked slots.
    proj = project(courses=[course("A", sessions=3)], faculty=[teacher("F1", ["MON_09", "MON_10"])],
                   slots=hour_slots("Mon", 9, 4))
    outcome = run(proj)
    starts = sorted(e.start_slot_id for e in outcome.entries)
    assert counted(proj, outcome.entries) == (0, 1)
    assert {"MON_09", "MON_10"} <= set(starts)


def test_two_slot_class_needs_both_slots_liked():
    proj = project(courses=[course("LAB", length=2)], faculty=[teacher("F1", ["MON_10", "MON_11"])],
                   slots=hour_slots("Mon", 9, 4))
    [e] = run(proj).entries
    assert e.start_slot_id == "MON_10"


def test_teacher_with_no_classes_does_not_break_the_solver():
    proj = project(courses=[course("A", "F1")], faculty=[teacher("F1"), teacher("IDLE", ["MON_09"])],
                   slots=hour_slots("Mon", 9, 2))
    outcome = run(proj)
    assert outcome.status == "solved"
    assert counted(proj, outcome.entries) == (1, 1)  # the idle teacher is met automatically


def test_project_without_preferences_still_has_no_objective():
    proj = project(courses=[course("A")], slots=hour_slots("Mon", 9, 2))
    outcome = run(proj)
    assert outcome.status == "solved" and outcome.preferences_met == 0


def random_preference_project(rng):
    slots = hour_slots("Mon", 9, rng.choice([3, 4]))
    if rng.random() < 0.5:
        slots += hour_slots("Tue", 9, 2)
    ids = [s.id for s in slots]
    teachers = [teacher(f"F{i}", rng.sample(ids, k=rng.choice([0, 1, 2, 3]))) for i in range(rng.choice([1, 2, 3]))]
    rooms = [room(f"R{i}", rng.choice([20, 40])) for i in range(rng.choice([1, 2]))]
    courses = [
        course(f"C{i}", rng.choice(teachers).id, rng.choice([10, 30]), rng.choice([1, 2]), rng.choice([1, 1, 2]))
        for i in range(rng.choice([1, 2, 3]))
    ]
    constraints = Constraints(no_teacher_clash=rng.random() < 0.85, no_room_clash=rng.random() < 0.85,
                              room_capacity=rng.random() < 0.85)
    if rng.random() < 0.3:
        constraints.preferences = [Preference(id="P1", type="faculty_prefers_slots", faculty_id=rng.choice(teachers).id,
                                              slot_ids=rng.sample(ids, k=2))]
    return project(courses=courses, faculty=teachers, rooms=rooms, slots=slots, constraints=constraints)


@pytest.mark.parametrize("seed", range(150))
def test_met_preferences_equal_the_true_maximum_on_random_small_projects(seed):
    proj = random_preference_project(random.Random(1000 + seed))
    best = max_preferences_met(proj.data, proj.constraints)
    result = generator.generate(proj, time_limit=30)
    if best is None:
        assert result.status == "impossible"
        return
    assert result.status != "impossible", f"seed {seed}"
    assert_clean(proj, result.timetable)
    # preferences_total counts every teacher with a liked slot; the reference counts the same way
    assert result.preferences_met == best, f"seed {seed}: got {result.preferences_met}, best {best}"
