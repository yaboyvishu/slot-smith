"""Small types shared by the solver and the generator (no OR-Tools import here)."""
from dataclasses import dataclass, field
from typing import Literal

from app.models.schemas import TimetableEntry


@dataclass
class SolveOutcome:
    status: Literal["solved", "infeasible", "timeout"]
    entries: list[TimetableEntry] = field(default_factory=list)
    # How many teachers' preferences the solver believes it met (None = not reported).
    # Only a sanity check: the generator recounts with rules.preference_stats.
    preferences_met: int | None = None
