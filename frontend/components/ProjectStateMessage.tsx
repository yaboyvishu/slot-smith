import Link from "next/link";

export function NoProjectSelected() {
  return (
    <div className="rounded-2xl border border-dashed border-brand-maroon-strong/50 bg-[var(--panel-background)] p-6 text-sm leading-6 text-slate-800">
      <p className="font-semibold text-slate-950">No project selected.</p>
      <p className="mt-1">
        Go to{" "}
        <Link
          href="/data"
          className="font-semibold text-brand-maroon underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong"
        >
          Data setup
        </Link>{" "}
        to create a project first.
      </p>
    </div>
  );
}

export function NoTimetableYet({
  message = "Generate a timetable first to see it here.",
}: {
  message?: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-[var(--panel-background)] p-6 text-sm leading-6 text-slate-700">
      <p className="font-semibold text-slate-900">No timetable yet.</p>
      <p className="mt-1">
        {message} Open{" "}
        <Link
          href="/results"
          className="font-semibold text-brand-maroon underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong"
        >
          Generate and results
        </Link>{" "}
        to create one.
      </p>
    </div>
  );
}
