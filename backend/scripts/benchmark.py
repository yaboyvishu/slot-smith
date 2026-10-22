"""Run a repeatable local benchmark of the timetable solver.

Run from the backend directory with ``python scripts/benchmark.py``. The
datasets are generated deterministically here so benchmark inputs need no
external files and cannot be confused with the frontend's mock fixtures.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Allow invocation from any current working directory.
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import config  # noqa: E402
from app.models.schemas import Constraints, Course, Faculty, Project, ProjectData, Room, TimeSlot  # noqa: E402
from app.services import generator, rules  # noqa: E402

try:
    import ortools  # noqa: E402
except ImportError:  # pragma: no cover - the backend requirements install OR-Tools
    ortools = None


SUITES = {
    "small": {"courses": 6, "teachers": 2, "rooms": 3, "sessions": 2},
    "medium": {"courses": 9, "teachers": 3, "rooms": 4, "sessions": 2},
    "large": {"courses": 15, "teachers": 5, "rooms": 6, "sessions": 2},
}
DAYS = ("Mon", "Tue", "Wed", "Thu", "Fri")


def make_project(name: str, seed: int) -> Project:
    """Build a stable, feasible workload with mixed one- and two-slot sessions."""
    spec = SUITES[name]
    randomizer = random.Random(seed)
    slots = []
    for day in DAYS:
        for hour in range(9, 15):
            start = f"{hour:02d}:00"
            end = f"{hour + 1:02d}:00"
            slots.append(TimeSlot(
                id=f"{day.upper()}_{hour:02d}",
                day=day,
                start=start,
                end=end,
                label=f"{day} {start}-{end}",
            ))

    faculty = [
        Faculty(
            id=f"T{number:02d}",
            name=f"Benchmark Teacher {number:02d}",
            preferred_slot_ids=[slot.id for slot in slots if slot.start in ("09:00", "10:00")],
        )
        for number in range(1, spec["teachers"] + 1)
    ]
    rooms = [
        Room(id=f"R{number:02d}", name=f"Benchmark Room {number:02d}", capacity=capacity)
        for number, capacity in enumerate((40, 70, 100, 130, 160, 190, 220, 250)[:spec["rooms"]], start=1)
    ]
    courses = []
    for index in range(spec["courses"]):
        teacher_number = index // 3 + 1
        courses.append(Course(
            id=f"C{index + 1:02d}",
            code=f"BM{index + 1:03d}",
            name=f"Benchmark Course {index + 1:02d}",
            faculty_id=f"T{teacher_number:02d}",
            student_count=randomizer.randint(20, 100),
            sessions_per_week=spec["sessions"],
            session_length_slots=2 if index % 4 == 3 else 1,
        ))

    return Project(
        id=f"benchmark-{name}",
        name=f"Benchmark {name.title()}",
        data=ProjectData(courses=courses, faculty=faculty, rooms=rooms, slots=slots),
        constraints=Constraints(),
    )


def count_placement_options(project: Project) -> int:
    """Count candidate (session, start, room) choices before clash constraints."""
    total = 0
    for course in project.data.courses:
        starts = sum(
            len(rules.slot_run(project.data.slots, slot.id, course.session_length_slots))
            == course.session_length_slots
            for slot in project.data.slots
        )
        compatible_rooms = sum(
            not project.constraints.room_capacity or room.capacity >= course.student_count
            for room in project.data.rooms
        )
        total += starts * compatible_rooms * course.sessions_per_week
    return total


def run_case(name: str, seed: int, time_limit: float) -> dict[str, Any]:
    project = make_project(name, seed)
    session_count = sum(course.sessions_per_week for course in project.data.courses)
    started = time.perf_counter()
    result: dict[str, Any] = {
        "suite": name,
        "courses": len(project.data.courses),
        "sessions_requested": session_count,
        "teachers": len(project.data.faculty),
        "rooms": len(project.data.rooms),
        "slots": len(project.data.slots),
        "candidate_placement_options": count_placement_options(project),
    }
    try:
        generated = generator.generate(project, time_limit=time_limit)
        result["status"] = generated.status
        result["timetable_entries"] = len(generated.timetable)
        result["clash_count"] = len(rules.find_clashes(
            project.data, project.constraints, generated.timetable
        ))
        result["preferences_met"] = generated.preferences_met
        result["preferences_total"] = generated.preferences_total
        result["conflict_types"] = sorted({item.type for item in generated.unmet_constraints})
    except generator.SolverTimeout:
        result.update({
            "status": "timeout",
            "timetable_entries": 0,
            "clash_count": None,
            "preferences_met": None,
            "preferences_total": None,
            "conflict_types": [],
        })
    except Exception as error:  # keep the other suite results and record the failure
        result.update({
            "status": "error",
            "error": f"{type(error).__name__}: {error}",
            "timetable_entries": None,
            "clash_count": None,
            "preferences_met": None,
            "preferences_total": None,
            "conflict_types": [],
        })
    result["elapsed_seconds"] = round(time.perf_counter() - started, 3)
    return result


def print_report(report: dict[str, Any]) -> None:
    print("Slot Smith solver benchmark")
    print(f"Started: {report['created_at_utc']}")
    print(
        f"Python {report['environment']['python']} | OR-Tools {report['environment']['ortools']} | "
        f"time limit {report['settings']['time_limit_seconds']}s | "
        f"workers {report['settings']['workers']} | seed {report['settings']['seed']}"
    )
    headings = ("Suite", "Status", "Courses", "Sessions", "Options", "Time (s)", "Clashes", "Prefs")
    rows = []
    for case in report["results"]:
        prefs = "—" if case["preferences_met"] is None else (
            f"{case['preferences_met']}/{case['preferences_total']}"
        )
        rows.append((
            case["suite"], case["status"], str(case["courses"]),
            str(case["sessions_requested"]), str(case["candidate_placement_options"]),
            str(case["elapsed_seconds"]), str(case["clash_count"]), prefs,
        ))
    widths = [max(len(headings[i]), *(len(row[i]) for row in rows)) for i in range(len(headings))]
    print(" | ".join(heading.ljust(widths[i]) for i, heading in enumerate(headings)))
    print("-+-".join("-" * width for width in widths))
    for row in rows:
        print(" | ".join(value.ljust(widths[i]) for i, value in enumerate(row)))
    for case in report["results"]:
        if case.get("error"):
            print(f"{case['suite']} error: {case['error']}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suite", choices=("all", *SUITES), default="all", help="workload to run")
    parser.add_argument("--time-limit", type=float, default=10.0, help="solver limit per workload in seconds")
    parser.add_argument("--workers", type=int, default=1, help="CP-SAT worker count (1 gives more repeatable runs)")
    parser.add_argument("--seed", type=int, default=2026, help="seed used to build the synthetic workloads")
    parser.add_argument("--output", type=Path, help="optional path to save the full JSON report")
    args = parser.parse_args()
    if args.time_limit <= 0:
        parser.error("--time-limit must be greater than zero")
    if args.workers < 1:
        parser.error("--workers must be at least one")
    return args


def main() -> int:
    args = parse_args()
    os.environ["SOLVER_WORKERS"] = str(args.workers)
    selected = tuple(SUITES) if args.suite == "all" else (args.suite,)
    report = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "environment": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "ortools": getattr(ortools, "__version__", "not installed"),
        },
        "settings": {
            "time_limit_seconds": args.time_limit,
            "workers": config.solver_workers(),
            "seed": args.seed,
        },
        "results": [run_case(name, args.seed, args.time_limit) for name in selected],
    }
    print_report(report)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"JSON report saved to {args.output}")
    return 1 if any(result["status"] == "error" for result in report["results"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
