"""SQLite project storage with automatic import of legacy JSON projects.

``DATA_DIR`` remains the storage location setting. The database lives at
``DATA_DIR/projects.sqlite3``. On first use, existing ``<project-id>.json``
files are copied into SQLite in one transaction and left in place as backups.
After migration, SQLite is authoritative.
"""
from contextlib import contextmanager
import re
import sqlite3
import threading
import uuid
from pathlib import Path
from typing import Callable, Iterator

from app import config
from app.models.schemas import Project
from app.services import fixtures

_BACKEND_DIR = Path(__file__).resolve().parents[2]
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
_lock = threading.RLock()
_initialized_databases: set[Path] = set()


class ProjectNotFound(Exception):
    pass


def _data_dir() -> Path:
    path = Path(config.data_dir())
    if not path.is_absolute():
        path = _BACKEND_DIR / path  # relative DATA_DIR means "next to the backend code"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _database_path() -> Path:
    return _data_dir() / "projects.sqlite3"


def _validate_id(project_id: str) -> None:
    if not _ID_RE.fullmatch(project_id):
        raise ProjectNotFound(project_id)


def _initialize() -> Path:
    """Create the database and migrate legacy JSON projects once per process."""
    path = _database_path()
    if path in _initialized_databases:
        return path

    with _lock:
        if path in _initialized_databases:
            return path
        connection = sqlite3.connect(path, timeout=30)
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "CREATE TABLE IF NOT EXISTS projects ("
                "id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL)"
            )
            for legacy_path in sorted(path.parent.glob("*.json")):
                project_id = legacy_path.stem
                if not _ID_RE.fullmatch(project_id):
                    continue
                try:
                    project = Project.model_validate_json(legacy_path.read_text(encoding="utf-8"))
                except Exception as error:
                    raise RuntimeError(
                        f"Cannot migrate legacy project file {legacy_path.name}: {error}"
                    ) from error
                if project.id != project_id:
                    raise RuntimeError(
                        f"Cannot migrate legacy project file {legacy_path.name}: "
                        f"its project id is '{project.id}'."
                    )
                connection.execute(
                    "INSERT OR IGNORE INTO projects (id, payload) VALUES (?, ?)",
                    (project.id, project.model_dump_json()),
                )
            connection.commit()
        except BaseException:
            connection.rollback()
            raise
        finally:
            connection.close()
        _initialized_databases.add(path)
    return path


@contextmanager
def _connection(path: Path) -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(path, timeout=30)
    try:
        yield connection
        connection.commit()
    except BaseException:
        connection.rollback()
        raise
    finally:
        connection.close()


def _project_from_row(row: tuple[str] | None) -> Project | None:
    if row is None:
        return None
    return Project.model_validate_json(row[0])


def _write_project(connection: sqlite3.Connection, project: Project) -> None:
    connection.execute(
        "INSERT INTO projects (id, payload) VALUES (?, ?) "
        "ON CONFLICT(id) DO UPDATE SET payload = excluded.payload",
        (project.id, project.model_dump_json()),
    )


def save_project(project: Project) -> None:
    _validate_id(project.id)
    path = _initialize()
    with _lock, _connection(path) as connection:
        _write_project(connection, project)


def create_project(name: str) -> Project:
    project = Project(id=uuid.uuid4().hex[:12], name=name)
    save_project(project)
    return project


def _seed_project(connection: sqlite3.Connection, project_id: str) -> Project | None:
    filename = fixtures.DEMO_PROJECTS.get(project_id)
    if filename is None:
        return None
    project = Project.model_validate(fixtures.load_fixture(filename))
    _write_project(connection, project)
    return project


def load_project(project_id: str) -> Project:
    _validate_id(project_id)
    path = _initialize()
    with _lock, _connection(path) as connection:
        row = connection.execute(
            "SELECT payload FROM projects WHERE id = ?", (project_id,)
        ).fetchone()
        project = _project_from_row(row)
        if project is not None:
            return project
        seeded = _seed_project(connection, project_id)
        if seeded is not None:
            return seeded
    raise ProjectNotFound(project_id)


def update_project(project_id: str, change: Callable[[Project], None]) -> Project:
    """Apply and persist one project change in a single SQLite transaction."""
    _validate_id(project_id)
    path = _initialize()
    with _lock, _connection(path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute(
            "SELECT payload FROM projects WHERE id = ?", (project_id,)
        ).fetchone()
        project = _project_from_row(row)
        if project is None:
            project = _seed_project(connection, project_id)
        if project is None:
            raise ProjectNotFound(project_id)
        change(project)
        _write_project(connection, project)
        return project
