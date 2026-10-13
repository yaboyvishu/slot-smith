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
- Interactive API docs: http://localhost:8000/docs
- Tests: `pytest` (run from the `backend` folder)

The contract the frontend builds against is `../docs/api-contract.md`.
