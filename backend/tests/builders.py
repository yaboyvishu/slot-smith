"""Small helpers for building projects in tests."""
from app.models.schemas import (
    Constraints,
    Course,
    Faculty,
    Project,
    ProjectData,
    Room,
    TimeSlot,
    TimetableEntry,
)


def slot(id, day, start, end):
    return TimeSlot(id=id, day=day, start=start, end=end, label=f"{day} {start}-{end}")


def hour_slots(day, first_hour, count):
    """`count` back-to-back one-hour slots starting at `first_hour` o'clock."""
    return [
        slot(f"{day.upper()}_{h:02d}", day, f"{h:02d}:00", f"{h + 1:02d}:00")
        for h in range(first_hour, first_hour + count)
    ]


def teacher(id="F1", preferred=()):
    return Faculty(id=id, name=f"Teacher {id}", preferred_slot_ids=list(preferred))


def room(id="R1", capacity=50):
    return Room(id=id, name=f"Room {id}", capacity=capacity)


def course(id, teacher_id="F1", students=10, sessions=1, length=1):
    return Course(
        id=id, code=id, name=f"Course {id}", faculty_id=teacher_id,
        student_count=students, sessions_per_week=sessions, session_length_slots=length,
    )


def entry(id, course_id, room_id, start, length=1, teacher_id="F1"):
    return TimetableEntry(
        id=id, course_id=course_id, faculty_id=teacher_id, room_id=room_id,
        start_slot_id=start, length_slots=length,
    )


def project(courses=(), faculty=None, rooms=None, slots=(), constraints=None):
    return Project(
        id="t",
        name="test",
        data=ProjectData(
            courses=list(courses),
            faculty=[teacher()] if faculty is None else list(faculty),
            rooms=[room()] if rooms is None else list(rooms),
            slots=list(slots),
        ),
        constraints=constraints or Constraints(),
    )
