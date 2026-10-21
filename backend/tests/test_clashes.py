from builders import course, entry, hour_slots, project, room, teacher
from app.models.schemas import Constraints, GenerateResult, Project, ValidateResponse
from app.services import fixtures, rules

SLOTS = hour_slots("Mon", 9, 4)  # MON_09 .. MON_12


def clashes_for(proj, entries):
    entries = rules.fill_slot_ids(entries, proj.data.slots)
    return rules.find_clashes(proj.data, proj.constraints, entries)


def kinds(found):
    return [c.type for c in found]


def base(**kw):
    return project(
        courses=[course("A", "F1", 10), course("B", "F1", 10), course("C", "F2", 10)],
        faculty=[teacher("F1"), teacher("F2")],
        rooms=[room("R1", 50), room("R2", 50)],
        slots=SLOTS,
        **kw,
    )


def test_clean_timetable_has_no_clashes():
    proj = base()
    assert clashes_for(proj, [
        entry("E1", "A", "R1", "MON_09"),
        entry("E2", "B", "R1", "MON_10"),
        entry("E3", "C", "R2", "MON_09", teacher_id="F2"),
    ]) == []


def test_teacher_in_two_places():
    found = clashes_for(base(), [
        entry("E1", "A", "R1", "MON_09"),
        entry("E2", "B", "R2", "MON_09"),
    ])
    assert kinds(found) == ["teacher_clash"]
    assert found[0].affected_entry_ids == ["E1", "E2"]
    assert found[0].affected_slot_ids == ["MON_09"]
    assert "two classes" in found[0].message and "Teacher F1" in found[0].message
    assert "Course A to Mon 10:00-11:00" in found[0].suggested_fix
    assert "Teacher F1" in found[0].suggested_fix and "Room R1" in found[0].suggested_fix


def test_room_booked_twice():
    found = clashes_for(base(), [
        entry("E1", "A", "R1", "MON_09"),
        entry("E2", "C", "R1", "MON_09", teacher_id="F2"),
    ])
    assert kinds(found) == ["room_clash"]
    assert found[0].affected_entry_ids == ["E1", "E2"]


def test_multi_slot_overlap_is_one_item_covering_both_slots():
    proj = project(
        courses=[course("A", "F1", 10, length=2), course("B", "F2", 10, length=2)],
        faculty=[teacher("F1"), teacher("F2")],
        slots=SLOTS,
    )
    found = clashes_for(proj, [
        entry("E1", "A", "R1", "MON_09", length=2),
        entry("E2", "B", "R1", "MON_09", length=2, teacher_id="F2"),
    ])
    assert kinds(found) == ["room_clash"]
    assert found[0].affected_slot_ids == ["MON_09", "MON_10"]


def test_partial_overlap_of_multi_slot_classes():
    proj = project(
        courses=[course("A", "F1", 10, length=2), course("B", "F2", 10, length=2)],
        faculty=[teacher("F1"), teacher("F2")],
        slots=SLOTS,
    )
    found = clashes_for(proj, [
        entry("E1", "A", "R1", "MON_09", length=2),   # 09-11
        entry("E2", "B", "R1", "MON_10", length=2, teacher_id="F2"),  # 10-12
    ])
    assert kinds(found) == ["room_clash"]
    assert found[0].affected_slot_ids == ["MON_10"]


def test_room_too_small():
    proj = project(courses=[course("A", "F1", 60)], rooms=[room("R1", 30), room("R2", 80)], slots=SLOTS)
    found = clashes_for(proj, [entry("E1", "A", "R1", "MON_09")])
    assert kinds(found) == ["room_capacity"]
    assert "60 students" in found[0].message and "only seats 30" in found[0].message
    assert "Room R2 (80 seats)" in found[0].suggested_fix


def test_rules_that_are_switched_off_are_not_checked():
    entries = [entry("E1", "A", "R1", "MON_09"), entry("E2", "B", "R1", "MON_09")]
    off = base(constraints=Constraints(no_teacher_clash=False, no_room_clash=False, room_capacity=False))
    assert clashes_for(off, entries) == []
    teacher_only = base(constraints=Constraints(no_teacher_clash=True, no_room_clash=False))
    assert kinds(clashes_for(teacher_only, entries)) == ["teacher_clash"]


def test_missing_references_are_reported_without_crashing():
    found = clashes_for(base(), [entry("E1", "NOPE", "NOROOM", "MON_09", teacher_id="NOBODY")])
    assert kinds(found) == ["missing_reference"]
    assert "course 'NOPE'" in found[0].message and "room 'NOROOM'" in found[0].message


def test_unknown_start_slot():
    found = clashes_for(base(), [entry("E1", "A", "R1", "NOSLOT")])
    assert kinds(found) == ["missing_reference"]
    assert found[0].affected_slot_ids == []


def test_block_too_short_for_the_class():
    proj = project(courses=[course("A", "F1", 10, length=3)], slots=SLOTS)
    found = clashes_for(proj, [entry("E1", "A", "R1", "MON_11", length=3)])  # only 11-13 exist
    assert kinds(found) == ["no_consecutive_block"]
    assert found[0].affected_slot_ids == ["MON_11", "MON_12"]


def test_stale_client_slot_ids_cannot_hide_a_clash():
    proj = base()
    e1 = entry("E1", "A", "R1", "MON_09").model_copy(update={"slot_ids": ["MON_12"]})
    e2 = entry("E2", "B", "R2", "MON_09").model_copy(update={"slot_ids": ["MON_11"]})
    assert kinds(rules.find_clashes(proj.data, proj.constraints, [e1, e2])) == ["teacher_clash"]


# ---- the fixtures must be exactly what the real rules produce ----

def sample():
    return Project.model_validate(fixtures.load_fixture("sample_project.json"))


def test_generate_complete_fixture_has_no_clashes():
    proj = sample()
    result = GenerateResult.model_validate(fixtures.load_fixture("generate_complete.json"))
    assert rules.find_clashes(proj.data, proj.constraints, result.timetable) == []


def test_validate_clashes_fixture_matches_the_real_rules():
    proj = sample()
    edited = rules.fill_slot_ids([
        entry("E1", "C1", "R102", "MON_09"),
        entry("E2", "C1", "R101", "MON_09"),
        entry("E3", "C2", "R102", "MON_09", length=2, teacher_id="F2"),
    ], proj.data.slots)
    real = ValidateResponse(valid=False, clashes=rules.find_clashes(proj.data, proj.constraints, edited))
    assert real == ValidateResponse.model_validate(fixtures.load_fixture("validate_clashes.json"))
