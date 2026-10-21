"""Phase 4: plain-English reasons for 'impossible'. No OR-Tools needed: the independent
brute-force solver stands in for the solver, which also lets us verify every claim."""
import random

import pytest

from builders import course, hour_slots, project, room, slot, teacher
from reference_solver import is_feasible
from app.models.schemas import Constraints
from app.services import explain, generator
from app.services.solve_types import SolveOutcome


def brute(data, constraints, seconds=None):
    return SolveOutcome(status="solved" if is_feasible(data, constraints) else "infeasible")


def types(conflicts):
    return [c.type for c in conflicts]


# ---------------------------------------------------------------- layer 1

def test_overloaded_teacher_is_named_with_numbers():
    proj = project(courses=[course("A", sessions=2), course("B", sessions=2)], slots=hour_slots("Mon", 9, 3))
    [c] = explain.quick_checks(proj.data, proj.constraints)
    assert c.type == "teacher_overloaded"
    assert "Teacher F1" in c.message and "4 time slots" in c.message and "only has 3" in c.message
    assert "teacher clash rule" in c.suggested_fix


def test_overloaded_teacher_counts_session_length():
    proj = project(courses=[course("LAB", sessions=2, length=2)], slots=hour_slots("Mon", 9, 3))
    [c] = explain.quick_checks(proj.data, proj.constraints)
    assert c.type == "teacher_overloaded" and "need 4" in c.message


def test_teacher_check_is_silent_when_the_rule_is_off_or_it_fits():
    proj = project(courses=[course("A", sessions=2), course("B", sessions=2)], slots=hour_slots("Mon", 9, 3),
                   constraints=Constraints(no_teacher_clash=False))
    assert explain.quick_checks(proj.data, proj.constraints) == [] or \
        all(c.type != "teacher_overloaded" for c in explain.quick_checks(proj.data, proj.constraints))
    ok = project(courses=[course("A", sessions=2)], slots=hour_slots("Mon", 9, 3))
    assert explain.quick_checks(ok.data, ok.constraints) == []


def test_not_enough_room_time_overall():
    proj = project(courses=[course("A", "F1", sessions=2), course("B", "F2", sessions=2)],
                   faculty=[teacher("F1"), teacher("F2")], rooms=[room("R1")], slots=hour_slots("Mon", 9, 3))
    [c] = explain.quick_checks(proj.data, proj.constraints)
    assert c.type == "not_enough_slots" and "4 room-slots" in c.message and "only give 3" in c.message


def test_big_classes_short_of_big_rooms():
    proj = project(
        courses=[course("A", "F1", 60, 2), course("B", "F2", 60, 2)], faculty=[teacher("F1"), teacher("F2")],
        rooms=[room("SMALL", 20), room("BIG", 80)], slots=hour_slots("Mon", 9, 3),
    )
    [c] = explain.quick_checks(proj.data, proj.constraints)
    assert c.type == "no_room_big_enough" and "60 or more students" in c.message and "1 room(s)" in c.message


def test_room_checks_are_silent_when_room_rule_is_off():
    proj = project(courses=[course("A", "F1", sessions=2), course("B", "F2", sessions=2)],
                   faculty=[teacher("F1"), teacher("F2")], rooms=[room("R1")], slots=hour_slots("Mon", 9, 3),
                   constraints=Constraints(no_room_clash=False))
    assert explain.quick_checks(proj.data, proj.constraints) == []


def test_generate_reports_quick_check_without_calling_the_solver():
    proj = project(courses=[course("A", sessions=2), course("B", sessions=2)], slots=hour_slots("Mon", 9, 3))

    def boom(*a, **k):
        raise AssertionError("solver must not be called")

    result = generator.generate(proj, solve_fn=boom)
    assert result.status == "impossible" and types(result.unmet_constraints) == ["teacher_overloaded"]


# ---------------------------------------------------------------- layer 2

def clash_project():
    """Three courses of one teacher cannot fit 2 slots... but add an innocent fourth course."""
    return project(
        courses=[course("A", "F1"), course("B", "F1"), course("C", "F1"), course("OK", "F2")],
        faculty=[teacher("F1"), teacher("F2")], rooms=[room("R1"), room("R2")], slots=hour_slots("Mon", 9, 2),
    )


def test_names_the_clashing_group_and_leaves_the_innocent_course_out():
    proj = clash_project()
    conflicts = explain.explain_infeasible(proj.data, proj.constraints, brute, 5)
    group = next(c for c in conflicts if "cannot all be scheduled together" in c.message)
    assert "A, B and C" in group.message and "OK" not in group.message
    assert "share Teacher F1" in group.message and "Removing any one of them" in group.message


def test_names_the_rule_that_blocks_and_says_turning_it_off_helps():
    proj = clash_project()
    conflicts = explain.explain_infeasible(proj.data, proj.constraints, brute, 5)
    rule = next(c for c in conflicts if "rule" in c.message and "turned off" in c.message)
    assert "no teacher in two places at once" in rule.message
    assert is_feasible(proj.data, Constraints(no_teacher_clash=False))


