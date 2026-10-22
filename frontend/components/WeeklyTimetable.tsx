import type { CSSProperties } from "react";
import type { Conflict, Project, TimetableEntry } from "../lib/types";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type TimetableColourBy = "faculty" | "room" | "course";

const accessiblePalette = [
  { background: "#dbeafe", border: "#1d4ed8", text: "#172554" },
  { background: "#dcfce7", border: "#15803d", text: "#052e16" },
  { background: "#fef3c7", border: "#b45309", text: "#451a03" },
  { background: "#ede9fe", border: "#6d28d9", text: "#2e1065" },
  { background: "#cffafe", border: "#0e7490", text: "#083344" },
  { background: "#ecfccb", border: "#4d7c0f", text: "#1a2e05" },
  { background: "#ccfbf1", border: "#0f766e", text: "#042f2e" },
  { background: "#e0e7ff", border: "#4338ca", text: "#1e1b4b" },
  { background: "#ffedd5", border: "#c2410c", text: "#431407" },
  { background: "#e2e8f0", border: "#334155", text: "#0f172a" },
] as const;

function colourForId(id: string) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  }
  return accessiblePalette[(hash >>> 0) % accessiblePalette.length];
}

function colourItem(entry: TimetableEntry, colourBy: TimetableColourBy) {
  if (colourBy === "faculty") return { id: entry.faculty_id, name: "faculty" };
  if (colourBy === "room") return { id: entry.room_id, name: "room" };
  return { id: entry.course_id, name: "course" };
}

function entryLabel(entry: TimetableEntry, project: Project) {
  const course = project.data.courses.find((item) => item.id === entry.course_id);
  const faculty = project.data.faculty.find(
    (item) => item.id === entry.faculty_id,
  );
  const room = project.data.rooms.find((item) => item.id === entry.room_id);
  const startSlot = project.data.slots.find(
    (item) => item.id === entry.start_slot_id,
  );
  return {
    course: course ? `${course.code} · ${course.name}` : entry.course_id,
    faculty: faculty?.name ?? entry.faculty_id,
    room: room?.name ?? entry.room_id,
    time: startSlot?.label ?? entry.start_slot_id,
  };
}

