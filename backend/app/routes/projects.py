"""Project endpoints. Handlers stay thin: parsing, storage calls, and mock mode only.

Status:
  real:        create/get project, save data, save constraints, save timetable,
               generate (Phase 2), validate (Phase 5)
  real:        PDF and ICS timetable exports (Phase 6)
"""
from datetime import date

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response

from app import config
from app.errors import ApiError
from app.models.schemas import (
    AIInterpretRequest,
    AIInterpretResponse,
    Constraints,
    GenerateResult,
    Project,
    ProjectCreate,
    ProjectData,
    TimetableUpdate,
    ValidateRequest,
    ValidateResponse,
)
from app.services import csv_import, exporters, fixtures, rules, storage
from app.services.constraint_validation import reference_errors

router = APIRouter(prefix="/projects", tags=["projects"])


def _load_or_404(project_id: str) -> Project:
    try:
        return storage.load_project(project_id)
    except storage.ProjectNotFound:
        raise HTTPException(status_code=404, detail="Project not found.")


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

    def change(project: Project) -> None:
        errors = reference_errors(body, project.data)
        if errors:
            raise ApiError(422, "VALIDATION_ERROR", "One or more constraint references do not exist in this project.", errors)
        project.constraints = body

    return storage.update_project(project_id, change)


@router.post("/{project_id}/ai-constraints/interpret", response_model=AIInterpretResponse)
def interpret_ai_constraints(project_id: str, body: AIInterpretRequest) -> AIInterpretResponse:
    project = _load_or_404(project_id)
    from app.services import ai_constraints

    try:
        return ai_constraints.interpret(project, body)
    except ai_constraints.AIServiceError as exc:
        raise ApiError(exc.status_code, exc.code, exc.message) from exc


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


@router.post("/{project_id}/import", response_model=None)
async def import_csv(
    project_id: str,
    courses: UploadFile = File(...),
    faculty: UploadFile = File(...),
    rooms: UploadFile = File(...),
    slots: UploadFile = File(...),
) -> Project | JSONResponse:
    project = _load_or_404(project_id)
    uploads = {
        "courses.csv": courses,
        "faculty.csv": faculty,
        "rooms.csv": rooms,
        "slots.csv": slots,
    }
    contents = {
        filename: await upload.read(csv_import.MAX_FILE_BYTES + 1)
        for filename, upload in uploads.items()
    }
    try:
        data = csv_import.parse_project_csv(contents)
    except csv_import.CsvImportError as error:
        status_code = error.status_code
        code = "PAYLOAD_TOO_LARGE" if status_code == 413 else "VALIDATION_ERROR"
        message = "CSV upload exceeds the file size limit." if status_code == 413 else "CSV import failed."
        return JSONResponse(
            status_code=status_code,
            content={"error": {"code": code, "message": message, "details": error.details}},
        )

    def replace_data(current: Project) -> None:
        current.data = data
        # A newly imported dataset can invalidate every old timetable reference.
        current.timetable = []

    return storage.update_project(project_id, replace_data)


@router.get("/{project_id}/export/pdf")
def export_pdf(project_id: str) -> Response:
    project = _load_or_404(project_id)
    try:
        content = exporters.build_pdf(project)
    except exporters.ExportDataError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{exporters.filename(project.name, "pdf")}"'},
    )


@router.get("/{project_id}/export/ics")
def export_ics(project_id: str, term_start: date, term_end: date, timezone: str) -> Response:
    project = _load_or_404(project_id)
    try:
        content = exporters.build_ics(project, term_start, term_end, timezone)
    except exporters.ExportInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except exporters.ExportDataError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return Response(
        content=content,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{exporters.filename(project.name, "ics")}"'},
    )
