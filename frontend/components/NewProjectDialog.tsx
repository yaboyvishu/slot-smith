"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "../lib/api";
import { useProject } from "../lib/project-context";

export default function NewProjectDialog() {
  const router = useRouter();
  const {
    newProjectStage,
    setNewProjectStage,
    closeNewProjectDialog,
    saveUnsavedChanges,
    setProjectId,
    rememberProject,
    setNewProjectNotice,
  } = useProject();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSavingChanges, setIsSavingChanges] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    if (newProjectStage === "warning") {
      cancelRef.current?.focus();
    } else {
      nameRef.current?.focus();
    }
  }, [newProjectStage]);

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter a project name to continue.");
      nameRef.current?.focus();
      return;
    }

    setIsCreatingProject(true);
    setError(null);
    try {
      const project = await createProject({ name: trimmedName });
      rememberProject(project);
      setProjectId(project.id);
      setNewProjectNotice("Project created. Start by adding your courses.");
      closeNewProjectDialog();
      router.push("/data");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the project. Please try again.");
    } finally {
      setIsCreatingProject(false);
    }
  }

  async function handleSaveBeforeCreating() {
    setIsSavingChanges(true);
    const saved = await saveUnsavedChanges();
    setIsSavingChanges(false);
    if (saved) setNewProjectStage("form");
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="new-project-dialog-title"
      onCancel={(event) => { event.preventDefault(); closeNewProjectDialog(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-slate-300 bg-[var(--panel-background)] p-0 text-slate-950 shadow-2xl backdrop:bg-black/60"
    >
      <div className="p-6 sm:p-8">
        {newProjectStage === "warning" ? (
          <>
            <h2 id="new-project-dialog-title" className="text-xl font-semibold">Unsaved changes</h2>
            <p className="mt-3 text-sm leading-6 text-slate-700">You have unsaved changes. Save them first, or continue and lose them?</p>
            {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={handleSaveBeforeCreating} disabled={isSavingChanges} className="min-h-11 rounded-lg bg-brand-pink px-4 font-semibold text-brand-ink hover:bg-brand-pink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong disabled:cursor-wait disabled:opacity-60">{isSavingChanges ? "Saving…" : "Save"}</button>
              <button type="button" onClick={() => setNewProjectStage("form")} disabled={isSavingChanges} className="min-h-11 rounded-lg border border-slate-400 px-4 font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong">Continue</button>
              <button ref={cancelRef} type="button" onClick={closeNewProjectDialog} disabled={isSavingChanges} className="min-h-11 rounded-lg px-4 font-semibold text-slate-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong">Cancel</button>
            </div>
          </>
        ) : (
          <form onSubmit={handleCreateProject}>
            <h2 id="new-project-dialog-title" className="text-xl font-semibold">Start a new project</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">Give your timetable a name. Your other projects will stay saved.</p>
            <label htmlFor="new-project-name" className="mt-5 block text-sm font-medium text-slate-800">Project name</label>
            <input ref={nameRef} id="new-project-name" name="name" required value={name} onChange={(event) => { setName(event.target.value); setError(null); }} aria-invalid={Boolean(error)} aria-describedby={error ? "new-project-error" : undefined} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 outline-none focus-visible:border-brand-maroon-strong focus-visible:ring-2 focus-visible:ring-brand-pink" />
            {error && <p id="new-project-error" role="alert" className="mt-2 text-sm text-red-800">{error}</p>}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={closeNewProjectDialog} disabled={isCreatingProject} className="min-h-11 rounded-lg border border-slate-400 px-4 font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong">Cancel</button>
              <button type="submit" disabled={isCreatingProject} className="font-display min-h-11 rounded-lg bg-brand-pink px-5 font-semibold text-brand-ink hover:bg-brand-pink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong disabled:cursor-wait disabled:opacity-60">{isCreatingProject ? "Creating project…" : "Create project"}</button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
