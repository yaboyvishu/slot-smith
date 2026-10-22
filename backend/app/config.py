"""Settings read from environment variables. Nothing is hard-coded."""
import os


def allowed_origins() -> list[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
    return [o.strip() for o in raw.split(",") if o.strip()]


def allowed_origin_regex() -> str | None:
    # Default allows Vercel preview deployments. Set to an empty string to disable.
    value = os.getenv("ALLOWED_ORIGIN_REGEX", r"https://.*\.vercel\.app")
    return value or None


def mock_mode() -> bool:
    return os.getenv("MOCK", "0") == "1"


def data_dir() -> str:
    return os.getenv("DATA_DIR", "data")


def solver_time_limit() -> float:
    """Seconds the solver may run before generate gives up (HTTP 504)."""
    try:
        return float(os.getenv("SOLVER_TIME_LIMIT", "10"))
    except ValueError:
        return 10.0


def solver_workers() -> int:
    """CP-SAT search threads. Use 1 on very small hosts; 4 is a good laptop default."""
    try:
        return max(1, int(os.getenv("SOLVER_WORKERS", "4")))
    except ValueError:
        return 4


def explain_time_limit() -> float:
    """Seconds spent working out WHY a project is impossible (generate stays quick if exceeded)."""
    try:
        return float(os.getenv("EXPLAIN_TIME_LIMIT", "6"))
    except ValueError:
        return 6.0


def gemini_api_key() -> str | None:
    """Secret key read only by the backend process."""
    value = os.getenv("GEMINI_API_KEY", "").strip()
    return value or None


def gemini_model() -> str:
    return os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite").strip() or "gemini-3.1-flash-lite"


def gemini_timeout_seconds() -> float:
    try:
        return max(1.0, float(os.getenv("GEMINI_TIMEOUT_SECONDS", "20")))
    except ValueError:
        return 20.0
