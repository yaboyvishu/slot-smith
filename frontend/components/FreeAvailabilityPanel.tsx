import type { Project, TimeSlot, TimetableEntry } from "../lib/types";

const selectClass =
  "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 outline-none focus-visible:border-brand-maroon-strong focus-visible:ring-2 focus-visible:ring-brand-pink";

export default function FreeAvailabilityPanel({
  project,
  timetable,
  selectedEntryId,
  selectedSlotId,
  isValidating,
  isSaving,
  error,
  onSelectEntry,
  onSelectSlot,
  onMoveToSlot,
  onMoveToRoom,
}: {
  project: Project;
  timetable: TimetableEntry[];
  selectedEntryId: string;
  selectedSlotId: string;
  isValidating: boolean;
  isSaving: boolean;
  error: string | null;
  onSelectEntry: (entryId: string) => void;
  onSelectSlot: (slotId: string) => void;
  onMoveToSlot: (entryId: string, slotId: string) => void;
  onMoveToRoom: (entryId: string, roomId: string) => void;
}) {
  const selectedEntry = timetable.find((entry) => entry.id === selectedEntryId);
  const selectedCourse = selectedEntry
    ? project.data.courses.find((course) => course.id === selectedEntry.course_id)
    : undefined;
  const selectedSlot = project.data.slots.find((slot) => slot.id === selectedSlotId);
  const otherEntries = timetable.filter((entry) => entry.id !== selectedEntry?.id);
  const roomsInUse = new Set(
    otherEntries
      .filter((entry) => selectedSlot?.id && entry.slot_ids.includes(selectedSlot.id))
      .map((entry) => entry.room_id),
  );
  const teachersInUse = new Set(
    otherEntries
      .filter((entry) => selectedSlot?.id && entry.slot_ids.includes(selectedSlot.id))
      .map((entry) => entry.faculty_id),
  );
  const availableRooms = selectedSlot
    ? project.data.rooms.filter(
        (room) =>
          (!selectedCourse || room.capacity >= selectedCourse.student_count) &&
          !roomsInUse.has(room.id),
      )
    : [];
  const availableTeachers = selectedSlot
    ? project.data.faculty.filter((teacher) => !teachersInUse.has(teacher.id))
    : [];

  function describeSlot(slot: TimeSlot) {
    return `${slot.day} · ${slot.start}–${slot.end} · ${slot.label}`;
  }

  return (
    <aside
      aria-labelledby="free-availability-heading"
      className="space-y-4 rounded-2xl border border-slate-300 bg-[var(--panel-background)] p-5 text-slate-950 shadow-md"
    >
      <div>
        <h2 id="free-availability-heading" className="text-xl font-semibold">
          Free rooms and teachers
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-700">
          This list is a guide. The timetable check decides whether a move works.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </p>
      )}
      {isValidating && (
        <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
          Checking this move…
        </p>
      )}
      {isSaving && (
        <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
          Saving the timetable…
        </p>
      )}

      <div>
        <label htmlFor="finder-class" className="block text-sm font-medium text-slate-800">
          Class to move (optional)
        </label>
        <select
          id="finder-class"
          value={selectedEntryId}
          onChange={(event) => onSelectEntry(event.target.value)}
          className={`${selectClass} mt-1`}
        >
          <option value="">Any class</option>
          {timetable.map((entry) => {
            const course = project.data.courses.find((item) => item.id === entry.course_id);
            const startSlot = project.data.slots.find((slot) => slot.id === entry.start_slot_id);
            return (
              <option key={entry.id} value={entry.id}>
                {course ? `${course.code} · ${course.name}` : entry.course_id}
                {startSlot ? ` (${startSlot.day} ${startSlot.start})` : ""}
              </option>
            );
          })}
        </select>
      </div>

      <div>
        <label htmlFor="finder-slot" className="block text-sm font-medium text-slate-800">
          Day and time
        </label>
        {project.data.slots.length > 0 ? (
          <select
            id="finder-slot"
            value={selectedSlot?.id ?? ""}
            onChange={(event) => onSelectSlot(event.target.value)}
            className={`${selectClass} mt-1`}
          >
            {project.data.slots.map((slot) => (
              <option key={slot.id} value={slot.id}>{describeSlot(slot)}</option>
            ))}
          </select>
        ) : (
          <p className="mt-2 rounded-lg bg-white p-3 text-sm text-slate-700">
            No time slots have been added yet.
          </p>
        )}
      </div>

      {selectedEntry && selectedSlot && (
        <button
          type="button"
          onClick={() => onMoveToSlot(selectedEntry.id, selectedSlot.id)}
          disabled={isValidating || isSaving}
          className="min-h-11 w-full rounded-lg border border-brand-maroon-strong px-4 text-sm font-semibold text-brand-maroon transition hover:bg-brand-pink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong disabled:cursor-wait disabled:opacity-50"
        >
          Move selected class to this time
        </button>
      )}

      <section aria-labelledby="available-rooms-heading">
        <h3 id="available-rooms-heading" className="font-semibold">Available rooms</h3>
        {availableRooms.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {availableRooms.map((room) => (
              <li key={room.id}>
                {selectedEntry ? (
                  <button
                    type="button"
                    onClick={() => onMoveToRoom(selectedEntry.id, room.id)}
                    disabled={isValidating || isSaving}
                    className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 hover:border-brand-maroon-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong disabled:cursor-wait disabled:opacity-50"
                  >
                    Move to {room.name} · {room.capacity} seats
                  </button>
                ) : (
                  <p className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                    {room.name} · {room.capacity} seats
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 rounded-lg bg-white p-3 text-sm text-slate-700">
            {selectedSlot ? "No rooms are free for this time and class." : "Choose a time slot to see free rooms."}
          </p>
        )}
      </section>

      <section aria-labelledby="available-teachers-heading">
        <h3 id="available-teachers-heading" className="font-semibold">Available teachers</h3>
        {availableTeachers.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {availableTeachers.map((teacher) => (
              <li key={teacher.id} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                {teacher.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 rounded-lg bg-white p-3 text-sm text-slate-700">
            {selectedSlot ? "No teachers are free at this time." : "Choose a time slot to see free teachers."}
          </p>
        )}
      </section>
    </aside>
  );
}
