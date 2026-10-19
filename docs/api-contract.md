# API Contract (v0.3, DRAFT until the team confirms)

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
| Ids | an object's own `id` (course, teacher, room, slot, preference, timetable entry) must not be blank (422). References such as `Course.faculty_id` may be blank while a user is still filling in tables |
| Interactive docs | `GET /docs` (FastAPI) |

### Errors (every failure uses this shape)

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "The request data is not valid.",
             "details": [ { "field": "body.rooms.0.capacity", "message": "Input should be greater than or equal to 1" } ] } }
```

Codes: `VALIDATION_ERROR` (422), `BAD_REQUEST` (400), `NOT_FOUND` (404),
`METHOD_NOT_ALLOWED` (405), `CONFLICT` (409), `INTERNAL_ERROR` (500),
`NOT_IMPLEMENTED` (501, a feature that is planned but not built yet),
`SOLVER_TIMEOUT` (504, `generate` ran out of time without an answer).

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

`Faculty.preferred_slot_ids` and `Constraints.preferences` both express "this
teacher prefers these slots". The solver uses the **union** per teacher.

Counting rule (frozen here so the numbers in the UI are predictable):
- `preferences_total` = number of teachers who have at least one preferred slot
  (from either source).
- A teacher's preference is **met** when *every* class session of every course they
  teach is placed in one of their preferred slots. `preferences_met` counts those.
- Each unmet teacher produces one `preference_unmet` item in `unmet_constraints`.
- An `impossible` result always has `preferences_met = 0` and `preferences_total = 0`.
- Since Phase 3 the solver **optimises** preferences: it maximises the number of met teachers
  (and, as a tie-breaker, the number of classes that sit in a preferred slot), but never at
  the cost of a hard rule. `preferences_met` is always recounted from the final timetable
  using the rule above. Response shapes did not change.
- If the time limit runs out after a valid timetable was found, `generate` returns the best
  one found so far (still rule-clean, maybe not the best possible). `504 SOLVER_TIMEOUT`
  only happens when no valid timetable was found in time.
- Equally good timetables may differ between runs (the solver searches in parallel); the
  `preferences_met` score is the same.

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
- `generate` saves its timetable as the project's timetable (an impossible result clears it),
  replacing any manual edits. If the solver runs out of time (default 10 s) the response is
  **504** `SOLVER_TIMEOUT`, which is an error, not a result.
- Before solving, `generate` checks for problems it can name directly and returns them all at
  once as `impossible`: `missing_reference` (a course with a blank or unknown teacher),
  `no_room_big_enough`, `not_enough_slots` (no slots at all), `no_consecutive_block`.
  If the solver itself finds no solution the result has one `blocking_rules` item.
  (Phase 4 will make that item say *which* rules clash.)
- `validate` does not save anything. It checks the timetable against the project's
  current data and constraints using the same rules the solver uses.
- `PUT .../data` and `PUT .../constraints` replace the stored value. Half-finished
  data is allowed (for example a course whose `faculty_id` does not exist yet): the
  backend only rejects bad shapes, duplicate ids, and a slot whose `end` is not later
  than its `start`. Missing references are reported by `generate` later.
- `PUT .../timetable` stores the edited timetable. The backend **always recomputes**
  every entry's `slot_ids` from the project's slots (anything the client sends is
  ignored). If the consecutive block is too short for `length_slots`, `slot_ids`
  holds the shorter run; if `start_slot_id` is unknown it is `[start_slot_id]`.
  `/validate` (Phase 5) reports those cases as clashes.
- Entry ids inside one timetable must be unique (422 otherwise).
- Unknown project id: 404 `NOT_FOUND`.

### Build status (what works today)

| Endpoint | Status |
|---|---|
| health, create/get project, save data, save constraints, save timetable | **real** |
| `generate` | **real** (Phase 2 and 3): hard rules and multi-slot classes. Teacher preferences are optimised (Phase 3). `?scenario=` still works in mock mode |
| `validate` | mock only (`MOCK=1`), real in Phase 5. Otherwise 501 |
| `export/pdf`, `export/ics` | 501 until Phase 6 |
| `import` | not built (stretch) |

## Mock mode and demo projects (for frontend development)

Two projects exist from the start, so the frontend never needs to create one first:

| Project id | What it is |
|---|---|
| `demo` | a small, solvable project (2 courses, 2 rooms, 6 slots, one teacher preference) |
| `demo-impossible` | the same project, but Lecture Hall 1 seats 40, so Data Structures (55 students) fits nowhere |

They are re-created automatically if the server's disk is wiped.

With `MOCK=1` the backend returns canned responses from `backend/fixtures/` for
`generate` and `validate`. Everything else (projects, data, constraints, timetable)
is real and saved to disk, so the frontend can test full save/load flows.
Pick the response with the `scenario` query parameter (unknown value: 400):

| Call | `?scenario=` | Returns |
|---|---|---|
| `POST .../generate` | `complete` (default) | `status: "complete"`, all preferences met |
| | `unmet` | `status: "complete_with_unmet_preferences"`, one `preference_unmet` item |
| | `impossible` | `status: "impossible"`, empty timetable, one `no_room_big_enough` item |
| `POST .../validate` | `clean` (default) | `{ "valid": true, "clashes": [] }` |
| | `clashes` | `valid: false` with a `teacher_clash`, `room_clash` and `room_capacity` item |

The scenario parameter exists **only in mock mode**. The real endpoints ignore it.
Mock `generate` does not save the timetable, and mock `validate` ignores the
timetable you send. The mock answers are exactly what the real code returns for the
`demo` / `demo-impossible` projects (the backend tests check this), so switching mock
mode off should not change what the screens show for those two projects. The files are in `backend/fixtures/`:
`sample_project.json`, `sample_project_impossible.json`, `generate_complete.json`,
`generate_unmet_preferences.json`, `generate_impossible.json`, `validate_clean.json`,
`validate_clashes.json`. The frontend copies them into `frontend/mocks/`.

## Example: a generate result (complete with unmet preferences)

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
      "message": "Dr. Sharma prefers Monday 09:00-11:00, but one of Data Structures' classes is on Tuesday.",
      "suggested_fix": "Add more Monday morning slots, or relax this preference.",
      "affected_entry_ids": ["E2"], "affected_slot_ids": ["TUE_09"] }
  ],
  "preferences_met": 0,
  "preferences_total": 1
}
```
