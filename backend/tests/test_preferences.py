from builders import course, entry, hour_slots, project, room, teacher
from app.models.schemas import Constraints, Preference
from app.services import rules

SLOTS = hour_slots("Mon", 9, 4)


def stats(proj, entries):
    entries = rules.fill_slot_ids(entries, proj.data.slots)
    return rules.preference_stats(proj.data, proj.constraints, entries)


def test_no_preferences_means_zero_of_zero():
    proj = project(courses=[course("A")], slots=SLOTS)
    assert stats(proj, [entry("E1", "A", "R1", "MON_09")]) == (0, 0, [])


def test_met_when_every_class_is_in_a_preferred_slot():
    proj = project(
        courses=[course("A", sessions=2)], faculty=[teacher("F1", preferred=["MON_09", "MON_10"])], slots=SLOTS
    )
    met, total, unmet = stats(proj, [entry("E1", "A", "R1", "MON_09"), entry("E2", "A", "R1", "MON_10")])
    assert (met, total, unmet) == (1, 1, [])


def test_unmet_when_one_class_is_outside():
    proj = project(
        courses=[course("A", sessions=2)], faculty=[teacher("F1", preferred=["MON_09", "MON_10"])], slots=SLOTS
    )
    met, total, unmet = stats(proj, [entry("E1", "A", "R1", "MON_09"), entry("E2", "A", "R1", "MON_12")])
    assert (met, total) == (0, 1)
    assert [c.type for c in unmet] == ["preference_unmet"]
    assert unmet[0].affected_entry_ids == ["E2"] and unmet[0].affected_slot_ids == ["MON_12"]
    assert "1 of their 2 classes is placed outside" in unmet[0].message


def test_multi_slot_class_must_fit_entirely_inside_the_preferred_slots():
    proj = project(
        courses=[course("A", length=2)], faculty=[teacher("F1", preferred=["MON_09"])], slots=SLOTS
    )
    met, total, _ = stats(proj, [entry("E1", "A", "R1", "MON_09", length=2)])  # uses MON_09 + MON_10
    assert (met, total) == (0, 1)


def test_both_sources_are_combined_and_counted_once_per_teacher():
    proj = project(
        courses=[course("A", sessions=2)],
        faculty=[teacher("F1", preferred=["MON_09"])],
        slots=SLOTS,
        constraints=Constraints(preferences=[
            Preference(id="P1", type="faculty_prefers_slots", faculty_id="F1", slot_ids=["MON_10"]),
            Preference(id="P2", type="faculty_prefers_slots", faculty_id="F1", slot_ids=["MON_09"]),
        ]),
    )
    assert rules.preferred_slots_by_teacher(proj.data, proj.constraints) == {"F1": {"MON_09", "MON_10"}}
    met, total, _ = stats(proj, [entry("E1", "A", "R1", "MON_09"), entry("E2", "A", "R1", "MON_10")])
    assert (met, total) == (1, 1)


def test_preference_for_unknown_teacher_is_ignored():
    proj = project(
        courses=[course("A")], slots=SLOTS,
        constraints=Constraints(preferences=[
            Preference(id="P1", type="faculty_prefers_slots", faculty_id="GHOST", slot_ids=["MON_09"]),
        ]),
    )
    assert stats(proj, [entry("E1", "A", "R1", "MON_09")]) == (0, 0, [])


def test_teacher_with_no_classes_counts_as_met():
    proj = project(
        courses=[], faculty=[teacher("F1", preferred=["MON_09"])], slots=SLOTS
    )
    assert stats(proj, []) == (1, 1, [])