export default function WeeklyTimetable({
  project,
  timetable,
  conflict,
  colourBy,
}: {
  project: Project;
  timetable: TimetableEntry[];
  conflict?: Conflict | null;
  colourBy?: TimetableColourBy;
}) {
  const timeRows = Array.from(
    new Map(project.data.slots.map((slot) => [slot.start, slot])).values(),
  ).sort((left, right) => left.start.localeCompare(right.start));
  const rowByStart = new Map(timeRows.map((slot, index) => [slot.start, index]));
  const slotsById = new Map(project.data.slots.map((slot) => [slot.id, slot]));
  const highlightedSlots = new Set(conflict?.affected_slot_ids ?? []);
  const highlightedEntries = new Set(conflict?.affected_entry_ids ?? []);
  const colourLegend = colourBy
    ? Array.from(
        new Map(
          timetable.map((entry) => {
            const item = colourItem(entry, colourBy);
            const name = project.data[
              colourBy === "faculty" ? "faculty" : colourBy === "room" ? "rooms" : "courses"
            ].find((record) => record.id === item.id);
            const displayName = name
              ? colourBy === "course"
                ? `${"code" in name ? name.code : ""} · ${name.name}`
                : name.name
              : item.id;
            return [item.id, { id: item.id, name: displayName, colour: colourForId(item.id) }];
          }),
        ).values(),
      ).sort((left, right) => left.name.localeCompare(right.name))
    : [];
  const columns = `5rem repeat(${days.length}, minmax(9rem, 1fr))`;
  const rows = `auto repeat(${timeRows.length}, minmax(6rem, auto))`;

  return (
    <div className="space-y-3">
      {colourBy && colourLegend.length > 0 && (
        <ul
          aria-label={`Colour legend for ${colourBy}`}
          className="flex flex-wrap gap-2 rounded-xl border border-slate-300 bg-white p-3"
        >
          {colourLegend.map((item) => (
            <li
              key={item.id}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              style={{ backgroundColor: item.colour.background, borderColor: item.colour.border, color: item.colour.text }}
            >
              <span aria-hidden="true" className="size-3 rounded-full border" style={{ backgroundColor: item.colour.border, borderColor: item.colour.border }} />
              {item.name}
            </li>
          ))}
        </ul>
      )}
      <div
        role="region"
        className="weekly-timetable-scroll overflow-x-auto rounded-xl border border-slate-300 bg-white"
        aria-label="Weekly timetable"
        tabIndex={0}
      >
        <div
          className="weekly-timetable-grid grid min-w-[68rem]"
          style={{
            gridTemplateColumns: columns,
            gridTemplateRows: rows,
            "--time-row-count": timeRows.length,
          } as CSSProperties}
        >
        <div className="sticky left-0 z-20 border-b border-r border-slate-300 bg-[#dbe2ef] p-3 text-xs font-semibold uppercase text-slate-700">
          Time
        </div>
        {days.map((day, index) => (
          <div
            key={day}
            style={{ gridColumn: index + 2, gridRow: 1 }}
            className="border-b border-r border-slate-300 bg-[#dbe2ef] p-3 text-center text-sm font-semibold text-slate-900"
          >
            {day}
          </div>
        ))}

        {timeRows.map((slot, rowIndex) => (
          <div
            key={slot.id}
            style={{ gridColumn: 1, gridRow: rowIndex + 2 }}
            className="sticky left-0 z-10 flex items-start border-b border-r border-slate-200 bg-[#f6f3f7] p-2 text-xs font-medium text-slate-700"
          >
            {slot.start}
          </div>
        ))}

        {days.flatMap((day, dayIndex) =>
          timeRows.map((timeSlot, rowIndex) => {
            const slot = project.data.slots.find(
              (candidate) => candidate.day === day && candidate.start === timeSlot.start,
            );
            const isHighlighted = slot && highlightedSlots.has(slot.id);
            return (
              <div
                key={`${day}-${timeSlot.start}`}
                style={{ gridColumn: dayIndex + 2, gridRow: rowIndex + 2 }}
                className={`border-b border-r border-slate-200 ${isHighlighted ? "bg-red-50" : "bg-white"}`}
                aria-label={slot ? `${day}, ${slot.label}` : `${day}, no slot at ${timeSlot.start}`}
              />
            );
          }),
        )}

        {timetable.map((entry) => {
          const startSlot = slotsById.get(entry.start_slot_id);
          const rowIndex = startSlot ? rowByStart.get(startSlot.start) : undefined;
          const dayIndex = startSlot ? days.indexOf(startSlot.day) : -1;
          if (rowIndex === undefined || dayIndex < 0) {
            return null;
          }

          const label = entryLabel(entry, project);
          const hasConflict = highlightedEntries.has(entry.id);
          const entryColour = colourBy ? colourForId(colourItem(entry, colourBy).id) : null;
          const entriesAtSameStart = timetable.filter(
            (candidate) => candidate.start_slot_id === entry.start_slot_id,
          );
          const laneIndex = entriesAtSameStart.findIndex(
            (candidate) => candidate.id === entry.id,
          );
          const laneWidth = 100 / entriesAtSameStart.length;
          const style: CSSProperties = {
            gridColumn: dayIndex + 2,
            gridRow: `${rowIndex + 2} / span ${entry.slot_ids.length}`,
            width: `${laneWidth}%`,
            marginLeft: `${laneWidth * laneIndex}%`,
            ...(entryColour && !hasConflict
              ? {
                  backgroundColor: entryColour.background,
                  borderColor: entryColour.border,
                  color: entryColour.text,
                }
              : {}),
          };

          return (
            <article
              key={entry.id}
              style={style}
              className={`print-colour z-10 m-1 min-w-0 overflow-hidden rounded-lg border p-2 text-xs shadow-sm ${
                hasConflict
                  ? "border-red-700 bg-red-100 text-red-950"
                  : entryColour
                    ? ""
                    : "border-brand-maroon-strong/50 bg-brand-pink text-[#211019]"
              }`}
              aria-label={`${label.course}, ${label.time}, ${label.faculty}, ${label.room}${hasConflict ? ", conflict" : ""}`}
            >
              {hasConflict && (
                <p className="mb-1 flex items-center gap-1 font-bold text-red-800">
                  <span aria-hidden="true">⚠</span> Conflict
                </p>
              )}
              <p className="font-semibold">{label.course}</p>
              <p className="mt-1">{label.faculty}</p>
              <p>{label.room}</p>
              <p className="mt-1 text-[0.7rem]">{label.time}</p>
            </article>
          );
        })}
        </div>
      </div>
    </div>
  );
}
