import pytest

from app.models.schemas import Project, ProjectData
from app.services import storage


def test_create_then_load_round_trip():
    created = storage.create_project("My timetable")
    loaded = storage.load_project(created.id)
    assert loaded == created
    assert loaded.name == "My timetable"
    assert loaded.data.courses == []


def test_ids_are_unique():
    assert storage.create_project("a").id != storage.create_project("b").id


def test_unknown_project_raises():
    with pytest.raises(storage.ProjectNotFound):
        storage.load_project("doesnotexist")


@pytest.mark.parametrize("bad_id", ["../secret", "a/b", "a b", "", "x" * 41, ".."])
def test_bad_ids_are_treated_as_not_found(bad_id):
    with pytest.raises(storage.ProjectNotFound):
        storage.load_project(bad_id)


def test_update_project_saves_changes():
    created = storage.create_project("p")
    storage.update_project(created.id, lambda p: setattr(p, "name", "renamed"))
    assert storage.load_project(created.id).name == "renamed"


def test_demo_projects_are_seeded_on_demand():
    demo = storage.load_project("demo")
    assert demo.id == "demo"
    assert len(demo.data.courses) == 2
    impossible = storage.load_project("demo-impossible")
    assert impossible.id == "demo-impossible"


def test_demo_edits_persist_and_are_not_overwritten_by_the_seed():
    storage.update_project("demo", lambda p: setattr(p, "name", "edited"))
    assert storage.load_project("demo").name == "edited"


def test_no_temp_files_left_behind(tmp_path):
    created = storage.create_project("p")
    storage.update_project(created.id, lambda p: setattr(p, "data", ProjectData()))
    files = sorted(f.name for f in (tmp_path / "data").iterdir())
    assert files == ["projects.sqlite3"]


def test_legacy_json_projects_are_migrated_and_kept_as_backup(tmp_path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    legacy = Project(id="LEGACY01", name="Legacy project")
    legacy_file = data_dir / f"{legacy.id}.json"
    legacy_file.write_text(legacy.model_dump_json(indent=2), encoding="utf-8")

    loaded = storage.load_project(legacy.id)

    assert loaded == legacy
    assert (data_dir / "projects.sqlite3").exists()
    assert legacy_file.exists()

    storage.update_project(legacy.id, lambda project: setattr(project, "name", "Updated in SQLite"))
    assert storage.load_project(legacy.id).name == "Updated in SQLite"
    assert Project.model_validate_json(legacy_file.read_text(encoding="utf-8")).name == "Legacy project"