def test_two_rules_that_only_clash_together():
    # 2 slots, 1 room, two teachers each want a class: fine with either rule off alone?
    proj = project(
        courses=[course("A", "F1", 60), course("B", "F2", 10)], faculty=[teacher("F1"), teacher("F2")],
        rooms=[room("BIG", 80)], slots=hour_slots("Mon", 9, 1),
    )
    conflicts = explain.explain_infeasible(proj.data, proj.constraints, brute, 5)
    assert conflicts and all(c.type == "blocking_rules" for c in conflicts)


def test_generic_message_when_nothing_can_be_proved():
    always = lambda *a, **k: SolveOutcome(status="infeasible")
    proj = clash_project()
    assert explain.explain_infeasible(proj.data, proj.constraints, always, 2) == []


def test_out_of_time_never_claims_minimality():
    calls = []

    def slow(data, constraints, seconds):
        calls.append(1)
        return SolveOutcome(status="timeout")

    proj = clash_project()
    assert explain.explain_infeasible(proj.data, proj.constraints, slow, 2) == []
    assert calls  # it tried


def test_budget_of_zero_is_safe():
    proj = clash_project()
    assert explain.explain_infeasible(proj.data, proj.constraints, brute, 0) == []


def two_labs_project():
    """Counting says it fits (4 slots needed, 4 exist) but only ONE back-to-back block exists."""
    slots = hour_slots("Mon", 9, 2) + [slot("TUE_09", "Tue", "09:00", "10:00"), slot("WED_09", "Wed", "09:00", "10:00")]
    return project(
        courses=[course("LAB1", "F1", length=2), course("LAB2", "F1", length=2), course("OK", "F2")],
        faculty=[teacher("F1"), teacher("F2")], rooms=[room("R1"), room("R2")], slots=slots,
    )


def test_generate_uses_the_explanation():
    proj = two_labs_project()
    assert explain.quick_checks(proj.data, proj.constraints) == []  # needs the solver to see it
    result = generator.generate(proj, solve_fn=brute)
    assert result.status == "impossible" and result.timetable == []
    assert all(c.type == "blocking_rules" for c in result.unmet_constraints)
    messages = " ".join(c.message for c in result.unmet_constraints)
    assert "LAB1 and LAB2 cannot all be scheduled together" in messages and "OK" not in messages
    assert "no teacher in two places at once" in messages


# ---------------------------------------------------------------- random verification

def random_hard_project(rng):
    slots = hour_slots("Mon", 9, rng.choice([2, 3]))
    if rng.random() < 0.4:
        slots += hour_slots("Tue", 9, 1)
    teachers = [teacher(f"F{i}") for i in range(rng.choice([1, 2, 3]))]
    rooms = [room(f"R{i}", rng.choice([20, 40, 80])) for i in range(rng.choice([1, 2]))]
    courses = [
        course(f"C{i}", rng.choice(teachers).id, rng.choice([10, 30, 60]), rng.choice([1, 2]), rng.choice([1, 1, 2]))
        for i in range(rng.choice([2, 3, 4]))
    ]
    constraints = Constraints(no_teacher_clash=rng.random() < 0.85, no_room_clash=rng.random() < 0.85,
                              room_capacity=rng.random() < 0.85)
    return project(courses=courses, faculty=teachers, rooms=rooms, slots=slots, constraints=constraints)


@pytest.mark.parametrize("seed", range(150))
def test_every_claim_is_true_on_random_projects(seed):
    proj = random_hard_project(random.Random(seed))
    data, cons = proj.data, proj.constraints
    feasible = is_feasible(data, cons)
    quick = explain.quick_checks(data, cons)
    if feasible:
        assert quick == [], f"seed {seed}: quick check claims impossible but it is solvable"
        return
    # Soundness of the counting checks (they only fire on really impossible projects).
    # Claims of the explainer, checked independently with the brute-force solver:
    conflicts = explain.explain_infeasible(data, cons, brute, 20)
    for c in conflicts:
        if "cannot all be scheduled together" in c.message:
            codes = [x.code for x in data.courses if x.code in c.message]
            group = [x for x in data.courses if x.code in codes]
            assert not is_feasible(data.model_copy(update={"courses": group}), cons), f"seed {seed}: group is feasible"
            for left_out in group:
                rest = [x for x in group if x is not left_out]
                assert is_feasible(data.model_copy(update={"courses": rest}), cons), f"seed {seed}: not minimal"
        elif "turned off" in c.message:
            named = [r for r, text in explain._RULE_TEXT.items() if text in c.message]
            assert named
            only = Constraints(**{r: (r in named) for r in explain._RULE_ORDER})
            assert not is_feasible(data, only), f"seed {seed}: named rules do not clash"
            for r in named:
                fewer = Constraints(**{k: (k in named and k != r) for k in explain._RULE_ORDER})
                assert is_feasible(data, fewer), f"seed {seed}: rule set not minimal"
