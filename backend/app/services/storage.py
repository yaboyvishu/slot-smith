"""Project storage: one JSON file per project.

Everything that touches the disk lives in this file, so it can be swapped for
SQLite or a hosted database later without changing any route.

Free hosting platforms may wipe the disk on redeploy or when the service sleeps.
The demo projects are re-created from fixtures on demand, so a wiped disk never
leaves the demo empty.
"""
import os
import re
import tempfile
import threading
import uuid
from pathlib import Path
from typing import Callable

from app import config
from app.models.schemas import Project
from app.services import fixtures

_BACKEND_DIR = Path(__file__).resolve().parents[2]
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
_lock = threading.RLock()


class ProjectNotFound(Exception):
    pass


def _data_dir() -> Path:
    path = Path(config.data_dir())
    if not path.is_absolute():
        path = _BACKEND_DIR / path  # relative DATA_DIR means "next to the backend code"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _path_for(project_id: str) -> Path:
    # Reject anything that is not a plain id, so an id can never point outside the data dir.
    if not _ID_RE.match(project_id):
        raise ProjectNotFound(project_id)
    return _data_dir() / f"{project_id}.json"


def _write_atomic(path: Path, text: str) -> None:
    """Write to a temp file, then rename, so a crash never leaves half a file."""
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp_name, path)
    except BaseException:
        if os.path.exists(tmp_name):
            os.remove(tmp_name)
        raise


def save_project(project: Project) -> None:
    with _lock:
        _write_atomic(_path_for(project.id), project.model_dump_json(indent=2))


def create_project(name: str) -> Project:
    project = Project(id=uuid.uuid4().hex[:12], name=name)
    save_project(project)
    return project


def load_project(project_id: str) -> Project:
    with _lock:
        path = _path_for(project_id)
        if not path.exists():
            seed = fixtures.DEMO_PROJECTS.get(project_id)
            if seed is None:
                raise ProjectNotFound(project_id)
            project = Project.model_validate(fixtures.load_fixture(seed))
            save_project(project)
            return project
        return Project.model_validate_json(path.read_text(encoding="utf-8"))


def update_project(project_id: str, change: Callable[[Project], None]) -> Project:
    """Load, apply `change` to the project, save, return it. One request at a time."""
    with _lock:
        project = load_project(project_id)
        change(project)
        save_project(project)
        return project
