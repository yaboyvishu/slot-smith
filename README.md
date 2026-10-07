# Auto Timetable Scheduler

> Generate a clash-free college timetable in seconds, and find out exactly why when one can't be made.

**Team Curly Coders** · Built for **TechSpace BuildLab '26** (Problem Statement A06) · Stack: **Python + OR-Tools (CP-SAT) + Streamlit**

Repository: <https://github.com/yaboyvishu/slot-smith>

---

## Table of Contents

1. [The Problem](#the-problem)
2. [What It Does](#what-it-does)
3. [How It Works](#how-it-works)
4. [Features](#features)
5. [Tech Stack](#tech-stack)
6. [Getting Started](#getting-started)
7. [Tutorial: How to Use the App](#tutorial-how-to-use-the-app)
8. [Input File Formats (CSV)](#input-file-formats-csv)
9. [Understanding the Results](#understanding-the-results)
10. [Exporting Your Timetable](#exporting-your-timetable)
11. [Troubleshooting](#troubleshooting)
12. [Project Structure](#project-structure)
13. [Benchmark](#benchmark)
14. [Screenshots](#screenshots)
15. [Team](#team)

---

## The Problem

Making a timetable by hand is slow and easy to get wrong. Every course needs a teacher, a room and a time slot, and all of them must fit together at once. One teacher can't be in two places, one room can't host two classes, and a room has to be big enough for the students. Fixing one clash often creates another.

## What It Does

Auto Timetable Scheduler takes your courses, faculty, rooms and time slots, then builds a timetable that follows all your rules.

- **Takes your inputs:** courses, faculty, rooms and time slots, entered in the app (CSV upload is a stretch feature)
- **Applies your constraints:** no faculty clashes, no room clashes, room capacity, and preferences (for example, "Prof. A prefers mornings")
- **Generates a timetable** using Google OR-Tools' CP-SAT solver
- **Explains what failed:** if no perfect timetable exists, it tells you which constraints couldn't be satisfied and why, in plain language
- **Lets you edit** the result in an interactive grid, and re-checks for clashes after every change
- **Exports** to PDF (to print or share) and ICS (to import into Google Calendar, Outlook or Apple Calendar)

## How It Works

```
 Inputs                    Solver                     Output
┌──────────────┐     ┌───────────────────┐     ┌────────────────────┐
│ Courses      │     │ Build a CP-SAT    │     │ Timetable grid     │
│ Faculty      │ ──► │ model with hard   │ ──► │ (editable)         │
│ Rooms        │     │ and soft          │     │ PDF / ICS export   │
│ Time slots   │     │ constraints       │     │ Explanation of any │
│ Constraints  │     │ and solve it      │     │ unmet constraints  │
└──────────────┘     └───────────────────┘     └────────────────────┘
```

1. **Input.** You provide the courses, who teaches them, the available rooms and the time slots.
2. **Model.** For every possible (course, room, slot) combination, the solver decides yes or no. Each constraint becomes a rule over those decisions.
   - *Hard constraints* must always hold: no teacher in two places at once, no room double-booked, room capacity is enough.
   - *Soft constraints* are preferences the solver tries to satisfy as best it can, such as preferred time slots.
3. **Solve.** CP-SAT searches for an assignment that satisfies every hard constraint and as many soft ones as possible.
4. **Explain.** If the problem is impossible, each constraint group is switched on and off to find which ones conflict. The app then reports them in simple sentences.
5. **Edit and export.** The result appears in a grid you can adjust by hand, then download as PDF or ICS.

## Features

| Feature | Type | Status |
|---|---|---|
| Input courses, faculty, rooms, slots | Core | ☐ |
| Constraints (clashes, capacity, preferences) | Core | ☐ |
| Timetable generation with CP-SAT | Core | ☐ |
| Explanation of unsatisfied constraints | Core | ☐ |
| Editable timetable grid | Core | ☐ |
| PDF export | Core | ☐ |
| ICS export | Core | ☐ |
| Benchmark results | Required | ☐ |
| CSV import of courses, faculty, rooms and slots | Stretch | ☐ |
| Colour-coded views per faculty and per room | Stretch | ☐ |
| Save and reopen timetables | Stretch | ☐ |

*(Tick these off as you finish them.)*

## Tech Stack

- **Language:** Python 3
- **Solver:** [Google OR-Tools](https://developers.google.com/optimization) (CP-SAT)
- **Interface:** [Streamlit](https://streamlit.io)
- **PDF export:** ReportLab or FPDF
- **Calendar export:** `ics` library
- **Data:** JSON / CSV files

## Getting Started

### Prerequisites
- Python 3.10 or newer
- Git

### Installation

```bash
git clone https://github.com/yaboyvishu/slot-smith.git
cd slot-smith

python -m venv venv
source venv/bin/activate        # On Windows: venv\Scripts\activate

pip install -r requirements.txt
```

### Run the app

```bash
streamlit run app.py
```

Then open the local address Streamlit prints (usually `http://localhost:8501`).

---

## Tutorial: How to Use the App

This walkthrough takes you from an empty app to a finished timetable. Allow about 10 minutes the first time.

### Step 1: Start the app
Run `streamlit run app.py` and open the address shown in your terminal. You'll see the input page.

### Step 2: Add your data
You need four kinds of information. You can enter each one in the app's editable tables, or (if CSV import is enabled in your version) upload a CSV file for each. See [Input File Formats](#input-file-formats-csv) for the exact columns.

| Data | What it means | Example |
|---|---|---|
| **Courses** | What needs to be scheduled, who teaches it, how many students, and how many sessions per week | CS101, Dr. Sharma, 60 students, 3 sessions |
| **Faculty** | The teachers (and optionally their preferred times) | Dr. Sharma, prefers mornings |
| **Rooms** | Where classes can happen and how many people fit | R101, capacity 70 |
| **Time slots** | When classes can happen | Mon 09:00-10:00 |

**Tip:** if you just want to try the app, use the sample dataset in the `data/` folder first.

### Step 3: Choose your constraints
Constraints are the rules the timetable must follow.

- **No faculty clashes** (always on): a teacher can't teach two classes in the same slot.
- **No room clashes** (always on): a room can't host two classes in the same slot.
- **Room capacity** (always on): a room must be big enough for the course's students.
- **Preferences** (optional): things like "Dr. Sharma prefers morning slots." The solver tries to respect these but may break them if it has no other choice.

### Step 4: Generate the timetable
Click **Generate**. The solver searches for an arrangement that follows every required rule. Small inputs finish almost instantly. Bigger ones can take a few seconds.

### Step 5: Read the result
- **If a timetable was found:** it appears as a grid, with days and time slots across and each class shown in its cell with course, teacher and room.
- **If no timetable exists:** the app shows an explanation panel listing which constraints could not be satisfied and why. See [Understanding the Results](#understanding-the-results).

### Step 6: Edit the grid (optional)
Click any cell to change it, for example to move a class to another room or slot. After each edit the app re-checks the whole timetable and warns you if your change creates a clash.

### Step 7: Export
Download your timetable as a **PDF** to print or share, or as an **ICS** file to import into a calendar app. See [Exporting Your Timetable](#exporting-your-timetable).

---

## Input File Formats (CSV)

If you upload CSV files, each file must have the columns below (first row = headers, text files saved as `.csv`). Column names are case-sensitive. A ready-made example of each file is in the `data/` folder.

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
Every class has a teacher, a room and a slot, with no clashes and with enough room capacity. If you added preferences, the app tells you how many it was able to respect.

### When no timetable exists
The app lists the rules that cannot all be true together. Typical reasons:

| Message (example) | What it means | How to fix it |
|---|---|---|
| "No room is big enough for CS101 (60 students)." | Every room is smaller than the class | Add a bigger room or split the class |
| "Dr. Sharma is needed in more sessions than there are slots." | A teacher is overloaded | Add slots or move a course to another teacher |
| "Not enough room-slot combinations for all sessions." | Too many classes, too little space or time | Add rooms or slots, or reduce sessions per week |

*(These messages are examples. final version may differ from the current messages.)*

---

## Exporting Your Timetable

| Format | Use it to | How |
|---|---|---|
| **PDF** | Print the timetable or share it with others | Click **Download PDF** |
| **ICS** | Add the classes to Google Calendar, Outlook or Apple Calendar | Click **Download ICS**, then import the file in your calendar app |

To import an ICS file into **Google Calendar**: open Calendar on the web, click the gear icon, choose **Settings**, then **Import & export**, select the `.ics` file and click **Import**.

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| `streamlit: command not found` | Virtual environment not active or packages not installed | Activate `venv`, then run `pip install -r requirements.txt` |
| `ModuleNotFoundError: ortools` | OR-Tools not installed | Run `pip install ortools` |
| App says a faculty name isn't found | Spelling differs between `courses.csv` and your faculty data | Make the names match exactly |
| CSV upload fails | Wrong column names or extra blank rows | Compare against the formats above |
| Solver takes very long | Input is large | Reduce slots or courses to test, or check the [benchmark](#benchmark) |
| "No timetable exists" | Rules conflict | Read the explanation panel and apply the suggested fix |

---

## Project Structure

> Update this to match your final layout.

```
.
├── app.py              # Streamlit interface
├── solver/             # CP-SAT model, constraints, explanations
├── models/             # Course, Faculty, Room, Slot data classes
├── export/             # PDF and ICS export
├── data/               # Sample input files (CSV)
├── benchmarks/         # Benchmark scripts and results
├── requirements.txt
└── README.md
```

## Benchmark

We tested the solver on inputs of increasing size.

| Size | Courses | Faculty | Rooms | Slots | Solve time |
|---|---|---|---|---|---|
| Small | ... | ... | ... | ... | ... |
| Medium | ... | ... | ... | ... | ... |
| Large | ... | ... | ... | ... | ... |



## Screenshots



## Team

**Team Curly Coders**

| Name | Year / Program | Role |
|---|---|---|
| **Tishya Thareja** | 1st Year / B.Tech CSE (Core) | *(add role)* |
| **Ishika** | 1st Year / B.Tech CSE (Core) | *(add role)* |
| **Prateek** | 1st Year / B.Tech CSE (AI/ML) | *(add role)* |

## What We Learned



## Acknowledgements

- [Google OR-Tools](https://developers.google.com/optimization)
- [Streamlit](https://streamlit.io)
- TechSpace BuildLab '26 organizers and the [base repository](https://github.com/Techspace-srmuh/timetable-scheduler)
