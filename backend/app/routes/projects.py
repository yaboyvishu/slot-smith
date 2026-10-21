"""Project endpoints. Handlers stay thin: parsing, storage calls, and mock mode only.

Status:
  real:        create/get project, save data, save constraints, save timetable,
               generate (Phase 2), validate (Phase 5)
  not yet:     export pdf/ics (Phase 6) -> 501
"""
from fastapi import APIRouter, HTTPException

from app import config
from app.models.schemas import (
    Constraints,
    GenerateResult,
    Project,
    ProjectCreate,
    ProjectData,
    TimetableUpdate,
    ValidateRequest,
    ValidateResponse,
)
from app.services import fixtures, rules, storage

router = APIRouter(prefix="/projects", tags=["projects"])


def _load_or_404(project_id: str) -> Project:
    try:
        return storage.load_project(project_id)
    except storage.ProjectNotFound:
        raise HTTPException(status_code=404, detail="Project not found.")


def _not_implemented(what: str, phase: str) -> HTTPException:
    return HTTPException(status_code=501, detail=f"{what} is not available yet (planned for {phase}).")


def _pick_scenario(scenarios: dict[str, str], requested: str | None) -> str:
    name = requested or next(iter(scenarios))
    if name not in scenarios:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown scenario '{name}'. Choose one of: {', '.join(scenarios)}.",
        )
    return scenarios[name]


@router.post("", response_model=Project, status_code=201)
def create_project(body: ProjectCreate) -> Project:
    return storage.create_project(body.name)


@router.get("/{project_id}", response_model=Project)
def get_project(project_id: str) -> Project:
    return _load_or_404(project_id)


@router.put("/{project_id}/data", response_model=Project)
def save_data(project_id: str, body: ProjectData) -> Project:
    _load_or_404(project_id)
    return storage.update_project(project_id, lambda p: setattr(p, "data", body))


@router.put("/{project_id}/constraints", response_model=Project)
def save_constraints(project_id: str, body: Constraints) -> Project:
    _load_or_404(project_id)
    return storage.update_project(project_id, lambda p: setattr(p, "constraints", body))


@router.put("/{project_id}/timetable", response_model=Project)
def save_timetable(project_id: str, body: TimetableUpdate) -> Project:
    _load_or_404(project_id)

    def change(project: Project) -> None:
        # slot_ids is always recomputed from the project's own slots
        project.timetable = rules.fill_slot_ids(body.timetable, project.data.slots)

    return storage.update_project(project_id, change)


@router.post("/{project_id}/generate", response_model=GenerateResult)
def generate(project_id: str, scenario: str | None = None) -> GenerateResult:
    project = _load_or_404(project_id)
    if config.mock_mode():
        filename = _pick_scenario(fixtures.GENERATE_SCENARIOS, scenario)
        return GenerateResult.model_validate(fixtures.load_fixture(filename))

    from app.services import generator  # imported late so mock mode and startup stay light

    try:
        result = generator.generate(project)
    except generator.SolverTimeout:
        raise HTTPException(
            status_code=504,
            detail=(
                f"The solver ran out of time ({config.solver_time_limit():g} seconds). "
                "Try fewer sessions per week, or add more rooms and time slots."
            ),
        )

    # The generated timetable becomes the project's saved timetable (an impossible
    # result clears it). Any manual edits made earlier are replaced.
    storage.update_project(project_id, lambda p: setattr(p, "timetable", result.timetable))
    return result


@router.post("/{project_id}/validate", response_model=ValidateResponse)
def validate(project_id: str, body: ValidateRequest, scenario: str | None = None) -> ValidateResponse:
    project = _load_or_404(project_id)
    if config.mock_mode():
        filename = _pick_scenario(fixtures.VALIDATE_SCENARIOS, scenario)
        return ValidateResponse.model_validate(fixtures.load_fixture(filename))

    # Treat the request as a proposed edit only: recompute occupied slots and
    # return clashes without mutating or saving the project's timetable.
    entries = rules.fill_slot_ids(body.timetable, project.data.slots)
    clashes = rules.find_clashes(project.data, project.constraints, entries)
    return ValidateResponse(valid=not clashes, clashes=clashes)


@router.get("/{project_id}/export/pdf")
def export_pdf(project_id: str):
    _load_or_404(project_id)
    raise _not_implemented("PDF export", "Phase 6")


@router.get("/{project_id}/export/ics")
def export_ics(project_id: str):
    _load_or_404(project_id)
    raise _not_implemented("ICS export", "Phase 6")
