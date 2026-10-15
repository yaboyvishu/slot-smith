"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  getProject,
  onServerWakingUp,
  updateProjectConstraints,
} from "../lib/api";
import type { Constraints, Preference, Project, TimeSlot } from "../lib/types";

const mockProjectId = process.env.NEXT_PUBLIC_USE_MOCK === "1" ? "demo" : "";

const ruleDescriptions = [
  {
    field: "no_teacher_clash",
    title: "Prevent teacher clashes",
    description:
      "A teacher cannot be assigned to more than one class at the same time.",
  },
  {
    field: "no_room_clash",
    title: "Prevent room clashes",
    description:
      "A room cannot host more than one class during the same time slot.",
  },
  {
    field: "room_capacity",
    title: "Check room capacity",
    description:
      "A class must be placed in a room with enough seats for its students.",
  },
] as const;

function detailsFromApiError(error: ApiError): string[] {
  return error.details.flatMap((detail) => {
    if (
      typeof detail === "object" &&
      detail !== null &&
      "field" in detail &&
      typeof detail.field === "string" &&
      "message" in detail &&
      typeof detail.message === "string"
    ) {
      return [`${detail.field}: ${detail.message}`];
    }

    return [];
  });
}

function formatTimeSlot(slot: TimeSlot): string {
  return `${slot.label} (${slot.id})`;
}

