"""A deliberately simple brute-force solver used ONLY to cross-check OR-Tools in tests.

It shares no code with app/services/solver.py or rules.py (it has its own idea of
"consecutive slots"), so agreement between the two is meaningful.
"""
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]


def _runs(slots, length):
    """Every list of `length` slot ids that are back-to-back on one day."""
    ordered = sorted(slots, key=lambda s: (DAYS.index(s.day), s.start))
    found = []
    for i in range(len(ordered)):
        run = [ordered[i]]
        j = i
        while len(run) < length and j + 1 < len(ordered):
            nxt = ordered[j + 1]
            if nxt.day == run[-1].day and nxt.start == run[-1].end:
                run.append(nxt)
                j += 1
            else:
                break
        if len(run) == length:
            found.append([s.id for s in run])
    return found


def is_feasible(data, constraints) -> bool:
    sessions = [c for c in data.courses for _ in range(c.sessions_per_week)]
    runs_by_length = {}
    for c in data.courses:
        runs_by_length.setdefault(c.session_length_slots, _runs(data.slots, c.session_length_slots))

    def place(i, teacher_busy, room_busy):
        if i == len(sessions):
            return True
        c = sessions[i]
        for run in runs_by_length[c.session_length_slots]:
            for r in data.rooms:
                if constraints.room_capacity and r.capacity < c.student_count:
                    continue
                t_cells = {(c.faculty_id, s) for s in run}
                r_cells = {(r.id, s) for s in run}
                if constraints.no_teacher_clash and t_cells & teacher_busy:
                    continue
                if constraints.no_room_clash and r_cells & room_busy:
                    continue
                if place(i + 1, teacher_busy | t_cells, room_busy | r_cells):
                    return True
        return False

    return place(0, frozenset(), frozenset())


def max_preferences_met(data, constraints):
    """Best possible number of 'met' teachers (None if no valid timetable exists).

    Own, independent restatement of the preference rule: a teacher with at least one
    preferred slot is met when every slot used by all their classes is preferred.
    A teacher who teaches nothing is met automatically.
    """
    liked = {f.id: set(f.preferred_slot_ids) for f in data.faculty}
    for p in constraints.preferences:
        if p.faculty_id in liked:
            liked[p.faculty_id] |= set(p.slot_ids)
    liked = {k: v for k, v in liked.items() if v}

    sessions = [c for c in data.courses for _ in range(c.sessions_per_week)]
    runs_by_length = {}
    for c in data.courses:
        runs_by_length.setdefault(c.session_length_slots, _runs(data.slots, c.session_length_slots))
    best = [None]

    def score(used):  # used: teacher id -> set of slots they teach in
        return sum(1 for t, wanted in liked.items() if used.get(t, set()) <= wanted)

    def place(i, teacher_busy, room_busy, used):
        if i == len(sessions):
            sc = score(used)
            if best[0] is None or sc > best[0]:
                best[0] = sc
            return
        c = sessions[i]
        for run in runs_by_length[c.session_length_slots]:
            for r in data.rooms:
                if constraints.room_capacity and r.capacity < c.student_count:
                    continue
                t_cells = {(c.faculty_id, s) for s in run}
                r_cells = {(r.id, s) for s in run}
                if constraints.no_teacher_clash and t_cells & teacher_busy:
                    continue
                if constraints.no_room_clash and r_cells & room_busy:
                    continue
                nxt = dict(used)
                nxt[c.faculty_id] = used.get(c.faculty_id, set()) | set(run)
                place(i + 1, teacher_busy | t_cells, room_busy | r_cells, nxt)

    place(0, frozenset(), frozenset(), {})
    return best[0]
