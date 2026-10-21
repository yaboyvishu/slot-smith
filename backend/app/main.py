from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import config
from app.routes import health, projects

app = FastAPI(
    title="Auto Timetable Scheduler API",
    version="0.1.0",
    description="Backend for Team Curly Coders' timetable scheduler. Contract: docs/api-contract.md",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.allowed_origins(),
    allow_origin_regex=config.allowed_origin_regex(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(projects.router, prefix="/api")


# ---- one error format for every failure ----
# {"error": {"code": "...", "message": "...", "details": [...]}}

def error_response(status_code: int, code: str, message: str, details: list | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "details": details or []}},
    )


_HTTP_CODES = {
    400: "BAD_REQUEST",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    422: "VALIDATION_ERROR",
    501: "NOT_IMPLEMENTED",
    504: "SOLVER_TIMEOUT",
}


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    details = [
        {"field": ".".join(str(part) for part in err.get("loc", ())), "message": err.get("msg", "")}
        for err in exc.errors()
    ]
    return error_response(422, "VALIDATION_ERROR", "The request data is not valid.", details)


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(request: Request, exc: StarletteHTTPException):
    code = _HTTP_CODES.get(exc.status_code, "HTTP_ERROR")
    return error_response(exc.status_code, code, str(exc.detail))


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception):
    return error_response(500, "INTERNAL_ERROR", "Something went wrong on the server.")
