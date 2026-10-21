import type { Day, Project, TimetableEntry } from "../lib/types";

const days: { key: Day; name: string }[] = [
  { key: "Mon", name: "Monday" },
  { key: "Tue", name: "Tuesday" },
  { key: "Wed", name: "Wednesday" },
  { key: "Thu", name: "Thursday" },
  { key: "Fri", name: "Friday" },
  { key: "Sat", name: "Saturday" },
];

function longestDailyGap(
  facultyId: string,
  day: Day,
  timetable: TimetableEntry[],
  project: Project,
) {
  const slots = project.data.slots
    .filter((slot) => slot.day === day)
    .sort((left, right) => left.start.localeCompare(right.start));
  const occupiedSlotIds = new Set(
    timetable
      .filter((entry) => entry.faculty_id === facultyId)
      .flatMap((entry) => entry.slot_ids),
  );
  const occupiedIndexes = slots
    .map((slot, index) => (occupiedSlotIds.has(slot.id) ? index : -1))
    .filter((index) => index >= 0);

  if (occupiedIndexes.length < 2) return 0;

  let longestGap = 0;
  let currentGap = 0;
  let previousFreeSlot: (typeof slots)[number] | null = null;
  for (
    let index = occupiedIndexes[0] + 1;
    index < occupiedIndexes[occupiedIndexes.length - 1];
    index += 1
  ) {
    const slot = slots[index];
    if (occupiedSlotIds.has(slot.id)) {
      currentGap = 0;
      previousFreeSlot = null;
    } else {
      currentGap = previousFreeSlot?.end === slot.start ? currentGap + 1 : 1;
      longestGap = Math.max(longestGap, currentGap);
      previousFreeSlot = slot;
    }
  }
  return longestGap;
}

export default function WorkloadSummary({
  project,
  timetable,
  heavyDayThreshold,
  isLoading,
  error,
}: {
  project: Project;
  timetable: TimetableEntry[];
  heavyDayThreshold: number;
  isLoading: boolean;
  error: string | null;
}) {
  if (isLoading) {
    return (
      <section className="rounded-2xl border border-slate-300 bg-[var(--panel-background)] p-5 text-slate-900 shadow-md">
        <h2 className="text-xl font-semibold">Workload</h2>
        <p role="status" className="mt-2 text-sm">Loading teacher workload…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-red-300 bg-red-50 p-5 text-red-950 shadow-md">
        <h2 className="text-xl font-semibold">Workload</h2>
        <p role="alert" className="mt-2 text-sm">Workload could not be loaded: {error}</p>
      </section>
    );
  }

  if (project.data.faculty.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-300 bg-[var(--panel-background)] p-5 text-slate-900 shadow-md">
        <h2 className="text-xl font-semibold">Workload</h2>
        <p className="mt-2 text-sm">Add faculty members to see their workload.</p>
      </section>
    );
  }

  if (timetable.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-300 bg-[var(--panel-background)] p-5 text-slate-900 shadow-md">
        <h2 className="text-xl font-semibold">Workload</h2>
        <p className="mt-2 text-sm">There are no scheduled classes to summarize yet. Generate a timetable to see workload.</p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="workload-heading"
      className="space-y-4 rounded-2xl border border-slate-300 bg-[var(--panel-background)] p-5 text-slate-900 shadow-md"
    >
      <div>
        <h2 id="workload-heading" className="text-xl font-semibold">Workload</h2>
        <p className="mt-1 text-sm text-slate-700">
          Sessions and breaks are counted from this timetable. Days with {heavyDayThreshold} or more sessions are marked as heavy.
        </p>
      </div>
      <ul className="grid gap-4 lg:grid-cols-2">
        {project.data.faculty.map((faculty) => {
          const facultyEntries = timetable.filter((entry) => entry.faculty_id === faculty.id);
          const sessionCounts = Object.fromEntries(
            days.map(({ key }) => [
              key,
              facultyEntries.filter((entry) => {
                const startSlot = project.data.slots.find((slot) => slot.id === entry.start_slot_id);
                return startSlot?.day === key;
              }).length,
            ]),
          ) as Record<Day, number>;
          const dailyGaps = days.map(({ key }, index) => ({
            day: key,
            name: days[index].name,
            slots: longestDailyGap(faculty.id, key, timetable, project),
          }));
          const longestGap = dailyGaps.reduce(
            (longest, gap) => (gap.slots > longest.slots ? gap : longest),
            { day: "Mon" as Day, name: "Monday", slots: 0 },
          );

          return (
            <li key={faculty.id} className="rounded-xl border border-slate-300 bg-white p-4">
              <h3 className="text-lg font-semibold">{faculty.name}</h3>
              <p className="mt-1 text-sm">{faculty.name} has {facultyEntries.length} {facultyEntries.length === 1 ? "session" : "sessions"} this week.</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {days.map(({ key, name }) => {
                  const count = sessionCounts[key];
                  return (
                    <p
                      key={key}
                      className={`rounded-lg border p-2 text-sm ${count >= heavyDayThreshold ? "border-amber-500 bg-amber-50 text-amber-950" : "border-slate-200 text-slate-800"}`}
                    >
                      {count >= heavyDayThreshold && <span aria-hidden="true">⚠ </span>}
                      <span>{name}: {count} {count === 1 ? "session" : "sessions"}</span>
                      {count >= heavyDayThreshold && <span className="block font-semibold">Heavy day</span>}
                    </p>
                  );
                })}
              </div>
              <p className="mt-3 text-sm">
                {facultyEntries.length === 0
                  ? `${faculty.name} has no classes on this timetable.`
                  : longestGap.slots > 0
                    ? `${faculty.name} has a ${longestGap.slots}-slot break on ${longestGap.name}.`
                    : "No free slots fall between this teacher’s first and last class on a day."}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
