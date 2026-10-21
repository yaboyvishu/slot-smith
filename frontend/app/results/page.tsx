"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { generateTimetable, getMockGeneratedResult, isMockMode } from "../../lib/api";
import type { GenerateMockScenario } from "../../lib/api";
import { useProject } from "../../lib/project-context";
import { useFavorites } from "../../lib/favorites-provider";
import type { GenerateResult } from "../../lib/types";
import { NoProjectSelected } from "../../components/ProjectStateMessage";
import FavoriteButton from "../../components/FavoriteButton";
import WeeklyTimetable, { type TimetableColourBy } from "../../components/WeeklyTimetable";
import WorkloadSummary from "../../components/WorkloadSummary";
import PageHeader from "../../components/PageHeader";
import { useSelectedProject } from "../../components/useSelectedProject";

const selectClass = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 outline-none focus-visible:border-brand-maroon-strong focus-visible:ring-2 focus-visible:ring-brand-pink";
type TimetableView = "full" | "teacher" | "course";
const HEAVY_DAY_SESSION_THRESHOLD = 4;

export default function ResultsPage() {
  const { project, projectId, isProjectIdLoaded, isLoading, isWakingUp, errorMessage, projectNotFound } = useSelectedProject();
  const { generateResult, setGenerateResult, projectLoadVersion } = useProject();
  const { isFavorite, removeFavorite } = useFavorites();
  const [scenario, setScenario] = useState<GenerateMockScenario>("complete");
  const [localResult, setLocalResult] = useState<{
    projectId: string;
    projectLoadVersion: number;
    result: GenerateResult;
  } | null>(null);
  const result = localResult?.projectId === projectId &&
    localResult.projectLoadVersion === projectLoadVersion
    ? localResult.result
    : generateResult;
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facultyFilter, setFacultyFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [colourBy, setColourBy] = useState<TimetableColourBy>("faculty");
  const [timetableView, setTimetableView] = useState<TimetableView>("full");
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [missingFavoriteRemoved, setMissingFavoriteRemoved] = useState(false);

  useEffect(() => {
    setFacultyFilter("");
    setRoomFilter("");
    setCourseFilter("");
    setTimetableView("full");
    setSelectedTeacherId("");
    setSelectedCourseId("");
    setMissingFavoriteRemoved(false);
  }, [projectId, projectLoadVersion]);

  useEffect(() => {
    if (!isMockMode || !projectId || !project || isLoading) return;
    const savedResult = getMockGeneratedResult(projectId);
    if (savedResult) {
      setLocalResult({ projectId, projectLoadVersion, result: savedResult });
      setGenerateResult(savedResult);
    }
  }, [isLoading, isMockMode, project, projectId, projectLoadVersion, setGenerateResult]);

  async function handleGenerate() {
    if (!projectId) return;
    setIsGenerating(true);
    setError(null);
    try {
      const generated = await generateTimetable(projectId, scenario);
      setLocalResult({ projectId, projectLoadVersion, result: generated });
      setGenerateResult(generated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate a timetable.");
    } finally {
      setIsGenerating(false);
    }
  }

  const timetable = result?.timetable.filter((entry) =>
    (!facultyFilter || entry.faculty_id === facultyFilter) &&
    (!roomFilter || entry.room_id === roomFilter) &&
    (!courseFilter || entry.course_id === courseFilter),
  ) ?? [];
  const viewTimetable = timetableView === "teacher"
    ? result?.timetable.filter((entry) => entry.faculty_id === selectedTeacherId) ?? []
    : timetableView === "course"
      ? result?.timetable.filter((entry) => entry.course_id === selectedCourseId) ?? []
      : timetable;
  const selectedTeacher = project?.data.faculty.find((faculty) => faculty.id === selectedTeacherId);
  const selectedCourse = project?.data.courses.find((course) => course.id === selectedCourseId);
  const viewTitle = timetableView === "teacher"
    ? selectedTeacher ? `Timetable for ${selectedTeacher.name}` : "Choose a teacher"
    : timetableView === "course"
      ? selectedCourse ? `Timetable for ${selectedCourse.code} · ${selectedCourse.name}` : "Choose a course"
      : "Full timetable";

  let statusBanner = null;
  if (result?.status === "complete") {
    statusBanner = (
      <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
        <p className="font-semibold">Timetable complete</p>
        <p className="mt-1 text-sm">The scheduler created a timetable.</p>
      </div>
    );
  } else if (result?.status === "complete_with_unmet_preferences") {
    statusBanner = (
      <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
        <p className="font-semibold">Complete with unmet preferences</p>
        <p className="mt-1 text-sm">
          Preferences met: {result.preferences_met} of {result.preferences_total}.
        </p>
      </div>
    );
  } else if (result?.status === "impossible") {
    statusBanner = (
      <div role="status" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-950">
        <p className="font-semibold">No valid timetable could be created</p>
        <p className="mt-1 text-sm">Open the conflicts screen to review the suggested fixes.</p>
      </div>
    );
  }

  return (
    <section id="results-print" className="space-y-6">
      <PageHeader step={3} total={6} title="Generate your timetable" description="Run the solver and see your weekly timetable, or find out why one can't be made." accentLine="find your weekly rhythm." />

      {!isProjectIdLoaded && <p role="status" className="print-hide rounded-lg bg-slate-100 p-4 text-sm text-slate-800">Loading selected project…</p>}
      {isProjectIdLoaded && !projectId && <div className="print-hide"><NoProjectSelected /></div>}
      {isLoading && (
        <p role="status" className="print-hide rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
          {isWakingUp ? "Waking up the server, this can take up to a minute." : "Loading project…"}
        </p>
      )}
      {errorMessage && (
        <div role="alert" className="print-hide rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p>{projectNotFound ? "We couldn't find this project anymore." : errorMessage}</p>
          {projectNotFound && projectId && isFavorite(projectId) && !missingFavoriteRemoved && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  removeFavorite(projectId);
                  setMissingFavoriteRemoved(true);
                }}
                className="min-h-11 rounded-lg border border-brand-maroon-strong px-4 font-semibold text-brand-maroon underline underline-offset-2 hover:bg-pink-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong"
              >
                Remove from favorites
              </button>
              <span className="text-xs text-slate-700">This only removes it from this browser&apos;s favorites.</span>
            </div>
          )}
          {missingFavoriteRemoved && (
            <p aria-live="polite" className="mt-2 text-xs">Removed from this browser&apos;s favorites.</p>
          )}
        </div>
      )}
      {error && <p role="alert" className="print-hide rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</p>}

      {project && (
        <>
          <div className="print-hide flex flex-wrap items-end gap-4 rounded-2xl border border-slate-300 bg-[var(--panel-background)] p-5 shadow-md">
            <div className="min-w-48 flex-1">
              <p className="text-sm text-slate-600">Current project</p>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-slate-950">{project.name}</p>
                <FavoriteButton id={project.id} name={project.name} />
              </div>
            </div>
            {isMockMode && (
              <div className="min-w-56">
                <label htmlFor="generate-scenario" className="block text-sm font-medium text-slate-800">Example result</label>
                <select id="generate-scenario" value={scenario} onChange={(event) => setScenario(event.target.value as GenerateMockScenario)} className={`${selectClass} mt-1`}>
                  <option value="complete">Complete</option>
                  <option value="unmet">Complete with unmet preferences</option>
                  <option value="impossible">Impossible</option>
                </select>
              </div>
            )}
            <button type="button" onClick={handleGenerate} disabled={isGenerating || isLoading} className="font-display min-h-11 rounded-lg bg-brand-pink px-5 font-semibold text-brand-ink transition hover:bg-brand-pink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong disabled:cursor-wait disabled:opacity-60">
              {isGenerating ? "Generating…" : "Generate timetable"}
            </button>
          </div>

          {isGenerating && <p role="status" className="print-hide rounded-lg bg-blue-50 p-4 text-sm text-blue-900">Generating timetable…</p>}
          {statusBanner && <div className="print-hide">{statusBanner}</div>}

          {result?.status === "impossible" && result.unmet_constraints.length > 0 && (
            <div className="print-hide rounded-xl border border-red-200 bg-white p-4">
              <p className="font-semibold text-slate-950">What needs attention</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-700">
                {result.unmet_constraints.map((conflict, index) => <li key={`${conflict.type}-${index}`}>{conflict.message}</li>)}
              </ul>
              <Link href="/conflicts" className="mt-3 inline-flex min-h-10 items-center font-semibold text-brand-maroon underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-brand-maroon-strong">Open conflicts</Link>
            </div>
          )}

          {result && result.status !== "impossible" && (
            <>
              <div className="print-hide grid gap-3 rounded-2xl border border-slate-300 bg-[var(--panel-background)] p-5 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label htmlFor="timetable-view" className="block text-sm font-medium text-slate-800">View</label>
                  <select id="timetable-view" value={timetableView} onChange={(event) => setTimetableView(event.target.value as TimetableView)} className={`${selectClass} mt-1`}>
                    <option value="full">Full timetable</option>
                    <option value="teacher">One teacher</option>
                    <option value="course">One course</option>
                  </select>
                </div>
                {timetableView === "teacher" && (
                  <div>
                    <label htmlFor="view-teacher" className="block text-sm font-medium text-slate-800">Teacher</label>
                    <select id="view-teacher" value={selectedTeacherId} onChange={(event) => setSelectedTeacherId(event.target.value)} className={`${selectClass} mt-1`}>
                      <option value="">Choose a teacher</option>
                      {project.data.faculty.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                    </select>
                  </div>
                )}
                {timetableView === "course" && (
                  <div>
                    <label htmlFor="view-course" className="block text-sm font-medium text-slate-800">Course</label>
                    <select id="view-course" value={selectedCourseId} onChange={(event) => setSelectedCourseId(event.target.value)} className={`${selectClass} mt-1`}>
                      <option value="">Choose a course</option>
                      {project.data.courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.name}</option>)}
                    </select>
                  </div>
                )}
                {timetableView === "full" && (
                  <>
                    <div>
                      <label htmlFor="filter-faculty" className="block text-sm font-medium text-slate-800">Filter by faculty</label>
                      <select id="filter-faculty" value={facultyFilter} onChange={(event) => setFacultyFilter(event.target.value)} className={`${selectClass} mt-1`}>
                        <option value="">All faculty</option>
                        {project.data.faculty.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="filter-room" className="block text-sm font-medium text-slate-800">Filter by room</label>
                      <select id="filter-room" value={roomFilter} onChange={(event) => setRoomFilter(event.target.value)} className={`${selectClass} mt-1`}>
                        <option value="">All rooms</option>
                        {project.data.rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="filter-course" className="block text-sm font-medium text-slate-800">Filter by course</label>
                      <select id="filter-course" value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)} className={`${selectClass} mt-1`}>
                        <option value="">All courses</option>
                        {project.data.courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.name}</option>)}
                      </select>
                    </div>
                  </>
                )}
                <div>
                  <label htmlFor="colour-by" className="block text-sm font-medium text-slate-800">Colour by</label>
                  <select id="colour-by" value={colourBy} onChange={(event) => setColourBy(event.target.value as TimetableColourBy)} className={`${selectClass} mt-1`}>
                    <option value="faculty">Faculty</option>
                    <option value="room">Room</option>
                    <option value="course">Course</option>
                  </select>
                </div>
                <button type="button" onClick={() => window.print()} className="min-h-11 self-end rounded-lg border border-brand-maroon-strong px-5 font-semibold text-brand-maroon transition hover:bg-brand-pink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong">Print</button>
              </div>
              <h2 className="print-view-title text-xl font-semibold text-slate-950">{viewTitle}</h2>
              {timetableView !== "full" && !selectedTeacherId && timetableView === "teacher" ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-700">Choose a teacher to see their timetable.</p>
              ) : timetableView !== "full" && !selectedCourseId && timetableView === "course" ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-700">Choose a course to see its timetable.</p>
              ) : viewTimetable.length > 0 ? (
                <WeeklyTimetable project={project} timetable={viewTimetable} colourBy={colourBy} />
              ) : result.timetable.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-700">The generated timetable has no scheduled classes.</div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-700">No timetable entries match this view.</div>
              )}
              {result.unmet_constraints.length > 0 && (
                <Link href="/conflicts" className="print-hide inline-flex min-h-11 items-center font-semibold text-brand-maroon underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-brand-maroon-strong">
                  Review {result.unmet_constraints.length} unmet {result.unmet_constraints.length === 1 ? "preference" : "preferences"}
                </Link>
              )}
            </>
          )}
          {!result && project.timetable.length > 0 && !isLoading && (
            <>
              <h2 className="print-view-title text-xl font-semibold text-slate-950">Full timetable</h2>
              <WeeklyTimetable project={project} timetable={project.timetable} colourBy={colourBy} />
            </>
          )}
          {!result && project.timetable.length === 0 && !isLoading && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-[var(--panel-background)] p-6 text-sm text-slate-700">No timetable yet. Go to Step 3 to generate one.</div>
          )}
        </>
      )}
      {project && (
        <div className="print-hide">
          <WorkloadSummary
            project={project}
            timetable={result?.timetable ?? project.timetable}
            heavyDayThreshold={HEAVY_DAY_SESSION_THRESHOLD}
            isLoading={isLoading || isGenerating}
            error={errorMessage ?? error}
          />
        </div>
      )}
    </section>
  );
}
