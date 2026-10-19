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
