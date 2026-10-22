"""Pydantic models = the API contract in code.

Rules (see /docs/api-contract.md):
- JSON keys are snake_case, IDs are strings, times are "HH:MM" (24h),
  days are "Mon".."Sat".
- Requests reject unknown fields (extra="forbid") so typos fail loudly.
"""
from typing import Annotated, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Day = Literal["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
HHMM = Annotated[str, StringConstraints(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]
# An object's own id must not be blank. (References such as Course.faculty_id may be
# blank while a user is still filling in tables; generate reports those.)
Id = Annotated[str, StringConstraints(min_length=1)]

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
    id: Id
    name: str
    preferred_slot_ids: list[str] = Field(default_factory=list)


class Room(ApiModel):
    id: Id
    name: str
    capacity: int = Field(ge=1)


class TimeSlot(ApiModel):
    id: Id
    day: Day
    start: HHMM
    end: HHMM
    label: str = ""

    @model_validator(mode="after")
    def _end_after_start(self):
        # "HH:MM" strings compare correctly as text
        if self.end <= self.start:
            raise ValueError(f"slot {self.id}: end must be later than start")
        return self


class Course(ApiModel):
    id: Id
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

    @model_validator(mode="after")
    def _unique_ids(self):
        # Duplicate ids would corrupt references. Dangling references (a course
        # whose faculty_id does not exist yet) are allowed so users can save
        # half-finished tables; generate reports those later.
        for name in ("courses", "faculty", "rooms", "slots"):
            ids = [item.id for item in getattr(self, name)]
            dupes = sorted({i for i in ids if ids.count(i) > 1})
            if dupes:
                raise ValueError(f"duplicate ids in {name}: {', '.join(dupes)}")
        return self


# ---------- rules ----------

class Preference(ApiModel):
    id: Id
    type: Literal["faculty_prefers_slots"]
    faculty_id: str
    slot_ids: list[str]


class Constraints(ApiModel):
    no_teacher_clash: bool = True
    no_room_clash: bool = True
    room_capacity: bool = True
    preferences: list[Preference] = Field(default_factory=list)


# ---------- AI constraint interpretation ----------

NonEmptyText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class AIClarificationAnswer(ApiModel):
    question_id: UUID
    question: NonEmptyText = Field(max_length=1000)
    answer: NonEmptyText = Field(max_length=1000)


class AIInterpretRequest(ApiModel):
    instruction: NonEmptyText = Field(max_length=4000)
    clarification_answers: list[AIClarificationAnswer] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def _unique_clarification_ids(self):
        ids = [answer.question_id for answer in self.clarification_answers]
        if len(ids) != len(set(ids)):
            raise ValueError("clarification question_id values must be unique")
        return self


class AIClarificationDraft(ApiModel):
    reason: Literal["ambiguous", "unsupported", "contradictory"]
    question: NonEmptyText = Field(max_length=1000)


class GeminiInterpretation(ApiModel):
    """Provider output, validated before backend-assigned question IDs are added."""

    status: Literal["ready", "needs_clarification"]
    proposed_constraints: Optional[Constraints] = None
    summary: Optional[NonEmptyText] = Field(default=None, max_length=1000)
    clarification_questions: list[AIClarificationDraft] = Field(default_factory=list, max_length=10)
    # Internal provider metadata; the public API returns the merged full proposal.
    explicitly_changed_fields: list[Literal[
        "no_teacher_clash", "no_room_clash", "room_capacity", "preferences"
    ]] = Field(default_factory=list)

    @model_validator(mode="after")
    def _consistent_result(self):
        if self.status == "ready":
            if self.proposed_constraints is None or self.summary is None or self.clarification_questions:
                raise ValueError("ready output requires constraints and summary and no questions")
        elif (self.proposed_constraints is not None or self.summary is not None or
              self.explicitly_changed_fields or not self.clarification_questions):
            raise ValueError("clarification output requires questions and no proposed constraints or summary")
        return self


class AIClarificationQuestion(ApiModel):
    question_id: UUID
    reason: Literal["ambiguous", "unsupported", "contradictory"]
    question: NonEmptyText = Field(max_length=1000)


class AIInterpretResponse(ApiModel):
    status: Literal["ready", "needs_clarification"]
    proposed_constraints: Optional[Constraints] = None
    summary: Optional[NonEmptyText] = Field(default=None, max_length=1000)
    clarification_questions: list[AIClarificationQuestion] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def _consistent_result(self):
        if self.status == "ready":
            if self.proposed_constraints is None or self.summary is None or self.clarification_questions:
                raise ValueError("ready response requires constraints and summary and no questions")
        elif self.proposed_constraints is not None or self.summary is not None or not self.clarification_questions:
            raise ValueError("clarification response requires questions and no proposed constraints or summary")
        return self


# ---------- timetable ----------

class TimetableEntry(ApiModel):
    id: Id
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


def _check_unique_entry_ids(entries: list[TimetableEntry]) -> None:
    ids = [e.id for e in entries]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        raise ValueError(f"duplicate timetable entry ids: {', '.join(dupes)}")


class TimetableUpdate(ApiModel):
    timetable: list[TimetableEntry]

    @model_validator(mode="after")
    def _unique_entry_ids(self):
        _check_unique_entry_ids(self.timetable)
        return self


class ValidateRequest(ApiModel):
    timetable: list[TimetableEntry]

    @model_validator(mode="after")
    def _unique_entry_ids(self):
        _check_unique_entry_ids(self.timetable)
        return self


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
