# Backend (FastAPI + OR-Tools)

## Run locally

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # Windows: copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

- Health check: http://localhost:8000/api/health
- Interactive API docs (try every endpoint in the browser): http://localhost:8000/docs
- Tests: `pytest` (run from the `backend` folder)

## Project storage

Projects are stored in SQLite at `DATA_DIR/projects.sqlite3` (default:
`backend/data/projects.sqlite3`). On first use, the backend copies existing
`<project-id>.json` files from that directory into the database. It leaves those
JSON files in place as backups; after migration, SQLite is the active store.
The built-in demo projects are still seeded automatically when first requested.

## Solver benchmark

Run the deterministic small, medium and large synthetic workloads from this
folder. The benchmark reports elapsed generation time, candidate placement count,
result status, clash count and preference score, along with the Python, OR-Tools
and solver settings used. It calls the same generator and clash checker as the API;
it does not start the web server or change project data.

```powershell
python scripts\benchmark.py
python scripts\benchmark.py --suite large --time-limit 20 --workers 1 --output benchmark-results\large.json
```

The default worker count is one to make runs easier to compare. Solver runtimes
still depend on the computer and background load, so include the environment and
settings from the report when comparing results. A `timeout` is recorded as a
benchmark outcome; an `error` causes a non-zero exit code.

The contract the frontend builds against is `../docs/api-contract.md`.

## Import project data from CSV

`POST /api/projects/{id}/import` accepts four required multipart file fields:
`courses`, `faculty`, `rooms`, and `slots`. Headers are case-sensitive but may
appear in any order. See `../docs/api-contract.md` for all accepted columns and
error responses. Each UTF-8 CSV file can be up to 2 MiB. The import validates
all files and references before replacing project data; it preserves constraints
and clears the old timetable only when the import succeeds.

Required columns:

```text
courses.csv: id,code,name,faculty_id,student_count,sessions_per_week
faculty.csv: id,name
rooms.csv: id,name,capacity
slots.csv: id,day,start,end
```

Optional columns are `courses.session_length_slots` (default `1`),
`faculty.preferred_slot_ids` (semicolon-separated slot IDs), and `slots.label`.
Use `multipart/form-data` with those four fields; Swagger UI at `/docs` can send
the upload without a frontend implementation.

## Mock mode (for the frontend team)

Start the server with mock mode on:

```bash
MOCK=1 uvicorn app.main:app --reload --port 8000        # Windows PowerShell: $env:MOCK=1; uvicorn app.main:app --reload --port 8000
```

`generate` and `validate` then return canned answers from `fixtures/`. Choose the
answer with `?scenario=`, for example:

```bash
curl -X POST "http://localhost:8000/api/projects/demo/generate?scenario=impossible"
curl -X POST "http://localhost:8000/api/projects/demo/validate?scenario=clashes" \
     -H "Content-Type: application/json" -d '{"timetable": []}'
```

The projects `demo` and `demo-impossible` always exist. Details and the full scenario
list are in the contract.

## Export a timetable (Phase 6)

Generate or save a timetable first. PDF export downloads the saved weekly schedule:

```powershell
Invoke-WebRequest http://localhost:8000/api/projects/demo/export/pdf -OutFile timetable.pdf
```

ICS export needs the semester date range and the timezone used for the local timetable.
Dates are inclusive, and `timezone` must be an IANA name such as `Asia/Kolkata`:

```powershell
Invoke-WebRequest 'http://localhost:8000/api/projects/demo/export/ics?term_start=2026-11-02&term_end=2027-03-31&timezone=Asia%2FKolkata' -OutFile timetable.ics
```

The ICS file contains one dated event for every class occurrence in that range. See
`../docs/api-contract.md` for response and error details.

## Solver settings

| Variable | Default | Meaning |
|---|---|---|
| `SOLVER_TIME_LIMIT` | `10` | seconds `generate` may search; the best timetable found so far is returned, and only if none was found it gives up (HTTP 504 `SOLVER_TIMEOUT`) |
| `SOLVER_WORKERS` | `4` | solver threads; use `1` on a very small host |

| `EXPLAIN_TIME_LIMIT` | `6` | seconds spent working out *why* a project is impossible (see below) |

**Impossible projects (Phase 4).** Instead of one generic message, `generate` now says what is
wrong: an overloaded teacher, too little room time, which small group of courses cannot be
scheduled together, and which rules clash (and that turning one off makes it solvable). If the
explanation runs out of time it falls back to the generic message.

**Preferences (Phase 3).** The solver tries to meet as many teachers' preferred slots as it
can, but never breaks a hard rule. With several workers, two runs may give different (equally
good) timetables with the same `preferences_met`. For a repeatable timetable during a demo, set
`SOLVER_WORKERS=1` (slower on big projects).

`generate` works on the saved project, so save the data first (`PUT .../data`), then
`POST .../generate`. Try it on the built-in projects:

```bash
curl -X POST http://localhost:8000/api/projects/demo/generate              # a real timetable
curl -X POST http://localhost:8000/api/projects/demo-impossible/generate   # explains why not
```

## Where things live

| Folder / file | What it does |
|---|---|
| `app/main.py` | app, CORS, error format |
| `app/routes/` | thin endpoint handlers |
| `app/models/schemas.py` | the data shapes (= the contract in code) |
| `app/services/rules.py` | the shared rules: slot adjacency, clash detection, preference counting |
| `app/services/solver.py` | the OR-Tools CP-SAT model |
| `app/services/generator.py` | pre-checks, runs the solver, double-checks and scores the answer |
| `app/services/storage.py` | SQLite project storage and one-time migration from legacy JSON files |
| `app/services/fixtures.py` | loads `fixtures/` for mock mode and the demo projects |
| `app/services/exporters.py` | creates PDF and ICS downloads from the saved timetable |
| `app/services/csv_import.py` | parses and validates complete four-file project data imports |
| `scripts/benchmark.py` | runs deterministic solver workloads and prints/saves a JSON report |
| `fixtures/` | canned JSON the frontend can copy into its mocks |
