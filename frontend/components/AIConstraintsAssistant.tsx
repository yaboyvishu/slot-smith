"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import {
  ApiError,
  interpretAIConstraints,
  updateProjectConstraints,
} from "../lib/api";
import type { Constraints, Preference, Project } from "../lib/types";

const inputClass = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong";
const buttonClass = "min-h-11 rounded-lg px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong disabled:cursor-not-allowed disabled:opacity-50";

function errorText(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Could not reach the server. Check your connection and try again.";
  }
  switch (error.code) {
    case "AI_NOT_CONFIGURED":
      return "AI interpretation is not configured on the backend yet.";
    case "AI_RATE_LIMITED":
      return "The AI service is busy. Wait a moment, then try again.";
    case "AI_TIMEOUT":
      return "The AI request took too long. Your instruction and answers are still here; please retry.";
    case "AI_RESPONSE_INVALID":
      return "The AI returned a response the backend could not validate. Please rephrase the request and try again.";
    case "AI_PROVIDER_ERROR":
      return "The AI service could not process this request. Please try again shortly.";
    case "VALIDATION_ERROR":
      return error.details.length
        ? `${error.message} ${error.details.map((detail) => typeof detail === "object" && detail !== null && "message" in detail ? String(detail.message) : "").filter(Boolean).join(" ")}`
        : error.message;
    default:
      return error.message;
  }
}

