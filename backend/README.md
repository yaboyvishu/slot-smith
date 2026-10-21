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

The contract the frontend builds against is `../docs/api-contract.md`.

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
| `app/services/storage.py` | saving projects as JSON files in `backend/data/` (git-ignored) |
| `app/services/fixtures.py` | loads `fixtures/` for mock mode and the demo projects |
| `fixtures/` | canned JSON the frontend can copy into its mocks |
