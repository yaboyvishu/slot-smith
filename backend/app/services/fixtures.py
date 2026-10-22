"""Loads the canned JSON files in backend/fixtures/ (used by mock mode and demo seeding)."""
import json
from pathlib import Path

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures"

# Projects that exist from the start so the frontend and the demo always have data.
# project id -> fixture file
DEMO_PROJECTS = {
    "demo": "sample_project.json",
    "demo-impossible": "sample_project_impossible.json",
}

# MOCK=1 scenarios (selected with ?scenario=...). First entry is the default.
GENERATE_SCENARIOS = {
    "complete": "generate_complete.json",
    "unmet": "generate_unmet_preferences.json",
    "impossible": "generate_impossible.json",
}
VALIDATE_SCENARIOS = {
    "clean": "validate_clean.json",
    "clashes": "validate_clashes.json",
}


def load_fixture(filename: str) -> dict:
    with open(FIXTURES_DIR / filename, encoding="utf-8") as f:
        return json.load(f)