export default function AIConstraintsAssistant({ project }: { project: Project }) {
  const [instruction, setInstruction] = useState("");
  const [answerHistory, setAnswerHistory] = useState<{
    question_id: string;
    question: string;
    answer: string;
  }[]>([]);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Awaited<ReturnType<typeof interpretAIConstraints>> | null>(null);
  const [proposal, setProposal] = useState<Constraints | null>(null);
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function interpret(answers: typeof answerHistory) {
    setIsInterpreting(true);
    setError(null);
    setSaved(false);
    setConfirmed(false);
    try {
      const response = await interpretAIConstraints(project.id, {
        instruction: instruction.trim(),
        clarification_answers: answers,
      });
      setAnswerHistory(answers);
      setResult(response);
      setProposal(response.status === "ready" ? structuredClone(response.proposed_constraints) : null);
      setAnswerDrafts({});
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setIsInterpreting(false);
    }
  }

  function startOver() {
    setInstruction("");
    setAnswerHistory([]);
    setAnswerDrafts({});
    setResult(null);
    setProposal(null);
    setError(null);
    setSaved(false);
    setConfirmed(false);
  }

  function submitInstruction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!instruction.trim() || isInterpreting) return;
    setAnswerHistory([]);
    setAnswerDrafts({});
    setProposal(null);
    setResult(null);
    void interpret([]);
  }

  function submitAnswers() {
    if (!result || result.status !== "needs_clarification" || isInterpreting) return;
    const questions = result.clarification_questions;
    const allAnswered = questions.every((question) => answerDrafts[question.question_id]?.trim());
    if (!allAnswered || answerHistory.length + questions.length > 10) return;
    const nextHistory = [
      ...answerHistory,
      ...questions.map((question) => ({
        question_id: question.question_id,
        question: question.question,
        answer: answerDrafts[question.question_id].trim(),
      })),
    ];
    void interpret(nextHistory);
  }

  async function confirmAndSave() {
    if (!proposal || !confirmed || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await updateProjectConstraints(project.id, proposal);
      setSaved(true);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setIsSaving(false);
    }
  }

  function setHardRule(field: "no_teacher_clash" | "no_room_clash" | "room_capacity", value: boolean) {
    setProposal((current) => current ? { ...current, [field]: value } : current);
    setConfirmed(false);
    setSaved(false);
  }

  function updatePreference(index: number, update: Partial<Preference>) {
    setProposal((current) => current ? {
      ...current,
      preferences: current.preferences.map((preference, i) => i === index ? { ...preference, ...update } : preference),
    } : current);
    setConfirmed(false);
    setSaved(false);
  }

  function addPreference() {
    if (!proposal || project.data.faculty.length === 0) return;
    setProposal({
      ...proposal,
      preferences: [...proposal.preferences, {
        id: crypto.randomUUID(),
        type: "faculty_prefers_slots",
        faculty_id: project.data.faculty[0].id,
        slot_ids: [],
      }],
    });
    setConfirmed(false);
    setSaved(false);
  }

  const questions = result?.status === "needs_clarification" ? result.clarification_questions : [];
  const clarificationLimitReached = answerHistory.length + questions.length > 10;

  return (
    <section aria-labelledby="ai-constraints-heading" className="print-hide space-y-5 rounded-2xl border border-brand-maroon-strong/40 bg-[var(--panel-background)] p-5 text-slate-950 shadow-md sm:p-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-maroon">AI assisted setup</p>
        <h2 id="ai-constraints-heading" className="mt-1 text-xl font-semibold">Describe your scheduling requirements</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
          The AI interprets constraints for <span className="font-semibold">{project.name}</span>. It does not save them or make a timetable. Review and confirm the proposal before saving; the existing OR-Tools solver creates the timetable afterward.
        </p>
      </div>

      <form onSubmit={submitInstruction} className="space-y-3">
        <label htmlFor="ai-instruction" className="block text-sm font-medium">Scheduling requirements</label>
        <textarea
          id="ai-instruction"
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          maxLength={4000}
          rows={4}
          placeholder="For example: Keep Dr. Rao free on Friday and avoid scheduling labs before 10:00."
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong"
          disabled={isInterpreting || isSaving || Boolean(result)}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-600">{instruction.length}/4000 characters</p>
          <button type="submit" disabled={!instruction.trim() || isInterpreting || isSaving || Boolean(result)} className={`${buttonClass} bg-brand-pink text-brand-ink hover:bg-brand-pink-strong`}>
            {isInterpreting ? "Interpreting…" : "Interpret requirements"}
          </button>
        </div>
      </form>

      {isInterpreting && <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Asking the AI to interpret your request…</p>}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}

      {result?.status === "needs_clarification" && (
        <section aria-labelledby="clarification-heading" className="space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div>
            <h3 id="clarification-heading" className="font-semibold text-amber-950">A few details need clarification</h3>
            <p className="mt-1 text-sm text-amber-950">No constraints have been proposed or saved. Answer each question; this browser will resend your original request and the full clarification history.</p>
          </div>
          {answerHistory.length > 0 && (
            <details className="rounded-lg bg-white p-3 text-sm text-slate-800">
              <summary className="cursor-pointer font-medium">Earlier clarification answers ({answerHistory.length})</summary>
              <dl className="mt-3 space-y-3">
                {answerHistory.map((answer) => <div key={answer.question_id}><dt className="font-medium">{answer.question}</dt><dd className="mt-1">{answer.answer}</dd></div>)}
              </dl>
            </details>
          )}
          {questions.map((question) => (
            <div key={question.question_id}>
              <p className="text-sm font-medium text-amber-950">{question.question}</p>
              <p className="mt-1 text-xs text-amber-900">{question.reason}</p>
              <label htmlFor={`answer-${question.question_id}`} className="sr-only">Answer: {question.question}</label>
              <textarea id={`answer-${question.question_id}`} rows={2} maxLength={1000} value={answerDrafts[question.question_id] ?? ""} onChange={(event) => setAnswerDrafts((current) => ({ ...current, [question.question_id]: event.target.value }))} disabled={isInterpreting} className="mt-2 w-full rounded-lg border border-amber-400 bg-white px-3 py-2 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong disabled:opacity-60" />
            </div>
          ))}
          {clarificationLimitReached && <p role="alert" className="text-sm text-red-800">The API accepts at most 10 clarification answers. Start a new request with the details combined into one instruction.</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={submitAnswers} disabled={isInterpreting || clarificationLimitReached || !questions.every((question) => answerDrafts[question.question_id]?.trim())} className={`${buttonClass} bg-brand-pink text-brand-ink hover:bg-brand-pink-strong`}>Submit answers</button>
            <button type="button" onClick={startOver} disabled={isInterpreting} className={`${buttonClass} border border-slate-400 text-slate-800 hover:bg-white`}>Cancel and start over</button>
          </div>
        </section>
      )}

      {result?.status === "ready" && proposal && (
        <section aria-labelledby="proposal-heading" className="space-y-4 rounded-xl border border-emerald-300 bg-emerald-50/70 p-4">
          <div>
            <h3 id="proposal-heading" className="font-semibold text-emerald-950">Review the proposed constraints</h3>
            <p className="mt-1 text-sm leading-6 text-emerald-950">{result.summary}</p>
            <p className="mt-1 text-sm text-emerald-950">This is a complete proposal that preserves existing settings unless your request clearly changed them. Edit it below before confirming.</p>
          </div>
          <fieldset className="space-y-2">
            <legend className="font-medium">Must-follow rules</legend>
            {([
              ["no_teacher_clash", "Prevent teacher clashes"],
              ["no_room_clash", "Prevent room clashes"],
              ["room_capacity", "Check room capacity"],
            ] as const).map(([field, label]) => (
              <label key={field} className="flex min-h-11 items-center gap-3 rounded-lg bg-white px-3 py-2 text-sm">
                <input type="checkbox" checked={proposal[field]} onChange={(event) => setHardRule(field, event.target.checked)} disabled={isSaving} className="size-5 accent-brand-maroon-strong disabled:opacity-60" />
                {label}
              </label>
            ))}
          </fieldset>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-medium">Preferences</h4>
              <button type="button" onClick={addPreference} disabled={!project.data.faculty.length || isSaving} className={`${buttonClass} border border-brand-maroon-strong bg-white text-brand-maroon hover:bg-brand-pink disabled:opacity-50`}>Add preference</button>
            </div>
            {proposal.preferences.length === 0 && <p className="rounded-lg bg-white p-3 text-sm text-slate-700">No extra preferences in this proposal.</p>}
            {proposal.preferences.map((preference, index) => (
              <fieldset key={preference.id} className="space-y-3 rounded-lg border border-emerald-200 bg-white p-3">
                <legend className="px-1 text-sm font-medium">Preference {index + 1}</legend>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-48 flex-1">
                    <label htmlFor={`ai-pref-faculty-${index}`} className="block text-sm">Faculty member</label>
                    <select id={`ai-pref-faculty-${index}`} value={preference.faculty_id} onChange={(event) => updatePreference(index, { faculty_id: event.target.value })} disabled={isSaving} className={`${inputClass} mt-1 disabled:opacity-60`}>
                      {project.data.faculty.map((faculty) => <option key={faculty.id} value={faculty.id}>{faculty.name} ({faculty.id})</option>)}
                    </select>
                  </div>
                  <button type="button" onClick={() => { setProposal((current) => current ? { ...current, preferences: current.preferences.filter((_, i) => i !== index) } : current); setConfirmed(false); setSaved(false); }} disabled={isSaving} className="min-h-11 rounded-lg px-3 text-sm font-medium text-red-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60">Remove</button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {project.data.slots.map((slot) => (
                    <label key={slot.id} className="flex min-h-10 items-center gap-2 rounded border border-slate-200 px-2 py-1 text-sm">
                      <input type="checkbox" checked={preference.slot_ids.includes(slot.id)} onChange={(event) => updatePreference(index, { slot_ids: event.target.checked ? [...new Set([...preference.slot_ids, slot.id])] : preference.slot_ids.filter((id) => id !== slot.id) })} disabled={isSaving} className="size-4 accent-brand-maroon-strong disabled:opacity-60" />
                      {slot.label} ({slot.id})
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-emerald-300 bg-white p-3 text-sm leading-5">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={isSaving || saved} className="mt-0.5 size-5 shrink-0 accent-brand-maroon-strong" />
            <span>I reviewed this complete constraint set and confirm that it should be saved to this project.</span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={confirmAndSave} disabled={!confirmed || isSaving || saved} className={`${buttonClass} bg-brand-pink text-brand-ink hover:bg-brand-pink-strong`}>
              {isSaving ? "Saving constraints…" : saved ? "Constraints saved" : "Confirm and save constraints"}
            </button>
            <button type="button" onClick={startOver} disabled={isSaving} className={`${buttonClass} border border-slate-400 text-slate-800 hover:bg-white`}>Cancel proposal</button>
          </div>
          {saved && <p role="status" className="rounded-lg border border-emerald-300 bg-white p-3 text-sm text-emerald-950">Constraints saved. Use the Generate timetable button below to ask the existing OR-Tools solver to create a schedule.</p>}
        </section>
      )}
    </section>
  );
}
