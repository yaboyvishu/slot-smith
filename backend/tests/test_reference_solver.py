"""Sanity checks for the brute-force reference solver itself (no OR-Tools needed)."""
from builders import course, hour_slots, project, room, slot, teacher
from app.models.schemas import Constraints
from reference_solver import is_feasible


def feasible(proj):
    return is_feasible(proj.data, proj.constraints)


def test_simple_feasible():
    assert feasible(project(courses=[course("A")], slots=hour_slots("Mon", 9, 1)))


def test_one_teacher_two_classes_one_slot_is_infeasible():
    proj = project(courses=[course("A"), course("B")], rooms=[room("R1"), room("R2")], slots=hour_slots("Mon", 9, 1))
    assert not feasible(proj)
    proj.constraints = Constraints(no_teacher_clash=False)
    assert feasible(proj)


def test_one_room_two_classes_one_slot_is_infeasible():
    proj = project(
        courses=[course("A", "F1"), course("B", "F2")], faculty=[teacher("F1"), teacher("F2")],
        slots=hour_slots("Mon", 9, 1),
    )
    assert not feasible(proj)
    proj.constraints = Constraints(no_room_clash=False)
    assert feasible(proj)


def test_lunch_gap_blocks_a_two_slot_class():
    slots = hour_slots("Mon", 9, 1) + [slot("MON_13", "Mon", "13:00", "14:00")]
    assert not feasible(project(courses=[course("A", length=2)], slots=slots))
    assert feasible(project(courses=[course("A", length=2)], slots=hour_slots("Mon", 9, 2)))


def test_capacity_rule():
    proj = project(courses=[course("A", students=60)], rooms=[room("R1", 30)], slots=hour_slots("Mon", 9, 1))
    assert not feasible(proj)
    proj.constraints = Constraints(room_capacity=False)
    assert feasible(proj)


def test_more_sessions_than_slots():
    assert not feasible(project(courses=[course("A", sessions=3)], slots=hour_slots("Mon", 9, 2)))
