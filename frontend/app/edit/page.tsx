"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FavoriteButton from "../../components/FavoriteButton";
import PageHeader from "../../components/PageHeader";
import { NoProjectSelected, NoTimetableYet } from "../../components/ProjectStateMessage";
import { useSelectedProject } from "../../components/useSelectedProject";
import { saveTimetable, validateTimetable } from "../../lib/api";
import { useProject } from "../../lib/project-context";
import type { Conflict, TimetableEntryInput } from "../../lib/types";

type ValidationState = { status: "checking" } | { status: "valid" } | { status: "invalid"; clashes: Conflict[] } | { status: "error"; message: string };

export default function EditPage() {
  const router = useRouter();
  const { project, projectId, isProjectIdLoaded, isLoading, isWakingUp, errorMessage } = useSelectedProject();
  const { generateResult, setGenerateResult } = useProject();
  const [draft, setDraft] = useState<TimetableEntryInput[]>([]);
  const [validation, setValidation] = useState<ValidationState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const generationForProject = useRef<string | null>(null);
  const validationSequence = useRef(0);
  const timetable = useMemo(() => generateResult?.timetable ?? project?.timetable ?? [], [generateResult, project]);

  useEffect(() => {
    if (!projectId || !project || isLoading) return;
    if (generationForProject.current !== projectId) {
      generationForProject.current = projectId;
      setDraft(timetable.map(({ id, course_id, faculty_id, room_id, start_slot_id, length_slots }) => ({
        id,
        course_id,
        faculty_id,
        room_id,
        start_slot_id,
        length_slots,
      })));
      setValidation(timetable.length ? { status: "checking" } : null);
      setSaveMessage(null);
      setSaveError(null);
    }
  }, [isLoading, project, projectId, timetable]);

  useEffect(() => {
    if (!projectId || !project || draft.length === 0) return;
    const sequence = ++validationSequence.current;
    let cancelled = false;
    void validateTimetable(projectId, { timetable: draft }).then((result) => {
      if (cancelled || sequence !== validationSequence.current) return;
      setValidation(result.valid ? { status: "valid" } : { status: "invalid", clashes: result.clashes });
    }).catch((error: unknown) => {
      if (cancelled || sequence !== validationSequence.current) return;
      setValidation({ status: "error", message: error instanceof Error ? error.message : "Could not validate these changes." });
    });
    return () => { cancelled = true; };
  }, [draft, project, projectId]);

  function updateEntry(index: number, field: "room_id" | "start_slot_id", value: string) {
    setDraft((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, [field]: value } : entry));
    setValidation({ status: "checking" });
    setSaveMessage(null);
    setSaveError(null);
  }

  async function handleSave() {
    if (!projectId || validation?.status !== "valid") return;
    setIsSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      await saveTimetable(projectId, { timetable: draft });
      setGenerateResult(null);
      setSaveMessage("Validated timetable changes saved.");
      router.push("/results");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save the timetable.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader step={5} total={6} title="Edit timetable" description="Change a class room or start slot. Each draft is checked by the backend before it can be saved." accentLine="make a careful adjustment." />
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
          {timetable.length === 0 ? <NoTimetableYet message="Generate a timetable before editing it." /> : (
            <>
              {saveMessage && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">{saveMessage}</p>}
              {saveError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{saveError}</p>}
              {validation?.status === "checking" && <p role="status" className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">Checking changes with the backend…</p>}
              {validation?.status === "error" && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{validation.message}</p>}
              {validation?.status === "invalid" && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-950"><p className="font-semibold">These changes have conflicts:</p><ul className="mt-2 list-inside list-disc">{validation.clashes.map((clash, index) => <li key={`${clash.type}-${index}`}>{clash.message}</li>)}</ul></div>}
              {validation?.status === "valid" && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">No clashes found for the current draft.</p>}
              <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white">
                <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
                  <thead className="bg-slate-100 text-slate-900"><tr><th className="p-3">Course</th><th className="p-3">Start slot</th><th className="p-3">Room</th></tr></thead>
                  <tbody>{draft.map((entry, index) => {
                    const course = project.data.courses.find((item) => item.id === entry.course_id);
                    return <tr key={entry.id} className="border-t border-slate-200">
                      <th scope="row" className="p-3 font-medium">{course ? `${course.code} · ${course.name}` : entry.course_id}</th>
                      <td className="p-3"><label className="sr-only" htmlFor={`slot-${entry.id}`}>Start slot for {course?.code ?? entry.course_id}</label><select id={`slot-${entry.id}`} value={entry.start_slot_id} onChange={(event) => updateEntry(index, "start_slot_id", event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-slate-900 focus-visible:outline-2 focus-visible:outline-brand-maroon-strong">{project.data.slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.day} · {slot.label}</option>)}</select></td>
                      <td className="p-3"><label className="sr-only" htmlFor={`room-${entry.id}`}>Room for {course?.code ?? entry.course_id}</label><select id={`room-${entry.id}`} value={entry.room_id} onChange={(event) => updateEntry(index, "room_id", event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-slate-900 focus-visible:outline-2 focus-visible:outline-brand-maroon-strong">{project.data.rooms.map((room) => <option key={room.id} value={room.id}>{room.name} (capacity {room.capacity})</option>)}</select></td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
              <button type="button" onClick={() => void handleSave()} disabled={isSaving || validation?.status !== "valid"} className="min-h-11 rounded-lg bg-brand-pink px-5 font-semibold text-brand-ink hover:bg-brand-pink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? "Saving…" : "Save validated timetable"}</button>
            </>
          )}
        </>
      )}
    </section>
  );
}
