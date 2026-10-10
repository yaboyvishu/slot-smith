# Auto Timetable Scheduler

> Generate a clash-free college timetable in seconds, and find out exactly why when one can't be made.

**Team Curly Coders** · Built for **TechSpace BuildLab '26** (Problem Statement A06, Advanced track) · Stack: **Next.js (React) + Tailwind CSS + FastAPI + OR-Tools (CP-SAT)**

Repository: <https://github.com/yaboyvishu/slot-smith>

---

## Table of Contents

1. [The Problem](#the-problem)
2. [What It Does](#what-it-does)
3. [Application Architecture](#application-architecture)
4. [How the Solver Works](#how-the-solver-works)
5. [Features](#features)
6. [Tech Stack](#tech-stack)
7. [Getting Started](#getting-started)
8. [Tutorial: How to Use the App](#tutorial-how-to-use-the-app)
9. [API Reference](#api-reference)
10. [Input File Formats (CSV)](#input-file-formats-csv)
11. [Understanding the Results](#understanding-the-results)
12. [Exporting Your Timetable](#exporting-your-timetable)
13. [Troubleshooting](#troubleshooting)
14. [Project Structure](#project-structure)
15. [Benchmark](#benchmark)
16. [Screenshots](#screenshots)
17. [Team](#team)

---

## The Problem

Making a timetable by hand is slow and easy to get wrong. Every course needs a teacher, a room and a time slot, and all of them must fit together at once. One teacher can't be in two places, one room can't host two classes, and a room has to be big enough for the students. Fixing one clash often creates another.

## What It Does

Auto Timetable Scheduler is a web app. You enter your courses, faculty, rooms and time slots, choose your rules, and click **Generate**. A constraint solver (Google OR-Tools CP-SAT) builds a timetable that follows every must-follow rule.

- **Takes your inputs:** courses, faculty, rooms and time slots, entered in editable tables (CSV import is a stretch feature)
- **Applies your rules:** must-follow rules (no teacher clash, no room clash, room capacity) and optional preferences (for example, "Dr. Sharma prefers mornings")
- **Reports a clear status:** *complete*, *complete with unmet preferences*, or *impossible*
- **Explains what failed:** if no timetable exists, a Conflicts panel lists the rules that cannot all be met, in plain language, with a suggested fix
- **Lets you edit** the result in a weekly grid. Every change is re-checked straight away and clashes turn red with a reason
- **Exports** to PDF (to print or share) and ICS (for Google Calendar, Outlook or Apple Calendar)

## Application Architecture

The front end and the back end are separate. The browser talks to the API with JSON over REST, and the API calls the solver and the exporters directly.

```
┌───────────────────────────┐   JSON over REST   ┌───────────────────────────┐   function calls   ┌───────────────────────────┐
│ Browser                   │ ◄────────────────► │ FastAPI (Python)          │ ◄────────────────► │ Solver and exports        │
│ Next.js (React) + Tailwind│                    │ Validation, routes,       │                    │ OR-Tools CP-SAT model     │
│ Screens, editable grid,   │                    │ file storage              │                    │ Conflict explainer        │
│ conflict highlighting     │                    │ Calls solver + exporters  │                    │ ReportLab PDF, ICS        │
└───────────────────────────┘                    └───────────────────────────┘                    └───────────────────────────┘
```

### Main screens

| Screen | What the user does | Uses API |
|---|---|---|
| **1. Data setup** | Adds and edits courses, faculty, rooms and time slots in tabbed, editable tables. Basic validation (for example, a missing teacher). CSV import is a stretch feature. | data endpoints |
| **2. Constraints** | Turns rules on or off. *Must-follow:* no teacher clash, no room clash, room capacity. *Preferences:* for example a teacher's preferred slots. | constraints endpoint |
| **3. Generate and results** | Clicks Generate, sees a loading state, then a status (complete, complete with unmet preferences, or impossible). The timetable appears as a weekly grid that can be filtered by faculty, room or course. | generate endpoint |
| **4. Conflicts panel** | Reads a plain-language list of rules that could not be met, with a suggested fix. Clicking an item highlights the affected cells in the grid. | generate / validate |
| **5. Edit mode** | Moves a class to another slot or room. Clashes turn red immediately. Changes can be undone or saved. | validate / timetable |
| **6. Export** | Downloads the timetable as PDF (to print) or ICS (for a calendar app). | export endpoints |

### Main user workflows

- **First timetable:** Data setup → Constraints → Generate → review the grid → Export.
- **Fixing an impossible case:** Generate returns *impossible*, and the Conflicts panel lists the blocking rules (for example, no room big enough for a 60-student class). The user changes the data or switches off a rule, then generates again.
- **Manual editing:** The user moves a class in the grid. The app re-checks the timetable straight away and shows any new clash in red with a reason. The user fixes it or undoes the move, then saves.

### How rules, schedules, conflicts and edits work together

- **Constraints:** Must-follow rules always apply. Preferences are optional and the solver respects as many as it can. The result tells you how many preferences were met.
- **Generated schedules:** Shown as a weekly grid with course, teacher and room in each cell. You can filter the view and compare it against preferences.
- **Conflicts:** There are two kinds. *Solver conflicts* (no valid timetable exists) are explained in the Conflicts panel. *Edit conflicts* (a manual change causes a clash) are marked red on the grid with the reason.
- **Edits:** Every change is sent to the `validate` endpoint, so the same rule logic is used for generating and for checking. This stops the grid and the solver from disagreeing.

## How the Solver Works

1. **Input.** The API receives the courses, who teaches them, the rooms and the time slots.
2. **Model.** For every possible (course, room, slot) combination, the solver decides yes or no. Each constraint becomes a rule over those decisions.
   - *Hard (must-follow) constraints* always hold: no teacher in two places at once, no room double-booked, room capacity is enough.
   - *Soft constraints (preferences)* are goals the solver tries to satisfy as best it can, such as preferred time slots.
3. **Solve.** CP-SAT searches for an assignment that satisfies every hard constraint and as many soft ones as possible.
4. **Explain.** If the problem is impossible, each constraint group is switched on and off to find which ones conflict. The API returns them as simple sentences with a suggested fix.
5. **Validate edits.** Manual changes go through the same rule logic via `POST /validate`, so edits and generation always agree.

## Features

| Feature | Type | Status |
|---|---|---|
| Input courses, faculty, rooms, slots | Core | ☐ |
| Constraints (clashes, capacity, preferences) | Core | ☐ |
| Timetable generation with CP-SAT | Core | ☐ |
| Explanation of unsatisfied constraints (Conflicts panel) | Core | ☐ |
| Editable timetable grid with instant clash checking | Core | ☐ |
| PDF export | Core | ☐ |
| ICS export | Core | ☐ |
| Benchmark results | Required | ☐ |
| CSV import of courses, faculty, rooms and slots | Stretch | ☐ |
| Colour-coded views per faculty and per room | Stretch | ☐ |
| Save and reopen timetables | Stretch | ☐ |

*(Tick these off as you finish them.)*

## Tech Stack

| Layer | Technology |
|---|---|
| **Front end** | [Next.js](https://nextjs.org) (React), [Tailwind CSS](https://tailwindcss.com), JavaScript |
| **Back end** | [FastAPI](https://fastapi.tiangolo.com) (Python 3), Pydantic models for request and response validation |
| **Solver** | [Google OR-Tools](https://developers.google.com/optimization) (CP-SAT) |
| **PDF export** | ReportLab |
| **Calendar export** | `ics` library |
| **Storage** | JSON files (SQLite if time allows) |

**Why this stack:** Python is beginner-friendly and OR-Tools is built for scheduling problems like this one. FastAPI is also Python, so the solver and the API share one language, and it generates interactive API docs for testing. React/Next.js gives us an interactive, editable timetable grid, and keeping the front end and API separate is how real applications are built.

## Getting Started

### Prerequisites
- Python 3.10 or newer
- Node.js 18 or newer (with npm)
- Git

### Installation

```bash
git clone https://github.com/yaboyvishu/slot-smith.git
cd slot-smith
```

**Back end (FastAPI)**

```bash
cd backend
python -m venv venv
source venv/bin/activate        # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**Front end (Next.js)**

```bash
cd frontend
npm install
```

### Run the app

You need two terminals, one for each side.

**Terminal 1: API**

```bash
cd backend
uvicorn main:app --reload
```

The API runs at `http://localhost:8000`. Interactive API docs are at `http://localhost:8000/docs`.

**Terminal 2: Web app**

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000` in your browser.

> The commands above assume the layout in [Project Structure](#project-structure). If your entry file or folder names differ, update them here.

---

## Tutorial: How to Use the App

This walkthrough takes you from an empty app to a finished timetable. Allow about 10 minutes the first time.

### Step 1: Start the app
Start the API and the web app as shown in [Run the app](#run-the-app), then open `http://localhost:3000`.

### Step 2: Data setup
Open the **Data setup** screen. You need four kinds of information, each in its own tab with an editable table. If CSV import is enabled in your version, you can upload a CSV file instead. See [Input File Formats](#input-file-formats-csv) for the exact columns.

| Data | What it means | Example |
|---|---|---|
| **Courses** | What needs to be scheduled, who teaches it, how many students, and how many sessions per week | CS101, Dr. Sharma, 60 students, 3 sessions |
| **Faculty** | The teachers (and optionally their preferred times) | Dr. Sharma, prefers mornings |
| **Rooms** | Where classes can happen and how many people fit | R101, capacity 70 |
| **Time slots** | When classes can happen | Mon 09:00-10:00 |

The app does basic checks as you type, for example flagging a course with no teacher.

**Tip:** to just try the app, use the sample dataset in the `data/` folder first.

### Step 3: Constraints
Open the **Constraints** screen and choose your rules.

**Must-follow rules** (on by default):
- **No teacher clash:** a teacher can't teach two classes in the same slot.
- **No room clash:** a room can't host two classes in the same slot.
- **Room capacity:** a room must be big enough for the course's students.

**Preferences** (optional): things like "Dr. Sharma prefers morning slots." The solver respects as many as it can but may break some if it has no other choice.

### Step 4: Generate
Open **Generate and results** and click **Generate**. A loading state shows while the solver works. Small inputs finish almost instantly. Bigger ones can take a few seconds.

### Step 5: Read the result
The result has one of three statuses:

| Status | Meaning |
|---|---|
| **Complete** | A full timetable was found and every rule and preference is met |
| **Complete with unmet preferences** | A valid timetable was found, but some preferences could not be met. The app shows how many were met |
| **Impossible** | No valid timetable exists. The Conflicts panel explains why |

When a timetable exists it appears as a weekly grid with course, teacher and room in each cell. Use the filters to view it by **faculty**, **room** or **course**.

### Step 6: Use the Conflicts panel (if needed)
If the status is *impossible*, the **Conflicts panel** lists the rules that could not be met, in plain language, each with a suggested fix. Click an item to highlight the affected cells in the grid. Then change your data or switch off a rule and click **Generate** again.

### Step 7: Edit the grid (optional)
Switch to **Edit mode** to move a class to another slot or room. After each change the app re-checks the timetable. If your change creates a clash, the cell turns **red** and shows the reason. You can **undo** the move or fix it, then **save**.

### Step 8: Export
Download the timetable as a **PDF** to print or share, or as an **ICS** file to import into a calendar app. See [Exporting Your Timetable](#exporting-your-timetable).

---

## API Reference

The back end is a REST API built with FastAPI. Request and response shapes are defined with Pydantic models, so bad input is rejected with a clear error. When the API is running, full interactive documentation is available at `http://localhost:8000/docs`, which lets you test the back end before using the front end.

| Method and endpoint | Purpose |
|---|---|
| `POST /api/projects` | Create a new scheduling project |
| `GET /api/projects/{id}` | Load a saved project with its data and timetable |
| `PUT /api/projects/{id}/data` | Save courses, faculty, rooms and slots |
| `PUT /api/projects/{id}/constraints` | Save which rules are on and the preferences |
| `POST /api/projects/{id}/generate` | Run the solver. Returns status, timetable and list of unmet constraints |
| `POST /api/projects/{id}/validate` | Check an edited timetable and return any clashes with reasons |
| `PUT /api/projects/{id}/timetable` | Save the user's manual edits |
| `GET /api/projects/{id}/export/pdf` | Download the timetable as PDF |
| `GET /api/projects/{id}/export/ics` | Download the timetable as ICS |
| `POST /api/projects/{id}/import` *(stretch)* | Upload CSV files to fill the data |

---

## Input File Formats (CSV)

CSV import is a stretch feature. If it is enabled in your version, each file must have the columns below (first row = headers, text files saved as `.csv`). Column names are case-sensitive. A ready-made example of each file is in the `data/` folder.

> If your final code uses different column names, update this section so it matches.

### `courses.csv`

| Column | Meaning |
|---|---|
| `course_id` | Short unique code, e.g. `CS101` |
| `name` | Full course name |
| `faculty` | Name of the teacher (must match a name in your faculty data) |
| `students` | Number of students enrolled |
| `hours_per_week` | How many sessions the course needs each week |

```csv
course_id,name,faculty,students,hours_per_week
CS101,Intro to Programming,Dr. Sharma,60,3
MA102,Calculus,Dr. Verma,55,3
PH103,Physics,Dr. Rao,40,2
```

### `rooms.csv`

| Column | Meaning |
|---|---|
| `room_id` | Short unique name, e.g. `R101` |
| `capacity` | Maximum number of students |

```csv
room_id,capacity
R101,70
R102,60
LAB1,40
```

### `slots.csv`

| Column | Meaning |
|---|---|
| `slot_id` | Short unique code, e.g. `S1` |
| `day` | Day of the week (`Mon`, `Tue`, ...) |
| `start` | Start time in 24-hour format |
| `end` | End time in 24-hour format |

```csv
slot_id,day,start,end
S1,Mon,09:00,10:00
S2,Mon,10:00,11:00
S3,Tue,09:00,10:00
```

### `preferences.csv` (optional)

| Column | Meaning |
|---|---|
| `faculty` | Teacher's name |
| `preferred_slot` | A `slot_id` they would like to teach in |

```csv
faculty,preferred_slot
Dr. Sharma,S1
Dr. Sharma,S2
Dr. Verma,S3
```

**Important:** PDF files can't be uploaded as input. PDF is for **export only**.

---

## Understanding the Results

### When a timetable is found
Every class has a teacher, a room and a slot, with no clashes and with enough room capacity. If you added preferences, the app tells you how many it was able to respect. If some could not be met, the status is *complete with unmet preferences*.

### When no timetable exists
The status is *impossible*. The Conflicts panel lists the rules that cannot all be true together. Typical reasons:

| Message (example) | What it means | How to fix it |
|---|---|---|
| "No room is big enough for CS101 (60 students)." | Every room is smaller than the class | Add a bigger room or split the class |
| "Dr. Sharma is needed in more sessions than there are slots." | A teacher is overloaded | Add slots or move a course to another teacher |
| "Not enough room-slot combinations for all sessions." | Too many classes, too little space or time | Add rooms or slots, or reduce sessions per week |

*(These messages are examples. Update them to match what your app actually shows.)*

### When an edit causes a clash
Edit conflicts are different from solver conflicts. If you move a class and it creates a clash, the affected cells turn **red** and the reason is shown. Undo the move or fix the clash, then save.

---

## Exporting Your Timetable

| Format | Use it to | How |
|---|---|---|
| **PDF** | Print the timetable or share it with others | Click **Download PDF** on the Export screen |
| **ICS** | Add the classes to Google Calendar, Outlook or Apple Calendar | Click **Download ICS**, then import the file in your calendar app |

To import an ICS file into **Google Calendar**: open Calendar on the web, click the gear icon, choose **Settings**, then **Import & export**, select the `.ics` file and click **Import**.

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| `uvicorn: command not found` | Virtual environment not active or packages not installed | Activate `venv` in `backend/`, then run `pip install -r requirements.txt` |
| `ModuleNotFoundError: ortools` | OR-Tools not installed | Run `pip install ortools` |
| `npm: command not found` or `next: not found` | Node.js missing or front-end packages not installed | Install Node.js, then run `npm install` in `frontend/` |
| Web app loads but shows a network error | The API isn't running, or the front end points to the wrong address | Start the API on port 8000 and check the API URL setting in the front end |
| Browser blocks requests to the API (CORS error) | API doesn't allow the front end's address | Allow `http://localhost:3000` in the FastAPI CORS settings |
| Port already in use | Another program uses 3000 or 8000 | Stop it, or start the server on a different port |
| App says a faculty name isn't found | Spelling differs between courses and faculty data | Make the names match exactly |
| CSV upload fails | Wrong column names or extra blank rows | Compare against the formats above |
| Solver takes very long | Input is large | Reduce slots or courses to test, or check the [benchmark](#benchmark) |
| Status is "impossible" | Rules conflict | Read the Conflicts panel and apply the suggested fix |

---

## Project Structure

> Update this to match your final layout.

```
.
├── frontend/               # Next.js (React) + Tailwind app
│   ├── app/                # Screens: data setup, constraints, results, edit, export
│   └── components/         # Timetable grid, conflicts panel, editable tables
├── backend/                # FastAPI app
│   ├── main.py             # API routes
│   ├── schemas/            # Pydantic models for requests and responses
│   ├── solver/             # CP-SAT model, constraints, conflict explainer
│   ├── export/             # PDF (ReportLab) and ICS export
│   └── storage/            # JSON project files
├── data/                   # Sample input files (CSV)
├── benchmarks/             # Benchmark scripts and results
└── README.md
```

## Benchmark

We tested the solver on inputs of increasing size.

| Size | Courses | Faculty | Rooms | Slots | Solve time |
|---|---|---|---|---|---|
| Small | ... | ... | ... | ... | ... |
| Medium | ... | ... | ... | ... | ... |
| Large | ... | ... | ... | ... | ... |

*(Fill in with your real measurements.)*

## Screenshots

*(Add screenshots of the data setup screen, the generated timetable, the Conflicts panel and edit mode with a red clash.)*

## Team

**Team Curly Coders** (Advanced track, squad)

| Name | Year / Program | Role |
|---|---|---|
| **Tishya Thareja** | 1st Year / B.Tech CSE (Core) | *(add role)* |
| **Ishika** | 1st Year / B.Tech CSE (Core) | *(add role)* |
| **Prateek** | 1st Year / B.Tech CSE (AI/ML) | *(add role)* |

## What We Learned

*(Write 3-4 lines at the end: what was hard, what surprised you, what you'd do next.)*

## Biggest Challenges

- Explaining in simple words why a timetable can't be built when many rules interact, while keeping the solver fast as the input grows.
- Keeping the editable grid and the solver in agreement, so every manual edit is re-checked for clashes straight away.

## Acknowledgements

- [Google OR-Tools](https://developers.google.com/optimization)
- [Next.js](https://nextjs.org), [FastAPI](https://fastapi.tiangolo.com) and [Tailwind CSS](https://tailwindcss.com)
- TechSpace BuildLab '26 organizers and the [base repository](https://github.com/Techspace-srmuh/timetable-scheduler)
