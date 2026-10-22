"""generate() without OR-Tools: the solver is replaced by a fake."""
import pytest

from builders import course, entry, hour_slots, project, room, teacher
from app.models.schemas import Constraints, GenerateResult, Project
from app.services import fixtures, generator
from app.services.solve_types import SolveOutcome

SLOTS = hour_slots("Mon", 9, 3)


def boom(*args, **kwargs):
    raise AssertionError("the solver must not be called for this project")


def fake(outcome):
    return lambda *args, **kwargs: outcome


def sample(name="sample_project.json"):
    return Project.model_validate(fixtures.load_fixture(name))


def fixture_entries(name):
    return GenerateResult.model_validate(fixtures.load_fixture(name)).timetable


# ---- answers that never reach the solver ----

def test_course_without_a_valid_teacher():
    proj = project(courses=[course("A", teacher_id="GHOST"), course("B", teacher_id="")], slots=SLOTS)
    result = generator.generate(proj, solve_fn=boom)
    assert result.status == "impossible" and result.timetable == []
    assert [c.type for c in result.unmet_constraints] == ["missing_reference"] * 2
    assert "'GHOST' is not in the Faculty list" in result.unmet_constraints[0].message
    assert "no teacher chosen" in result.unmet_constraints[1].message


def test_impossible_fixture_is_exactly_what_the_real_code_returns():
    proj = sample("sample_project_impossible.json")
    real = generator.generate(proj, solve_fn=boom)
    assert real == GenerateResult.model_validate(fixtures.load_fixture("generate_impossible.json"))


def test_capacity_rule_off_lets_the_big_class_through_to_the_solver():
    proj = sample("sample_project_impossible.json")
    proj.constraints.room_capacity = False
    called = []
    result = generator.generate(proj, solve_fn=lambda *a, **k: called.append(1) or SolveOutcome(status="infeasible"))
    assert called and result.unmet_constraints[0].type == "blocking_rules"


def test_no_rooms_at_all():
    result = generator.generate(project(courses=[course("A")], rooms=[], slots=SLOTS), solve_fn=boom)
    assert result.unmet_constraints[0].type == "no_room_big_enough"
    assert "There are no rooms" in result.unmet_constraints[0].message


def test_no_slots_at_all():
    result = generator.generate(project(courses=[course("A")], slots=[]), solve_fn=boom)
    assert result.unmet_constraints[0].type == "not_enough_slots"


def test_class_longer_than_any_block():
    result = generator.generate(project(courses=[course("A", length=4)], slots=SLOTS), solve_fn=boom)
    assert result.unmet_constraints[0].type == "no_consecutive_block"
    assert "4 back-to-back" in result.unmet_constraints[0].message


def test_several_problems_are_all_reported():
    proj = project(courses=[course("A", teacher_id="GHOST", students=999, length=9)], slots=SLOTS)
    kinds = [c.type for c in generator.generate(proj, solve_fn=boom).unmet_constraints]
    assert kinds == ["missing_reference", "no_room_big_enough", "no_consecutive_block"]


# ---- solver outcomes ----

def test_infeasible_becomes_impossible_with_blocking_rules():
    result = generator.generate(sample(), solve_fn=fake(SolveOutcome(status="infeasible")))
    assert result.status == "impossible" and result.timetable == []
    assert (result.preferences_met, result.preferences_total) == (0, 0)
    assert [c.type for c in result.unmet_constraints] == ["blocking_rules"]
    assert result.unmet_constraints[0].suggested_fix


def test_timeout_raises():
    with pytest.raises(generator.SolverTimeout):
        generator.generate(sample(), solve_fn=fake(SolveOutcome(status="timeout")))


def test_complete_fixture_is_exactly_what_the_real_code_returns():
    entries = fixture_entries("generate_complete.json")
    real = generator.generate(sample(), solve_fn=fake(SolveOutcome(status="solved", entries=entries)))
    assert real == GenerateResult.model_validate(fixtures.load_fixture("generate_complete.json"))


def test_unmet_fixture_is_exactly_what_the_real_code_returns():
    entries = fixture_entries("generate_unmet_preferences.json")
    real = generator.generate(sample(), solve_fn=fake(SolveOutcome(status="solved", entries=entries)))
    assert real == GenerateResult.model_validate(fixtures.load_fixture("generate_unmet_preferences.json"))


def test_a_solver_answer_that_breaks_a_rule_is_never_returned():
    entries = fixture_entries("generate_complete.json")
    # put both of Dr. Sharma's classes in the same slot
    bad = [e.model_copy(update={"start_slot_id": "MON_09", "slot_ids": ["MON_09"]}) if e.id in ("E1", "E2") else e
           for e in entries]
    with pytest.raises(generator.SolverBug):
        generator.generate(sample(), solve_fn=fake(SolveOutcome(status="solved", entries=bad)))


def test_project_with_no_courses_is_trivially_complete_and_skips_the_solver():
    result = generator.generate(project(courses=[], slots=SLOTS), solve_fn=boom)
    assert result.status == "complete" and result.timetable == []


def test_time_limit_is_passed_to_the_solver():
    seen = []
    def spy(data, constraints, limit):
        seen.append(limit)
        return SolveOutcome(status="infeasible")
    generator.generate(sample(), time_limit=3.5, solve_fn=spy)
    assert seen[0] == 3.5  # the main solve gets the full limit (later calls are the explainer)


# ---- Phase 3: the solver's own preference tally is only a sanity check ----

def liked_project():
    # F1 likes MON_10 only; the fake timetable puts the class there, so 1 of 1 is really met.
    return project(courses=[course("A")], faculty=[teacher("F1", ["MON_10"])], slots=SLOTS)


def test_solver_under_counting_preferences_is_fine():
    outcome = SolveOutcome(status="solved", entries=[entry("E1", "A", "R1", "MON_10")], preferences_met=0)
    result = generator.generate(liked_project(), solve_fn=fake(outcome))
    assert (result.preferences_met, result.preferences_total) == (1, 1)  # the recount is authoritative


def test_solver_over_claiming_preferences_is_a_bug():
    outcome = SolveOutcome(status="solved", entries=[entry("E1", "A", "R1", "MON_09")], preferences_met=1)
    with pytest.raises(generator.SolverBug):
        generator.generate(liked_project(), solve_fn=fake(outcome))


def test_teachers_with_no_classes_do_not_trigger_the_bug_check():
    proj = project(courses=[course("A")], faculty=[teacher("F1", ["MON_09"]), teacher("IDLE", ["MON_09"])], slots=SLOTS)
    outcome = SolveOutcome(status="solved", entries=[entry("E1", "A", "R1", "MON_09")], preferences_met=1)
    result = generator.generate(proj, solve_fn=fake(outcome))
    assert (result.preferences_met, result.preferences_total) == (2, 2)
