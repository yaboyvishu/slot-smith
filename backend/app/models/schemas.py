"""Pydantic models = the API contract in code.

Rules (see /docs/api-contract.md):
- JSON keys are snake_case, IDs are strings, times are "HH:MM" (24h),
  days are "Mon".."Sat".
- Requests reject unknown fields (extra="forbid") so typos fail loudly.
"""
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Day = Literal["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
HHMM = Annotated[str, StringConstraints(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]

ResultStatus = Literal["complete", "complete_with_unmet_preferences", "impossible"]

ConflictType = Literal[
    # edit / validate clashes
    "teacher_clash",
    "room_clash",
    "room_capacity",
    "missing_reference",
    # solver / explainer conflicts
    "no_room_big_enough",
    "teacher_overloaded",
    "not_enough_slots",
    "no_consecutive_block",
    "blocking_rules",
    "preference_unmet",
]


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---------- input data ----------

class Faculty(ApiModel):
    id: str
    name: str
    preferred_slot_ids: list[str] = Field(default_factory=list)


class Room(ApiModel):
    id: str
    name: str
    capacity: int = Field(ge=1)


class TimeSlot(ApiModel):
    id: str
    day: Day
    start: HHMM
    end: HHMM
    label: str = ""


class Course(ApiModel):
    id: str
    code: str
    name: str
    faculty_id: str
    student_count: int = Field(ge=0)
    sessions_per_week: int = Field(ge=1)
    session_length_slots: int = Field(default=1, ge=1)


class ProjectData(ApiModel):
    courses: list[Course] = Field(default_factory=list)
    faculty: list[Faculty] = Field(default_factory=list)
    rooms: list[Room] = Field(default_factory=list)
    slots: list[TimeSlot] = Field(default_factory=list)


# ---------- rules ----------

class Preference(ApiModel):
    id: str
    type: Literal["faculty_prefers_slots"]
    faculty_id: str
    slot_ids: list[str]


class Constraints(ApiModel):
    no_teacher_clash: bool = True
    no_room_clash: bool = True
    room_capacity: bool = True
    preferences: list[Preference] = Field(default_factory=list)


# ---------- timetable ----------

class TimetableEntry(ApiModel):
    id: str
    course_id: str
    faculty_id: str
    room_id: str
    start_slot_id: str
    length_slots: int = Field(default=1, ge=1)
    # Computed by the backend (all occupied slots, in order). Clients may omit it
    # when sending edits; the backend recomputes it.
    slot_ids: list[str] = Field(default_factory=list)


class Conflict(ApiModel):
    type: ConflictType
    message: str
    suggested_fix: Optional[str] = None
    affected_entry_ids: list[str] = Field(default_factory=list)
    affected_slot_ids: list[str] = Field(default_factory=list)


class GenerateResult(ApiModel):
    status: ResultStatus
    timetable: list[TimetableEntry] = Field(default_factory=list)
    unmet_constraints: list[Conflict] = Field(default_factory=list)
    preferences_met: int = 0
    preferences_total: int = 0


# ---------- project + endpoint bodies ----------

class ProjectCreate(ApiModel):
    name: str = Field(min_length=1)


class Project(ApiModel):
    id: str
    name: str
    data: ProjectData = Field(default_factory=ProjectData)
    constraints: Constraints = Field(default_factory=Constraints)
    timetable: list[TimetableEntry] = Field(default_factory=list)


class TimetableUpdate(ApiModel):
    timetable: list[TimetableEntry]


class ValidateRequest(ApiModel):
    timetable: list[TimetableEntry]


class ValidateResponse(ApiModel):
    valid: bool
    clashes: list[Conflict] = Field(default_factory=list)


# ---------- errors ----------

class ErrorBody(ApiModel):
    code: str
    message: str
    details: list[dict] = Field(default_factory=list)


class ErrorResponse(ApiModel):
    error: ErrorBody
