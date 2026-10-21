"""Generate a timetable from random data and print it as a grid.

Run from the backend folder:
    py scripts/random_demo.py                      # defaults
    py scripts/random_demo.py --seed 7 --courses 20 --teachers 8 --rooms 5
    py scripts/random_demo.py --json my_project.json   # also save the data (for the API)
"""
import argparse
import json
import random
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.models.schemas import Constraints, Course, Faculty, Project, ProjectData, Room, TimeSlot  # noqa: E402
from app.services import generator  # noqa: E402

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
NAMES = ["Sharma", "Rao", "Iyer", "Gupta", "Khan", "Singh", "Mehta", "Nair", "Das", "Verma",
         "Joshi", "Patel", "Reddy", "Bose", "Kapoor", "Menon"]
SUBJECTS = ["Data Structures", "Algorithms", "Databases", "Networks", "OS", "AI", "Maths", "Physics",
            "Chemistry", "Electronics", "Thermodynamics", "Economics", "Statistics", "Compilers",
            "Graphics", "Security", "Cloud", "Robotics", "Ethics", "Writing"]


def build(args) -> Project:
    rng = random.Random(args.seed)
    slots = []
    for day in DAYS[: args.days]:
        for p in range(args.periods):
            h = 9 + p + (1 if p >= 4 else 0)  # a lunch gap after the 4th period
            slots.append(TimeSlot(id=f"{day.upper()}_{h:02d}", day=day, start=f"{h:02d}:00", end=f"{h + 1:02d}:00",
                                  label=f"{day} {h:02d}:00-{h + 1:02d}:00"))
    faculty = [
        Faculty(id=f"F{i + 1}", name=f"Prof. {NAMES[i % len(NAMES)]}",
                preferred_slot_ids=[s.id for s in rng.sample(slots, k=min(len(slots), rng.choice([0, 0, 8, 12])))])
        for i in range(args.teachers)
    ]
    sizes = [30, 40, 60, 80]
    rooms = [Room(id=f"R{i + 1}", name=f"Room {101 + i}", capacity=sizes[i % len(sizes)] + rng.choice([0, 10]))
             for i in range(args.rooms)]
    courses = []
    for i in range(args.courses):
        lab = rng.random() < 0.2
        courses.append(Course(
            id=f"C{i + 1}", code=f"CS{101 + i}", name=SUBJECTS[i % len(SUBJECTS)] + (" Lab" if lab else ""),
            faculty_id=faculty[i % len(faculty)].id, student_count=rng.choice([20, 30, 45, 55]),
            sessions_per_week=1 if lab else rng.choice([2, 3]), session_length_slots=2 if lab else 1,
        ))
    return Project(id="random", name="Random demo", data=ProjectData(courses=courses, faculty=faculty, rooms=rooms, slots=slots),
                   constraints=Constraints())


def show_grid(project, result):
    data = project.data
    slot_by_id = {s.id: s for s in data.slots}
    course = {c.id: c for c in data.courses}
    teacher = {f.id: f.name for f in data.faculty}
    room = {r.id: r.name for r in data.rooms}
    cell = {}
    for e in result.timetable:
        for sid in e.slot_ids:
            cell[sid] = cell.get(sid, []) + [f"{course[e.course_id].code} {room[e.room_id]} ({teacher[e.faculty_id].split()[-1]})"]
    days = sorted({s.day for s in data.slots}, key=DAYS.index)
    for day in days:
        print(f"\n== {day} ==")
        for s in sorted((s for s in data.slots if s.day == day), key=lambda s: s.start):
            items = cell.get(s.id, [])
            print(f"  {s.start}-{s.end}  " + ("  |  ".join(items) if items else "-"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--courses", type=int, default=12)
    ap.add_argument("--teachers", type=int, default=6)
    ap.add_argument("--rooms", type=int, default=4)
    ap.add_argument("--days", type=int, default=5)
    ap.add_argument("--periods", type=int, default=6)
    ap.add_argument("--json", help="also save the project data to this file")
    args = ap.parse_args()

    project = build(args)
    d = project.data
    print(f"Random project: {len(d.courses)} courses, {len(d.faculty)} teachers, {len(d.rooms)} rooms, {len(d.slots)} slots (seed {args.seed})")
    if args.json:
        Path(args.json).write_text(json.dumps(project.model_dump(), indent=2))
        print(f"Saved project to {args.json}")

    start = time.time()
    try:
        result = generator.generate(project)
    except generator.SolverTimeout:
        print("The solver ran out of time without finding any timetable (this would be a 504).")
        return
    print(f"Solved in {time.time() - start:.1f}s -> status: {result.status}")
    if result.status == "impossible":
        for c in result.unmet_constraints:
            print(f"\n- [{c.type}] {c.message}\n  fix: {c.suggested_fix}")
        return
    print(f"Teacher preferences met: {result.preferences_met} of {result.preferences_total}")
    show_grid(project, result)
    for c in result.unmet_constraints:
        print(f"\n- [{c.type}] {c.message}")


if __name__ == "__main__":
    main()