export default function ConstraintsEditor() {
  const [projectId, setProjectId] = useState(mockProjectId);
  const [project, setProject] = useState<Project | null>(null);
  const [constraints, setConstraints] = useState<Constraints | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => onServerWakingUp(() => setIsWakingUp(true)), []);

  function showError(error: unknown) {
    setErrorMessage(
      error instanceof ApiError
        ? error.message
        : "Something went wrong. Please try again.",
    );
    setErrorDetails(
      error instanceof ApiError ? detailsFromApiError(error) : [],
    );
    setStatusMessage(null);
  }

  async function handleLoad(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setIsWakingUp(false);
    setErrorMessage(null);
    setErrorDetails([]);
    setStatusMessage(null);

    try {
      const loadedProject = await getProject(projectId.trim());
      setProject(loadedProject);
      setConstraints(loadedProject.constraints);
      setProjectId(loadedProject.id);
    } catch (error) {
      setProject(null);
      setConstraints(null);
      showError(error);
    } finally {
      setIsLoading(false);
      setIsWakingUp(false);
    }
  }

  async function handleSave() {
    if (!project || !constraints) {
      return;
    }

    setIsSaving(true);
    setIsWakingUp(false);
    setErrorMessage(null);
    setErrorDetails([]);
    setStatusMessage(null);

    try {
      const savedProject = await updateProjectConstraints(
        project.id,
        constraints,
      );
      setProject(savedProject);
      setConstraints(savedProject.constraints);
      setStatusMessage("Constraints saved.");
    } catch (error) {
      showError(error);
    } finally {
      setIsSaving(false);
      setIsWakingUp(false);
    }
  }

  function updateConstraint<K extends keyof Omit<Constraints, "preferences">>(
    field: K,
    value: Constraints[K],
  ) {
    setConstraints((current) =>
      current ? { ...current, [field]: value } : current,
    );
    setStatusMessage(null);
  }

  function updatePreference(index: number, preference: Preference) {
    setConstraints((current) =>
      current
        ? {
            ...current,
            preferences: current.preferences.map((item, itemIndex) =>
              itemIndex === index ? preference : item,
            ),
          }
        : current,
    );
    setStatusMessage(null);
  }

  function addPreference() {
    if (!constraints || !project || project.data.faculty.length === 0) {
      return;
    }

    const facultyWithPreferences = project.data.faculty.find(
      (faculty) => faculty.preferred_slot_ids.length > 0,
    );
    const faculty = facultyWithPreferences ?? project.data.faculty[0];
    const availableSlotIds = new Set(project.data.slots.map((slot) => slot.id));

    setConstraints({
      ...constraints,
      preferences: [
        ...constraints.preferences,
        {
          id: crypto.randomUUID(),
          type: "faculty_prefers_slots",
          faculty_id: faculty.id,
          slot_ids: faculty.preferred_slot_ids.filter((id) =>
            availableSlotIds.has(id),
          ),
        },
      ],
    });
    setStatusMessage(null);
  }

  function deletePreference(index: number) {
    if (!constraints) {
      return;
    }

    setConstraints({
      ...constraints,
      preferences: constraints.preferences.filter(
        (_, itemIndex) => itemIndex !== index,
      ),
    });
    setStatusMessage(null);
  }

  function updatePreferenceSlots(
    index: number,
    preference: Preference,
    slotId: string,
    checked: boolean,
  ) {
    const slotIds = checked
      ? [...new Set([...preference.slot_ids, slotId])]
      : preference.slot_ids.filter((id) => id !== slotId);

    updatePreference(index, { ...preference, slot_ids: slotIds });
  }

  const hasDataForPreferences = Boolean(
    project &&
      project.data.faculty.length > 0 &&
      project.data.slots.length > 0,
  );

  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-[#f5e6d3]">
          Phase 2 · Constraints
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#f5e6d3]">
          Scheduling rules
        </h1>
        <p className="mt-3 max-w-3xl leading-7 text-[#f5e6d3]">
          Load a project to choose which rules the scheduler must follow and
          which faculty time preferences it should try to meet.
        </p>
      </header>

      <form
        onSubmit={handleLoad}
        className="flex max-w-2xl flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-[#f5e6d3] p-5 shadow-sm sm:p-6"
      >
        <div className="min-w-56 flex-1">
          <label
            htmlFor="project-id"
            className="block text-sm font-medium text-slate-800"
          >
            Project id
          </label>
          <input
            id="project-id"
            name="id"
            required
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            aria-describedby="project-id-help"
            className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-[#fff8ef] px-3 text-slate-900 outline-none focus-visible:border-blue-700 focus-visible:ring-2 focus-visible:ring-blue-200"
          />
          <p id="project-id-help" className="mt-1 text-xs leading-5 text-slate-600">
            Use the project id shown on the Data setup screen. Mock mode starts
            with “demo”.
          </p>
        </div>
        <button
          type="submit"
          disabled={isLoading || !projectId.trim()}
          className="min-h-11 rounded-lg border border-blue-700 px-5 font-semibold text-blue-800 transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-wait disabled:opacity-50"
        >
          {isLoading ? "Loading…" : "Load project"}
        </button>
      </form>

      {isLoading && (
        <p role="status" className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
          {isWakingUp
            ? "Waking up the server, this can take up to a minute."
            : "Loading project constraints…"}
        </p>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          <p className="font-semibold">{errorMessage}</p>
          {errorDetails.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-1">
              {errorDetails.map((detail, index) => (
                <li key={`${detail}-${index}`}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!project && !isLoading && !errorMessage && (
        <div className="max-w-2xl rounded-2xl border border-dashed border-slate-300 bg-[#f5e6d3] p-6 text-sm leading-6 text-slate-600">
          Enter a project id and choose <strong>Load project</strong> to view
          and edit its constraints.
        </div>
      )}

      {project && constraints && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-[#f5e6d3] px-4 py-3">
            <div>
              <p className="font-semibold text-slate-900">{project.name}</p>
              <p className="text-sm text-slate-600">Project ID: {project.id}</p>
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="min-h-11 rounded-lg bg-blue-700 px-5 font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-wait disabled:opacity-60"
            >
              {isSaving ? "Saving…" : "Save constraints"}
            </button>
          </div>

          {isSaving && (
            <p role="status" className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
              {isWakingUp
                ? "Waking up the server, this can take up to a minute."
                : "Saving constraints…"}
            </p>
          )}
          {statusMessage && (
            <p role="status" className="rounded-lg bg-green-50 p-4 text-sm text-green-900">
              {statusMessage}
            </p>
          )}

          <section
            aria-labelledby="must-follow-heading"
            className="rounded-2xl border border-slate-200 bg-[#f5e6d3] p-5 shadow-sm sm:p-6"
          >
            <h2
              id="must-follow-heading"
              className="text-lg font-semibold text-slate-950"
            >
              Must-follow rules
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Turn these on when the scheduler must obey the rule. These
              settings do not check an existing timetable in this phase.
            </p>
            <div className="mt-4 divide-y divide-slate-200">
              {ruleDescriptions.map((rule) => (
                <label
                  key={rule.field}
                  htmlFor={rule.field}
                  className="flex cursor-pointer items-start justify-between gap-4 py-4 first:pt-2 last:pb-2"
                >
                  <span className="max-w-2xl">
                    <span className="block font-medium text-slate-900">
                      {rule.title}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-slate-600">
                      {rule.description}
                    </span>
                    <code className="mt-1 block text-xs text-slate-600">
                      {rule.field}
                    </code>
                  </span>
                  <input
                    id={rule.field}
                    type="checkbox"
                    checked={constraints[rule.field]}
                    onChange={(event) =>
                      updateConstraint(rule.field, event.target.checked)
                    }
                    className="mt-1 size-5 shrink-0 rounded border-slate-300 text-blue-700 accent-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                  />
                </label>
              ))}
            </div>
          </section>

          <section
            aria-labelledby="preferences-heading"
            className="rounded-2xl border border-slate-200 bg-[#f5e6d3] p-5 shadow-sm sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2
                  id="preferences-heading"
                  className="text-lg font-semibold text-slate-950"
                >
                  Preferences
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  Preferences are goals, not must-follow rules. The solver
                  combines these entries with faculty&apos;s{" "}
                  <code>preferred_slot_ids</code> from Data setup.
                </p>
              </div>
              <button
                type="button"
                onClick={addPreference}
                disabled={!hasDataForPreferences}
                className="min-h-10 rounded-lg border border-blue-700 px-4 text-sm font-semibold text-blue-800 transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add preference
              </button>
            </div>

            {(!project.data.faculty.length || !project.data.slots.length) && (
              <div className="mt-4 rounded-lg bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                Add at least one faculty member and one time slot in{" "}
                <a
                  href="/data"
                  className="font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                >
                  Data setup
                </a>{" "}
                before adding a preference.
              </div>
            )}

            {constraints.preferences.length === 0 ? (
              <p className="mt-5 rounded-lg bg-[#fff8ef] p-4 text-sm leading-6 text-slate-600">
                No extra preferences have been added. Faculty preferences saved
                in Data setup still apply to the solver.
              </p>
            ) : (
              <ul className="mt-5 space-y-4">
                {constraints.preferences.map((preference, index) => {
                  const selectedFaculty = project.data.faculty.find(
                    (faculty) => faculty.id === preference.faculty_id,
                  );
                  const knownSlotIds = new Set(
                    project.data.slots.map((slot) => slot.id),
                  );
                  const unavailableSlotIds = preference.slot_ids.filter(
                    (slotId) => !knownSlotIds.has(slotId),
                  );

                  return (
                    <li
                      key={preference.id}
                      className="rounded-xl border border-slate-200 p-4 sm:p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">
                            Faculty preference {index + 1}
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            id: {preference.id} · type: {preference.type}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => deletePreference(index)}
                          aria-label={`Delete faculty preference ${index + 1}`}
                          className="min-h-10 rounded-md px-3 text-sm font-medium text-red-700 underline decoration-red-300 underline-offset-2 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                        >
                          Delete
                        </button>
                      </div>

                      <div className="mt-4 max-w-xl">
                        <label
                          htmlFor={`preference-${index}-faculty`}
                          className="block text-sm font-medium text-slate-800"
                        >
                          faculty_id
                        </label>
                        <select
                          id={`preference-${index}-faculty`}
                          value={preference.faculty_id}
                          onChange={(event) =>
                            updatePreference(index, {
                              ...preference,
                              faculty_id: event.target.value,
                            })
                          }
                          className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-[#fff8ef] px-3 text-slate-900 outline-none focus-visible:border-blue-700 focus-visible:ring-2 focus-visible:ring-blue-200"
                        >
                          {!selectedFaculty && (
                            <option value={preference.faculty_id}>
                              Unknown faculty id: {preference.faculty_id}
                            </option>
                          )}
                          {project.data.faculty.map((faculty) => (
                            <option key={faculty.id} value={faculty.id}>
                              {faculty.name} ({faculty.id})
                            </option>
                          ))}
                        </select>
                      </div>

                      <fieldset className="mt-5">
                        <legend className="text-sm font-medium text-slate-800">
                          slot_ids — choose preferred time slots
                        </legend>
                        {project.data.slots.length === 0 ? (
                          <p className="mt-2 text-sm text-slate-600">
                            No time slots are available in this project.
                          </p>
                        ) : (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {project.data.slots.map((slot) => (
                              <label
                                key={slot.id}
                                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-[#fff8ef] focus-within:ring-2 focus-within:ring-blue-200"
                              >
                                <input
                                  type="checkbox"
                                  checked={preference.slot_ids.includes(slot.id)}
                                  onChange={(event) =>
                                    updatePreferenceSlots(
                                      index,
                                      preference,
                                      slot.id,
                                      event.target.checked,
                                    )
                                  }
                                  className="mt-0.5 size-4 shrink-0 accent-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                                />
                                <span>{formatTimeSlot(slot)}</span>
                              </label>
                            ))}
                            {unavailableSlotIds.map((slotId) => (
                              <label
                                key={slotId}
                                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                              >
                                <input
                                  type="checkbox"
                                  checked
                                  onChange={() =>
                                    updatePreferenceSlots(
                                      index,
                                      preference,
                                      slotId,
                                      false,
                                    )
                                  }
                                  className="mt-0.5 size-4 shrink-0 accent-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                                />
                                <span>Unavailable slot id: {slotId}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </fieldset>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
