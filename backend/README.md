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

## Where things live

| Folder / file | What it does |
|---|---|
| `app/main.py` | app, CORS, error format |
| `app/routes/` | thin endpoint handlers |
| `app/models/schemas.py` | the data shapes (= the contract in code) |
| `app/services/rules.py` | shared rules (slot adjacency now; clash checks in Phase 5) |
| `app/services/storage.py` | saving projects as JSON files in `backend/data/` (git-ignored) |
| `app/services/fixtures.py` | loads `fixtures/` for mock mode and the demo projects |
| `fixtures/` | canned JSON the frontend can copy into its mocks |
