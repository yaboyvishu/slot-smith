# API Contract (v0.1, DRAFT until the team confirms)

Source of truth for the frontend and backend. The Pydantic models in
`backend/app/models/schemas.py` implement exactly this file. If you need a
change, ask the backend owner **before** building on it. Breaking changes (renaming,
removing, or changing a type) are announced to the whole team.

## Conventions

| Topic | Rule |
|---|---|
| JSON keys | `snake_case` everywhere |
| IDs | strings (`"C1"`, `"MON_09"`) |
| Times | `"HH:MM"`, 24 hour |
| Days | `"Mon" "Tue" "Wed" "Thu" "Fri" "Sat"` |
| Base URL | `NEXT_PUBLIC_API_URL` (local: `http://localhost:8000`). All routes start with `/api` |
| Requests | unknown fields are rejected (422) |
| Interactive docs | `GET /docs` (FastAPI) |

### Errors (every failure uses this shape)

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "The request data is not valid.",
             "details": [ { "field": "body.rooms.0.capacity", "message": "Input should be greater than or equal to 1" } ] } }
```

Codes: `VALIDATION_ERROR` (422), `BAD_REQUEST` (400), `NOT_FOUND` (404),
`METHOD_NOT_ALLOWED` (405), `CONFLICT` (409), `INTERNAL_ERROR` (500).

## Data shapes

```
Faculty        { id, name, preferred_slot_ids: [slot_id] }
Room           { id, name, capacity: int >= 1 }
TimeSlot       { id, day, start, end, label }
Course         { id, code, name, faculty_id, student_count: int >= 0,
                 sessions_per_week: int >= 1, session_length_slots: int >= 1 (default 1) }
ProjectData    { courses: [Course], faculty: [Faculty], rooms: [Room], slots: [TimeSlot] }
Preference     { id, type: "faculty_prefers_slots", faculty_id, slot_ids: [slot_id] }
Constraints    { no_teacher_clash: bool, no_room_clash: bool, room_capacity: bool,
                 preferences: [Preference] }          (all three bools default true)
TimetableEntry { id, course_id, faculty_id, room_id, start_slot_id,
                 length_slots: int >= 1, slot_ids: [slot_id] }
Conflict       { type, message, suggested_fix: string|null,
                 affected_entry_ids: [id], affected_slot_ids: [slot_id] }
GenerateResult { status, timetable: [TimetableEntry], unmet_constraints: [Conflict],
                 preferences_met: int, preferences_total: int }
Project        { id, name, data: ProjectData, constraints: Constraints,
                 timetable: [TimetableEntry] }
```

### Multi-slot classes

Two slots are *consecutive* only if they are on the same day and the first slot's
`end` equals the next slot's `start` (so a lunch gap blocks a 2-slot lab).
`TimetableEntry.length_slots` is the class length, and `slot_ids` lists **every**
slot it occupies in order, starting with `start_slot_id`. The frontend draws one tall
block from `slot_ids`; it never works out spans itself. When sending edits, `slot_ids`
may be omitted: the backend recomputes it.

### Preferences

`Faculty.preferred_slot_ids` and `Constraints.preferences` both express "prefers
these slots". The solver uses the **union**. `preferences_total` counts one per
preference entry plus one per faculty with a non-empty `preferred_slot_ids`; a
preference is "met" when every session of that faculty's courses lands in a preferred slot.
(Exact counting is finalised in Phase 3. The shape will not change.)

### Enums

- `status`: `"complete"` | `"complete_with_unmet_preferences"` | `"impossible"`
- `Conflict.type`:
  - edit clashes (from validate): `teacher_clash`, `room_clash`, `room_capacity`, `missing_reference`
  - solver conflicts (from generate): `no_room_big_enough`, `teacher_overloaded`,
    `not_enough_slots`, `no_consecutive_block`, `blocking_rules`, `preference_unmet`

## Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/health` | none | `{ "status": "ok" }` |
| POST | `/api/projects` | `{ "name": string }` | `Project` (201) |
| GET | `/api/projects/{id}` | none | `Project` |
| PUT | `/api/projects/{id}/data` | `ProjectData` | `Project` |
| PUT | `/api/projects/{id}/constraints` | `Constraints` | `Project` |
| POST | `/api/projects/{id}/generate` | none | `GenerateResult` |
| POST | `/api/projects/{id}/validate` | `{ "timetable": [TimetableEntry] }` | `{ "valid": bool, "clashes": [Conflict] }` |
| PUT | `/api/projects/{id}/timetable` | `{ "timetable": [TimetableEntry] }` | `Project` |
| GET | `/api/projects/{id}/export/pdf` | none | PDF file download |
| GET | `/api/projects/{id}/export/ics` | none | ICS file download |
| POST | `/api/projects/{id}/import` | CSV files (stretch) | `Project` |

Notes:
- `generate` always returns **200** with a `GenerateResult`, including when the
  status is `"impossible"` (that is a normal result, not an error). When impossible,
  `timetable` is `[]` and `unmet_constraints` explains why.
- `validate` does not save anything. It checks the timetable against the project's
  current data and constraints using the same rules the solver uses.
- Phase status: only `/api/health` exists in Phase 0. Others arrive in Phase 1 (CRUD, mock mode)
  and later phases, with the shapes above.

## Mock mode (for frontend development)

With `MOCK=1` the backend returns canned responses from `backend/fixtures/`.
Phase 0 provides `sample_project.json`. The generate/impossible/validate fixtures
arrive in Phase 1. The frontend copies them into `frontend/mocks/`.

## Example: a generate result (complete)

```json
{
  "status": "complete_with_unmet_preferences",
  "timetable": [
    { "id": "E1", "course_id": "C1", "faculty_id": "F1", "room_id": "R101",
      "start_slot_id": "MON_09", "length_slots": 1, "slot_ids": ["MON_09"] },
    { "id": "E2", "course_id": "C1", "faculty_id": "F1", "room_id": "R101",
      "start_slot_id": "TUE_09", "length_slots": 1, "slot_ids": ["TUE_09"] },
    { "id": "E3", "course_id": "C2", "faculty_id": "F2", "room_id": "R102",
      "start_slot_id": "MON_10", "length_slots": 2, "slot_ids": ["MON_10", "MON_11"] }
  ],
  "unmet_constraints": [
    { "type": "preference_unmet",
      "message": "Dr. Sharma prefers Monday morning, but one of Data Structures' classes is on Tuesday.",
      "suggested_fix": "Add more Monday morning slots or relax this preference.",
      "affected_entry_ids": ["E2"], "affected_slot_ids": ["TUE_09"] }
  ],
  "preferences_met": 0,
  "preferences_total": 1
}
```
