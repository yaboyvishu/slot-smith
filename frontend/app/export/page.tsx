"use client";

import { useState } from "react";
import { NoProjectSelected, NoTimetableYet } from "../../components/ProjectStateMessage";
import FavoriteButton from "../../components/FavoriteButton";
import { useSelectedProject } from "../../components/useSelectedProject";
import { exportProjectIcs, exportProjectPdf } from "../../lib/api";
import { useProject } from "../../lib/project-context";
import PageHeader from "../../components/PageHeader";

type ExportFormat = "pdf" | "ics";

function downloadFile(blob: Blob, projectId: string, format: ExportFormat) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `slotsmith-${projectId}.${format}`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export default function ExportPage() {
  const { project, projectId, isProjectIdLoaded, isLoading, isWakingUp, errorMessage } = useSelectedProject();
  const { generateResult } = useProject();
  const [activeExport, setActiveExport] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const timetable = project?.timetable.length
    ? project.timetable
    : generateResult?.timetable ?? [];

  async function handleExport(format: ExportFormat) {
    if (!projectId) return;
    setActiveExport(format);
    setExportError(null);
    setStatusMessage(null);
    try {
      const file = format === "pdf"
        ? await exportProjectPdf(projectId)
        : await exportProjectIcs(projectId);
      downloadFile(file, projectId, format);
      setStatusMessage(`${format.toUpperCase()} download started.`);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : `Could not export the ${format.toUpperCase()} file.`);
    } finally {
      setActiveExport(null);
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader step={6} total={6} title="Export your timetable" description="Download a PDF to print or an ICS file for your calendar." accentLine="take it with you." />

      {!isProjectIdLoaded && <p role="status" className="rounded-lg bg-slate-100 p-4 text-sm text-slate-800">Loading selected project…</p>}
      {isProjectIdLoaded && !projectId && <NoProjectSelected />}
      {isLoading && (
        <p role="status" className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
          {isWakingUp ? "Waking up the server, this can take up to a minute." : "Loading project…"}
        </p>
      )}
      {errorMessage && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{errorMessage}</p>}
      {exportError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{exportError}</p>}
      {statusMessage && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">{statusMessage}</p>}

      {project && timetable.length === 0 && <NoTimetableYet message="Generate a timetable before exporting it." />}
      {project && timetable.length > 0 && (
        <div className="rounded-2xl border border-slate-300 bg-[var(--panel-background)] p-5 shadow-md sm:p-7">
          <p className="text-sm text-slate-600">Current timetable</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-950">{project.name}</h2>
            <FavoriteButton id={project.id} name={project.name} />
          </div>
          <p className="mt-2 text-sm text-slate-700">{timetable.length} scheduled {timetable.length === 1 ? "class" : "classes"}.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => void handleExport("pdf")} disabled={activeExport !== null} className="font-display min-h-11 rounded-lg bg-brand-pink px-5 font-semibold text-brand-ink transition hover:bg-brand-pink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong disabled:cursor-wait disabled:opacity-60">
              {activeExport === "pdf" ? "Preparing PDF…" : "Download PDF"}
            </button>
            <button type="button" onClick={() => void handleExport("ics")} disabled={activeExport !== null} className="min-h-11 rounded-lg border border-brand-maroon-strong px-5 font-semibold text-brand-maroon transition hover:bg-brand-pink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong disabled:cursor-wait disabled:opacity-60">
              {activeExport === "ics" ? "Preparing calendar file…" : "Download ICS"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
