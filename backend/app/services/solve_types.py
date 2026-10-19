"""Small types shared by the solver and the generator (no OR-Tools import here)."""
from dataclasses import dataclass, field
from typing import Literal

from app.models.schemas import TimetableEntry


@dataclass
class SolveOutcome:
    status: Literal["solved", "infeasible", "timeout"]
    entries: list[TimetableEntry] = field(default_factory=list)
