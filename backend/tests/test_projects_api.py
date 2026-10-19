import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import fixtures

client = TestClient(app)

ROOM = {"id": "R1", "name": "Hall", "capacity": 50}
SLOTS = [
    {"id": "MON_09", "day": "Mon", "start": "09:00", "end": "10:00", "label": ""},
    {"id": "MON_10", "day": "Mon", "start": "10:00", "end": "11:00", "label": ""},
]


def new_project(name="Test"):
    r = client.post("/api/projects", json={"name": name})
    assert r.status_code == 201
    return r.json()


# ---------- create / get ----------

def test_create_and_get_project():
    created = new_project("My project")
    assert created["name"] == "My project"
    assert created["data"] == {"courses": [], "faculty": [], "rooms": [], "slots": []}
    assert created["constraints"]["no_teacher_clash"] is True
    assert created["timetable"] == []

    fetched = client.get(f"/api/projects/{created['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == created


def test_create_requires_a_name():
    r = client.post("/api/projects", json={"name": ""})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_unknown_project_is_404_in_the_error_format():
    r = client.get("/api/projects/nope")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "NOT_FOUND"


def test_demo_project_exists_from_the_start():
    r = client.get("/api/projects/demo")
    assert r.status_code == 200
    assert r.json()["id"] == "demo"


# ---------- data / constraints ----------

def test_save_data_round_trips():
    p = new_project()
    r = client.put(f"/api/projects/{p['id']}/data", json={"rooms": [ROOM], "slots": SLOTS})
    assert r.status_code == 200
    assert r.json()["data"]["rooms"] == [ROOM]
    again = client.get(f"/api/projects/{p['id']}").json()
    assert again["data"]["rooms"] == [ROOM]


def test_save_data_rejects_duplicate_ids():
    p = new_project()
    r = client.put(f"/api/projects/{p['id']}/data", json={"rooms": [ROOM, ROOM]})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_save_data_rejects_unknown_fields():
    p = new_project()
    r = client.put(f"/api/projects/{p['id']}/data", json={"roomz": []})
    assert r.status_code == 422


def test_save_data_on_missing_project_is_404():
    r = client.put("/api/projects/nope/data", json={})
    assert r.status_code == 404


def test_save_constraints():
    p = new_project()
    body = {"no_teacher_clash": True, "no_room_clash": False, "room_capacity": True, "preferences": []}
    r = client.put(f"/api/projects/{p['id']}/constraints", json=body)
    assert r.status_code == 200
    assert r.json()["constraints"]["no_room_clash"] is False


# ---------- timetable ----------

def test_save_timetable_recomputes_slot_ids():
    p = new_project()
    client.put(f"/api/projects/{p['id']}/data", json={"rooms": [ROOM], "slots": SLOTS})
    entry = {"id": "E1", "course_id": "C1", "faculty_id": "F1", "room_id": "R1",
             "start_slot_id": "MON_09", "length_slots": 2, "slot_ids": ["WRONG"]}
    r = client.put(f"/api/projects/{p['id']}/timetable", json={"timetable": [entry]})
    assert r.status_code == 200
    assert r.json()["timetable"][0]["slot_ids"] == ["MON_09", "MON_10"]


def test_save_timetable_slot_ids_may_be_omitted():
    p = new_project()
    client.put(f"/api/projects/{p['id']}/data", json={"slots": SLOTS})
    entry = {"id": "E1", "course_id": "C1", "faculty_id": "F1", "room_id": "R1",
             "start_slot_id": "MON_10", "length_slots": 1}
    r = client.put(f"/api/projects/{p['id']}/timetable", json={"timetable": [entry]})
    assert r.json()["timetable"][0]["slot_ids"] == ["MON_10"]


# ---------- generate / validate: not built yet, mock mode only ----------

def test_generate_impossible_project_matches_the_fixture_and_clears_the_timetable():
    # needs no solver: the "no room big enough" check answers first
    entry = {"id": "E1", "course_id": "C1", "faculty_id": "F1", "room_id": "R101",
             "start_slot_id": "MON_09", "length_slots": 1}
    client.put("/api/projects/demo-impossible/timetable", json={"timetable": [entry]})
    r = client.post("/api/projects/demo-impossible/generate")
    assert r.status_code == 200
    assert r.json() == fixtures.load_fixture("generate_impossible.json")
    assert client.get("/api/projects/demo-impossible").json()["timetable"] == []


def test_generate_runs_the_real_solver_and_saves_the_timetable():
    pytest.importorskip("ortools")
    r = client.post("/api/projects/demo/generate")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] in ("complete", "complete_with_unmet_preferences")
    assert len(body["timetable"]) == 3
    assert client.get("/api/projects/demo").json()["timetable"] == body["timetable"]


def test_generate_on_a_missing_project_is_404():
    assert client.post("/api/projects/nope/generate").status_code == 404


def test_generate_timeout_is_504(monkeypatch):
    from app.services import generator

    def too_slow(project, *args, **kwargs):
        raise generator.SolverTimeout()

    monkeypatch.setattr(generator, "generate", too_slow)
    r = client.post("/api/projects/demo/generate")
    assert r.status_code == 504
    assert r.json()["error"]["code"] == "SOLVER_TIMEOUT"
    assert "ran out of time" in r.json()["error"]["message"]


def test_blank_id_is_rejected_with_the_field_in_the_details():
    p = new_project()
    bad = {"rooms": [{"id": "", "name": "Hall", "capacity": 10}]}
    r = client.put(f"/api/projects/{p['id']}/data", json=bad)
    assert r.status_code == 422
    fields = [d["field"] for d in r.json()["error"]["details"]]
    assert any(f.endswith("rooms.0.id") for f in fields)


def test_validate_is_501_without_mock_mode():
    r = client.post("/api/projects/demo/validate", json={"timetable": []})
    assert r.status_code == 501


@pytest.mark.parametrize("scenario,status", [
    (None, "complete"),
    ("complete", "complete"),
    ("unmet", "complete_with_unmet_preferences"),
    ("impossible", "impossible"),
])
def test_mock_generate_scenarios(monkeypatch, scenario, status):
    monkeypatch.setenv("MOCK", "1")
    url = "/api/projects/demo/generate" + (f"?scenario={scenario}" if scenario else "")
    r = client.post(url)
    assert r.status_code == 200
    assert r.json()["status"] == status


def test_mock_generate_unknown_scenario_is_400(monkeypatch):
    monkeypatch.setenv("MOCK", "1")
    r = client.post("/api/projects/demo/generate?scenario=banana")
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "BAD_REQUEST"


def test_mock_generate_on_missing_project_is_still_404(monkeypatch):
    monkeypatch.setenv("MOCK", "1")
    assert client.post("/api/projects/nope/generate").status_code == 404


def test_mock_validate_scenarios(monkeypatch):
    monkeypatch.setenv("MOCK", "1")
    clean = client.post("/api/projects/demo/validate", json={"timetable": []})
    assert clean.json() == {"valid": True, "clashes": []}
    bad = client.post("/api/projects/demo/validate?scenario=clashes", json={"timetable": []})
    assert bad.json()["valid"] is False
    assert {c["type"] for c in bad.json()["clashes"]} >= {"teacher_clash", "room_clash", "room_capacity"}


# ---------- export: Phase 6 ----------

@pytest.mark.parametrize("kind", ["pdf", "ics"])
def test_export_is_501_for_now(kind):
    r = client.get(f"/api/projects/demo/export/{kind}")
    assert r.status_code == 501
    assert r.json()["error"]["code"] == "NOT_IMPLEMENTED"
