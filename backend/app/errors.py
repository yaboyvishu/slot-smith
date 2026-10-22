"""Application errors that carry the API's standard error envelope fields."""
from fastapi import HTTPException


class ApiError(HTTPException):
    def __init__(self, status_code: int, code: str, message: str, details: list[dict] | None = None):
        super().__init__(status_code=status_code, detail=message)
        self.api_code = code
        self.details = details or []
