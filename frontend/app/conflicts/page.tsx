"use client";

import Link from "next/link";
import { useEffect } from "react";
import { NoProjectSelected, NoTimetableYet } from "../../components/ProjectStateMessage";
import WeeklyTimetable from "../../components/WeeklyTimetable";
import { useSelectedProject } from "../../components/useSelectedProject";
import { useProject } from "../../lib/project-context";
import PageHeader from "../../components/PageHeader";

export default function ConflictsPage() {
  const { project, projectId, isProjectIdLoaded, isLoading, isWakingUp, errorMessage } = useSelectedProject();
  const { generateResult, activeConflict, setActiveConflict } = useProject();
  const conflicts = generateResult?.unmet_constraints ?? [];
  const timetable = generateResult?.timetable ?? project?.timetable ?? [];

  useEffect(() => {
    setActiveConflict(null);
  }, [projectId, setActiveConflict]);

  return (
    <section className="space-y-6">
      <PageHeader step={4} total={6} title="Review conflicts" description="See which rules clash, why, and how to fix them." accentLine="make every hour count." />

      {!isProjectIdLoaded && <p role="status" className="rounded-lg bg-slate-100 p-4 text-sm text-slate-800">Loading selected project…</p>}
      {isProjectIdLoaded && !projectId && <NoProjectSelected />}
      {isLoading && (
        <p role="status" className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
          {isWakingUp ? "Waking up the server, this can take up to a minute." : "Loading project…"}
        </p>
      )}
      {errorMessage && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{errorMessage}</p>}

      {project && !generateResult && project.timetable.length === 0 && <NoTimetableYet message="Generate a timetable to get conflict details and suggested fixes." />}
      {project && !generateResult && project.timetable.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          This timetable has no conflict details yet. Visit <Link href="/results" className="font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-brand-maroon-strong">Generate timetable</Link> to check it.
        </div>
      )}

      {project && generateResult && (
        <>
          {conflicts.length === 0 ? (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">
              This timetable has no conflicts or unmet preferences.
            </div>
          ) : (
            <div className="space-y-3">
              {conflicts.map((conflict, index) => {
                const isActive = activeConflict === conflict;
                return (
                  <button
                    key={`${conflict.type}-${index}`}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setActiveConflict(isActive ? null : conflict)}
                    className={`conflict-card relative block w-full rounded-xl border p-4 pr-12 text-left shadow-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong ${isActive ? "border-brand-maroon-strong bg-brand-pink-soft" : "border-slate-300 bg-white hover:border-brand-maroon-strong/60 hover:bg-brand-pink-soft focus-visible:bg-brand-pink-soft"}`}
                  >
                    <span className="conflict-card-content flex items-start gap-2">
                      <span aria-hidden="true" className="mt-0.5 font-bold text-brand-maroon-strong">⚠</span>
                      <span>
                        <span className="block font-semibold text-slate-950">{conflict.message}</span>
                        {conflict.suggested_fix && <span className="mt-2 block text-sm leading-6 text-slate-700"><strong>Suggested fix:</strong> {conflict.suggested_fix}</span>}
                        <span className="mt-2 block text-xs text-slate-600">{conflict.affected_entry_ids.length} affected {conflict.affected_entry_ids.length === 1 ? "class" : "classes"} · {conflict.affected_slot_ids.length} affected {conflict.affected_slot_ids.length === 1 ? "time slot" : "time slots"}</span>
                      </span>
                    </span>
                    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="conflict-card-arrow absolute right-4 top-4 size-4">
                      <path d="M3 10h13m-5-5 5 5-5 5" />
                    </svg>
                  </button>
                );
              })}
            </div>
          )}

          {timetable.length > 0 ? (
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-slate-950">Weekly timetable</h2>
              <p className="text-sm text-slate-700">Highlighted classes and time slots belong to the selected conflict.</p>
              <WeeklyTimetable project={project} timetable={timetable} conflict={activeConflict} />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-700">This result has no scheduled classes to show in the grid.</div>
          )}
        </>
      )}
    </section>
  );
}
