"""The fixtures are the frontend's fake backend, so they must match the models
exactly and be internally consistent."""
import pytest

from app.models.schemas import GenerateResult, Project, ValidateResponse
from app.services import fixtures, rules


def load_project(name):
    return Project.model_validate(fixtures.load_fixture(name))


@pytest.mark.parametrize("name", sorted(set(fixtures.DEMO_PROJECTS.values())))
def test_sample_projects_match_the_models(name):
    load_project(name)


@pytest.mark.parametrize("name", sorted(fixtures.GENERATE_SCENARIOS.values()))
def test_generate_fixtures_match_the_models(name):
    GenerateResult.model_validate(fixtures.load_fixture(name))


@pytest.mark.parametrize("name", sorted(fixtures.VALIDATE_SCENARIOS.values()))
def test_validate_fixtures_match_the_models(name):
    ValidateResponse.model_validate(fixtures.load_fixture(name))


def test_default_scenarios_are_the_first_entries():
    assert next(iter(fixtures.GENERATE_SCENARIOS)) == "complete"
    assert next(iter(fixtures.VALIDATE_SCENARIOS)) == "clean"


@pytest.mark.parametrize("name", ["generate_complete.json", "generate_unmet_preferences.json"])
def test_timetable_fixtures_are_consistent_with_the_sample_project(name):
    project = load_project("sample_project.json")
    result = GenerateResult.model_validate(fixtures.load_fixture(name))

    course_ids = {c.id: c for c in project.data.courses}
    room_ids = {r.id: r for r in project.data.rooms}
    slot_ids = {s.id for s in project.data.slots}

    # every course gets exactly sessions_per_week entries
    for course in project.data.courses:
        placed = [e for e in result.timetable if e.course_id == course.id]
        assert len(placed) == course.sessions_per_week

    teacher_busy, room_busy = set(), set()
    for e in result.timetable:
        course = course_ids[e.course_id]
        assert e.faculty_id == course.faculty_id
        assert e.length_slots == course.session_length_slots
        assert room_ids[e.room_id].capacity >= course.student_count
        # slot_ids is exactly what the backend would compute
        assert e.slot_ids == rules.slot_run(project.data.slots, e.start_slot_id, e.length_slots)
        assert len(e.slot_ids) == e.length_slots
        for sid in e.slot_ids:
            assert sid in slot_ids
            assert (e.faculty_id, sid) not in teacher_busy, "teacher double-booked"
            assert (e.room_id, sid) not in room_busy, "room double-booked"
            teacher_busy.add((e.faculty_id, sid))
            room_busy.add((e.room_id, sid))


def test_complete_fixture_has_all_preferences_met():
    result = GenerateResult.model_validate(fixtures.load_fixture("generate_complete.json"))
    assert result.status == "complete"
    assert result.unmet_constraints == []
    assert result.preferences_met == result.preferences_total


def test_unmet_fixture_points_at_real_entries_and_slots():
    result = GenerateResult.model_validate(fixtures.load_fixture("generate_unmet_preferences.json"))
    assert result.status == "complete_with_unmet_preferences"
    assert result.preferences_met < result.preferences_total
    entry_ids = {e.id for e in result.timetable}
    slot_ids = {s.id for s in load_project("sample_project.json").data.slots}
    for conflict in result.unmet_constraints:
        assert set(conflict.affected_entry_ids) <= entry_ids
        assert set(conflict.affected_slot_ids) <= slot_ids


def test_impossible_fixture_matches_the_impossible_sample_project():
    project = load_project("sample_project_impossible.json")
    largest = max(r.capacity for r in project.data.rooms)
    biggest_class = max(c.student_count for c in project.data.courses)
    assert biggest_class > largest, "the impossible project must really be impossible"

    result = GenerateResult.model_validate(fixtures.load_fixture("generate_impossible.json"))
    assert result.status == "impossible"
    assert result.timetable == []
    assert result.unmet_constraints and all(c.suggested_fix for c in result.unmet_constraints)


def test_clash_fixture_references_real_entries_and_slots():
    base = GenerateResult.model_validate(fixtures.load_fixture("generate_complete.json"))
    entry_ids = {e.id for e in base.timetable}
    slot_ids = {s.id for s in load_project("sample_project.json").data.slots}
    response = ValidateResponse.model_validate(fixtures.load_fixture("validate_clashes.json"))
    assert response.valid is False and response.clashes
    for clash in response.clashes:
        assert set(clash.affected_entry_ids) <= entry_ids
        assert set(clash.affected_slot_ids) <= slot_ids
