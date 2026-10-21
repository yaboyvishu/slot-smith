"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NoProjectSelected, NoTimetableYet } from "../../components/ProjectStateMessage";
import { useSelectedProject } from "../../components/useSelectedProject";
import { isMockMode, saveTimetable, validateTimetable } from "../../lib/api";
import { useProject } from "../../lib/project-context";
import type { ValidateMockScenario } from "../../lib/api";
import type { Conflict, TimetableEntry } from "../../lib/types";
import PageHeader from "../../components/PageHeader";
import FreeAvailabilityPanel from "../../components/FreeAvailabilityPanel";

const selectClass = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 outline-none focus-visible:border-brand-maroon-strong focus-visible:ring-2 focus-visible:ring-brand-pink";

export default function EditPage() {
  const { project, projectId, isProjectIdLoaded, isLoading, isWakingUp, errorMessage } = useSelectedProject();
  const { generateResult, registerUnsavedChanges } = useProject();
  const [draft, setDraft] = useState<TimetableEntry[]>([]);
  const [past, setPast] = useState<TimetableEntry[][]>([]);
  const [future, setFuture] = useState<TimetableEntry[][]>([]);
  const [savedTimetable, setSavedTimetable] = useState<TimetableEntry[] | null>(null);
  const [clashes, setClashes] = useState<Conflict[]>([]);
  const [validationIsValid, setValidationIsValid] = useState<boolean | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [scenario, setScenario] = useState<ValidateMockScenario>("clean");
  const [finderEntryId, setFinderEntryId] = useState("");
  const [finderSlotId, setFinderSlotId] = useState("");
  const validationSequence = useRef(0);
  const baseTimetable = generateResult?.timetable ?? project?.timetable ?? [];
  const editableTimetable = savedTimetable ?? project?.timetable ?? [];
  const selectedFinderSlot = project?.data.slots.find((slot) => slot.id === finderSlotId)
    ?? project?.data.slots[0];

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (project) {
        setSavedTimetable(project.timetable);
        setDraft(generateResult?.timetable ?? project.timetable);
        setPast([]);
        setFuture([]);
        setClashes([]);
        setValidationIsValid(null);
      } else {
        setDraft([]);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [project, generateResult]);

  const hasChanges = Boolean(project && JSON.stringify(draft) !== JSON.stringify(editableTimetable));

  const validateDraft = useCallback(async (
    nextDraft: TimetableEntry[],
    scenarioOverride = scenario,
  ) => {
    if (!project) return;
    setClashes([]);
    setValidationIsValid(null);
    setLocalError(null);
    setStatusMessage(null);
    setIsValidating(true);
    const sequence = validationSequence.current + 1;
    validationSequence.current = sequence;

    try {
      const response = await validateTimetable(
        project.id,
        {
          timetable: nextDraft.map((entry) => ({
            id: entry.id,
            course_id: entry.course_id,
            faculty_id: entry.faculty_id,
            room_id: entry.room_id,
            start_slot_id: entry.start_slot_id,
            length_slots: entry.length_slots,
          })),
        },
        scenarioOverride,
      );
      if (validationSequence.current === sequence) {
        setClashes(response.clashes);
        setValidationIsValid(response.valid);
      }
    } catch (cause) {
      if (validationSequence.current === sequence) {
        setLocalError(cause instanceof Error ? cause.message : "Could not validate this change.");
      }
    } finally {
      if (validationSequence.current === sequence) {
        setIsValidating(false);
      }
    }
  }, [project, scenario]);

  async function handleEntryChange(
    entryId: string,
    change: Partial<TimetableEntry>,
    scenarioOverride = scenario,
  ) {
    if (!project) return;
    const nextDraft = draft.map((entry) => entry.id === entryId ? { ...entry, ...change } : entry);
    if (JSON.stringify(nextDraft) !== JSON.stringify(draft)) {
      setPast((history) => [...history, draft]);
      setFuture([]);
    }
    setDraft(nextDraft);
    await validateDraft(nextDraft, scenarioOverride);
  }

  const handleUndo = useCallback(async () => {
    if (!project || past.length === 0 || isValidating || isSaving) return;
    const previousDraft = past[past.length - 1];
    setPast((history) => history.slice(0, -1));
    setFuture((history) => [...history, draft]);
    setDraft(previousDraft);
    setStatusMessage("Undoing your last change and checking the timetable…");
    await validateDraft(previousDraft);
  }, [project, past, isValidating, isSaving, draft, validateDraft]);

  const handleRedo = useCallback(async () => {
    if (!project || future.length === 0 || isValidating || isSaving) return;
    const nextDraft = future[future.length - 1];
    setFuture((history) => history.slice(0, -1));
    setPast((history) => [...history, draft]);
    setDraft(nextDraft);
    setStatusMessage("Restoring your change and checking the timetable…");
    await validateDraft(nextDraft);
  }, [project, future, isValidating, isSaving, draft, validateDraft]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest("input, textarea, select, [contenteditable='true']"))
      ) {
        return;
      }

      const hasModifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const isUndoShortcut = hasModifier && key === "z" && !event.shiftKey;
      const isRedoShortcut =
        hasModifier && ((key === "z" && event.shiftKey) || (event.ctrlKey && key === "y"));

      if (isUndoShortcut && past.length > 0 && !isValidating && !isSaving) {
        event.preventDefault();
        void handleUndo();
      } else if (isRedoShortcut && future.length > 0 && !isValidating && !isSaving) {
        event.preventDefault();
        void handleRedo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [past, future, isValidating, isSaving, handleUndo, handleRedo]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!project || !hasChanges || validationIsValid === false) return false;
    setIsSaving(true);
    setLocalError(null);
    setStatusMessage(null);
    try {
      const saved = await saveTimetable(project.id, {
        timetable: draft.map((entry) => ({
          id: entry.id,
          course_id: entry.course_id,
          faculty_id: entry.faculty_id,
          room_id: entry.room_id,
          start_slot_id: entry.start_slot_id,
          length_slots: entry.length_slots,
        })),
      });
      setDraft(saved.timetable);
      setSavedTimetable(saved.timetable);
      setPast([]);
      setFuture([]);
      setClashes([]);
      setValidationIsValid(null);
      const savedAt = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date());
      setStatusMessage(`Saved at ${savedAt}`);
      return true;
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "Could not save these changes.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [draft, hasChanges, project, validationIsValid]);

  useEffect(() => registerUnsavedChanges(hasChanges, handleSave), [
    handleSave,
    hasChanges,
    registerUnsavedChanges,
  ]);

  return (
    <section className="space-y-6">
      <PageHeader step={5} total={6} title="Edit your timetable" description="Move classes by hand. Clashes are flagged instantly." accentLine="fine-tune the flow." />

      {!isProjectIdLoaded && <p role="status" className="rounded-lg bg-slate-100 p-4 text-sm text-slate-800">Loading selected project…</p>}
      {isProjectIdLoaded && !projectId && <NoProjectSelected />}
      {isLoading && (
        <p role="status" className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
          {isWakingUp ? "Waking up the server, this can take up to a minute." : "Loading timetable…"}
        </p>
      )}
      {errorMessage && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{errorMessage}</p>}
      {localError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{localError}</p>}
      {statusMessage && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">{statusMessage}</p>}

      {project && baseTimetable.length === 0 && <NoTimetableYet message="Generate a timetable before moving a class." />}
      {project && baseTimetable.length > 0 && (
        <>
          {isMockMode && (
            <div className="max-w-sm">
              <label htmlFor="validate-scenario" className="block text-sm font-medium text-slate-800">Example check result</label>
              <select id="validate-scenario" value={scenario} onChange={(event) => {
                const nextScenario = event.target.value as ValidateMockScenario;
                setScenario(nextScenario);
                if (draft[0]) void handleEntryChange(draft[0].id, {}, nextScenario);
              }} className={`${selectClass} mt-1`}>
                <option value="clean">No clashes</option>
                <option value="clashes">Show sample clashes</option>
              </select>
            </div>
          )}

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
            <div className="space-y-4">
              <div className="space-y-4">
            {draft.map((entry) => {
              const course = project.data.courses.find((item) => item.id === entry.course_id);
              const faculty = project.data.faculty.find((item) => item.id === entry.faculty_id);
              const entryClashes = clashes.filter((clash) => clash.affected_entry_ids.includes(entry.id));
              return (
                <article key={entry.id} className={`rounded-2xl border bg-[var(--panel-background)] p-5 shadow-sm ${entryClashes.length ? "border-red-700" : "border-slate-300"}`}>
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold text-slate-950">{course ? `${course.code} · ${course.name}` : entry.course_id}</h2>
                      <p className="mt-1 text-sm text-slate-600">{faculty?.name ?? entry.faculty_id} · {entry.length_slots} {entry.length_slots === 1 ? "slot" : "slots"}</p>
                    </div>
                    {entryClashes.length > 0 && <span className="flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-900"><span aria-hidden="true">⚠</span> Clash</span>}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`slot-${entry.id}`} className="block text-sm font-medium text-slate-800">Start time slot</label>
                      <select id={`slot-${entry.id}`} value={entry.start_slot_id} onChange={(event) => void handleEntryChange(entry.id, { start_slot_id: event.target.value })} disabled={isValidating || isSaving} className={`${selectClass} mt-1`}>
                        {project.data.slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.label} ({slot.id})</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`room-${entry.id}`} className="block text-sm font-medium text-slate-800">Room</label>
                      <select id={`room-${entry.id}`} value={entry.room_id} onChange={(event) => void handleEntryChange(entry.id, { room_id: event.target.value })} disabled={isValidating || isSaving} className={`${selectClass} mt-1`}>
                        {project.data.rooms.map((room) => <option key={room.id} value={room.id}>{room.name} · {room.capacity} seats</option>)}
                      </select>
                    </div>
                  </div>
                  {entryClashes.map((clash, index) => <p key={`${clash.type}-${index}`} className="mt-3 flex gap-2 rounded-lg bg-red-50 p-3 text-sm leading-6 text-red-950"><span aria-hidden="true" className="font-bold">⚠</span><span>{clash.message}</span></p>)}
                </article>
              );
            })}
              </div>

          {isValidating && <p role="status" className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">Checking this change with the timetable rules…</p>}
          {validationIsValid === true && !isValidating && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">No clashes found for this change.</p>}
          {clashes.length > 0 && (
            <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-950">
              <p className="font-semibold">We found {clashes.length} {clashes.length === 1 ? "clash" : "clashes"}.</p>
              <ul className="mt-2 list-inside list-disc space-y-1">{clashes.map((clash, index) => <li key={`${clash.type}-${index}`}>{clash.message}</li>)}</ul>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void handleUndo()} disabled={past.length === 0 || isValidating || isSaving} title={past.length === 0 ? "No edits are available to undo." : `Undo one of ${past.length} available edits.`} aria-describedby="undo-help" className="min-h-11 rounded-lg border border-brand-pink px-5 font-semibold text-brand-pink transition hover:bg-brand-pink hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-pink disabled:cursor-not-allowed disabled:opacity-50">Undo</button>
            <button type="button" onClick={() => void handleRedo()} disabled={future.length === 0 || isValidating || isSaving} title={future.length === 0 ? "No edits are available to redo." : `Redo one of ${future.length} available edits.`} aria-describedby="redo-help" className="min-h-11 rounded-lg border border-brand-pink px-5 font-semibold text-brand-pink transition hover:bg-brand-pink hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-pink disabled:cursor-not-allowed disabled:opacity-50">Redo</button>
            <button type="button" onClick={handleSave} disabled={!hasChanges || isValidating || isSaving || validationIsValid === false} className="font-display min-h-11 rounded-lg bg-brand-pink px-5 font-semibold text-brand-ink transition hover:bg-brand-pink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-pink disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? "Saving…" : "Save timetable"}</button>
          </div>
          <p id="undo-help" className="sr-only">{past.length === 0 ? "No edits are available to undo." : `Undo ${past.length} steps available.`}</p>
          <p id="redo-help" className="sr-only">{future.length === 0 ? "No edits are available to redo." : `Redo ${future.length} steps available.`}</p>
          <p role="status" aria-live="polite" className="text-sm text-slate-700">
            Undo {past.length} {past.length === 1 ? "step" : "steps"} available · Redo {future.length} {future.length === 1 ? "step" : "steps"} available.
          </p>
          {validationIsValid === false && <p className="text-sm text-red-900">Resolve the reported clashes before saving.</p>}
            </div>
            <FreeAvailabilityPanel
              project={project}
              timetable={draft}
              selectedEntryId={finderEntryId}
              selectedSlotId={selectedFinderSlot?.id ?? ""}
              isValidating={isValidating}
              isSaving={isSaving}
              error={localError ?? errorMessage}
              onSelectEntry={setFinderEntryId}
              onSelectSlot={setFinderSlotId}
              onMoveToSlot={(entryId, slotId) => void handleEntryChange(entryId, { start_slot_id: slotId })}
              onMoveToRoom={(entryId, roomId) => void handleEntryChange(entryId, { room_id: roomId })}
            />
          </div>
        </>
      )}
    </section>
  );
}
