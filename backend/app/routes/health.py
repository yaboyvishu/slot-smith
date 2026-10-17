from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health() -> dict:
    """Used by hosting health checks and by the frontend to detect a sleeping server."""
    return {"status": "ok"}
