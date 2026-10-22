import pytest
from pydantic import ValidationError

from app.models.schemas import (
    Constraints,
    Course,
    ProjectData,
    Room,
    TimeSlot,
    TimetableUpdate,
)


def test_defaults():
    c = Constraints()
    assert (c.no_teacher_clash, c.no_room_clash, c.room_capacity) == (True, True, True)
    assert Course(id="C", code="X", name="N", faculty_id="F", student_count=1,
                  sessions_per_week=1).session_length_slots == 1


def test_unknown_fields_are_rejected():
    with pytest.raises(ValidationError):
        Room(id="R", name="N", capacity=10, colour="red")


def test_camel_case_keys_are_not_accepted():
    with pytest.raises(ValidationError):
        Room.model_validate({"id": "R", "name": "N", "capacityValue": 10})


@pytest.mark.parametrize("bad", ["9:00", "24:00", "09:60", "0900", ""])
def test_bad_times_are_rejected(bad):
    with pytest.raises(ValidationError):
        TimeSlot(id="S", day="Mon", start=bad, end="23:59")


def test_bad_day_is_rejected():
    with pytest.raises(ValidationError):
        TimeSlot(id="S", day="Sun", start="09:00", end="10:00")


def test_slot_end_must_be_after_start():
    with pytest.raises(ValidationError):
        TimeSlot(id="S", day="Mon", start="10:00", end="09:00")
    with pytest.raises(ValidationError):
        TimeSlot(id="S", day="Mon", start="10:00", end="10:00")


def test_room_capacity_must_be_positive():
    with pytest.raises(ValidationError):
        Room(id="R", name="N", capacity=0)


def test_duplicate_ids_in_project_data_are_rejected():
    room = {"id": "R1", "name": "A", "capacity": 10}
    with pytest.raises(ValidationError, match="duplicate ids in rooms"):
        ProjectData.model_validate({"rooms": [room, room]})


def test_dangling_references_are_allowed_while_editing():
    ProjectData.model_validate({
        "courses": [{"id": "C1", "code": "X", "name": "N", "faculty_id": "NOBODY",
                     "student_count": 5, "sessions_per_week": 1}],
    })


def test_duplicate_timetable_entry_ids_are_rejected():
    entry = {"id": "E1", "course_id": "C", "faculty_id": "F", "room_id": "R",
             "start_slot_id": "S", "length_slots": 1}
    with pytest.raises(ValidationError, match="duplicate timetable entry ids"):
        TimetableUpdate.model_validate({"timetable": [entry, entry]})


@pytest.mark.parametrize("model,kwargs", [
    (Room, {"name": "N", "capacity": 10}),
    (TimeSlot, {"day": "Mon", "start": "09:00", "end": "10:00"}),
])
def test_blank_object_ids_are_rejected(model, kwargs):
    with pytest.raises(ValidationError):
        model(id="", **kwargs)


def test_blank_ids_rejected_for_courses_and_teachers_too():
    from app.models.schemas import Faculty
    with pytest.raises(ValidationError):
        Faculty(id="", name="N")
    with pytest.raises(ValidationError):
        Course(id="", code="X", name="N", faculty_id="F", student_count=1, sessions_per_week=1)


def test_blank_reference_is_allowed_while_a_user_is_still_filling_in_tables():
    Course(id="C", code="X", name="N", faculty_id="", student_count=1, sessions_per_week=1)
