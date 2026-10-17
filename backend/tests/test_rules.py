from app.models.schemas import TimeSlot, TimetableEntry
from app.services import rules


def slot(id, day, start, end):
    return TimeSlot(id=id, day=day, start=start, end=end)


SLOTS = [
    slot("MON_09", "Mon", "09:00", "10:00"),
    slot("MON_10", "Mon", "10:00", "11:00"),
    slot("MON_11", "Mon", "11:00", "12:00"),
    # lunch gap: nothing from 12:00 to 13:00
    slot("MON_13", "Mon", "13:00", "14:00"),
    slot("TUE_09", "Tue", "09:00", "10:00"),
]


def test_single_slot():
    assert rules.slot_run(SLOTS, "MON_09", 1) == ["MON_09"]


def test_two_consecutive_slots():
    assert rules.slot_run(SLOTS, "MON_09", 2) == ["MON_09", "MON_10"]


def test_three_consecutive_slots():
    assert rules.slot_run(SLOTS, "MON_09", 3) == ["MON_09", "MON_10", "MON_11"]


def test_lunch_gap_blocks_the_run():
    # MON_11 ends 12:00, MON_13 starts 13:00: not consecutive
    assert rules.slot_run(SLOTS, "MON_11", 2) == ["MON_11"]


def test_run_does_not_cross_days():
    assert rules.slot_run(SLOTS, "MON_13", 2) == ["MON_13"]


def test_unknown_start_slot_gives_empty_run():
    assert rules.slot_run(SLOTS, "NOPE", 1) == []


def test_input_order_does_not_matter():
    shuffled = [SLOTS[3], SLOTS[0], SLOTS[4], SLOTS[2], SLOTS[1]]
    assert rules.slot_run(shuffled, "MON_09", 2) == ["MON_09", "MON_10"]


def entry(start, length, slot_ids=None):
    return TimetableEntry(
        id="E1", course_id="C1", faculty_id="F1", room_id="R1",
        start_slot_id=start, length_slots=length, slot_ids=slot_ids or [],
    )


def test_fill_slot_ids_recomputes_and_ignores_client_value():
    [filled] = rules.fill_slot_ids([entry("MON_09", 2, ["WRONG"])], SLOTS)
    assert filled.slot_ids == ["MON_09", "MON_10"]


def test_fill_slot_ids_unknown_start_falls_back_to_start_id():
    [filled] = rules.fill_slot_ids([entry("NOPE", 2)], SLOTS)
    assert filled.slot_ids == ["NOPE"]


def test_fill_slot_ids_does_not_change_the_input():
    original = entry("MON_09", 2)
    rules.fill_slot_ids([original], SLOTS)
    assert original.slot_ids == []
