"use client";

import { useEffect } from "react";
import Link from "next/link";
import FavoriteButton from "../../components/FavoriteButton";
import PageHeader from "../../components/PageHeader";
import { NoProjectSelected } from "../../components/ProjectStateMessage";
import WeeklyTimetable from "../../components/WeeklyTimetable";
import { useSelectedProject } from "../../components/useSelectedProject";
import { useProject } from "../../lib/project-context";

export default function ConflictsPage() {
  const { project, projectId, isProjectIdLoaded, isLoading, isWakingUp, errorMessage } = useSelectedProject();
  const { generateResult, activeConflict, setActiveConflict } = useProject();
  const conflicts = generateResult?.unmet_constraints ?? [];
  const selectedConflict = activeConflict && conflicts.includes(activeConflict)
    ? activeConflict
    : conflicts[0] ?? null;
  const timetable = generateResult?.timetable ?? project?.timetable ?? [];

  useEffect(() => {
    if (!selectedConflict && activeConflict) setActiveConflict(null);
    else if (selectedConflict && selectedConflict !== activeConflict) setActiveConflict(selectedConflict);
  }, [activeConflict, selectedConflict, setActiveConflict]);

  return (
    <section className="space-y-6">
      <PageHeader step={4} total={6} title="Review conflicts" description="See the solver's reported constraints and the timetable entries or slots they affect." accentLine="find a workable fix." />
      {!isProjectIdLoaded && <p role="status" className="rounded-lg bg-slate-100 p-4 text-sm">Loading selected project…</p>}
      {isProjectIdLoaded && !projectId && <NoProjectSelected />}
      {isLoading && <p role="status" className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">{isWakingUp ? "Waking up the server, this can take up to a minute." : "Loading project…"}</p>}
      {errorMessage && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{errorMessage}</p>}
      {project && (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-300 bg-[var(--panel-background)] p-4">
            <span className="font-semibold text-slate-950">{project.name}</span>
            <FavoriteButton id={project.id} name={project.name} />
          </div>
          {conflicts.length ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.5fr)]">
              <ul className="space-y-3" aria-label="Reported conflicts">
                {conflicts.map((conflict, index) => {
                  const selected = conflict === selectedConflict;
                  return (
                    <li key={`${conflict.type}-${index}`}>
                      <button type="button" aria-pressed={selected} onClick={() => setActiveConflict(conflict)} className={`w-full rounded-xl border p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong ${selected ? "border-red-700 bg-red-50" : "border-slate-300 bg-white hover:bg-slate-50"}`}>
                        <span className="block font-semibold text-slate-950">{conflict.message}</span>
                        {conflict.suggested_fix && <span className="mt-2 block text-sm text-slate-700">Suggested fix: {conflict.suggested_fix}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {timetable.length ? <WeeklyTimetable project={project} timetable={timetable} conflict={selectedConflict} /> : <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-700">The solver reported these issues but did not return timetable entries to highlight.</p>}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-slate-800">
              <p className="font-semibold">No reported conflicts.</p>
              <p className="mt-1 text-sm">Generate a timetable to see solver findings here.</p>
              <Link href="/results" className="mt-3 inline-flex min-h-11 items-center font-semibold text-brand-maroon underline underline-offset-2">Open Generate</Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}
