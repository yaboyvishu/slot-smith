import sampleProjectFixture from "../mocks/sample_project.json";
import impossibleProjectFixture from "../mocks/sample_project_impossible.json";
import generateCompleteFixture from "../mocks/generate_complete.json";
import generateImpossibleFixture from "../mocks/generate_impossible.json";
import generateUnmetPreferencesFixture from "../mocks/generate_unmet_preferences.json";
import validateCleanFixture from "../mocks/validate_clean.json";
import validateClashesFixture from "../mocks/validate_clashes.json";
import type {
  ApiErrorResponse,
  AIInterpretRequest,
  AIInterpretResult,
  Constraints,
  CreateProjectRequest,
  GenerateResult,
  HealthResponse,
  Project,
  ProjectData,
  SaveTimetableRequest,
  ValidateRequest,
  ValidateResponse,
} from "./types";

type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "CONFLICT"
  | "INTERNAL_ERROR"
  | "NOT_IMPLEMENTED"
  | "AI_NOT_CONFIGURED"
  | "AI_RATE_LIMITED"
  | "AI_PROVIDER_ERROR"
  | "AI_RESPONSE_INVALID"
  | "AI_TIMEOUT";

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details: unknown[],
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type WakingUpListener = () => void;

const wakingUpListeners = new Set<WakingUpListener>();
const usesMocks = process.env.NEXT_PUBLIC_USE_MOCK === "1";
const mockProjectFixture: Project = sampleProjectFixture as Project;
const impossibleProject: Project = impossibleProjectFixture as Project;
export const isMockMode = usesMocks;

export type GenerateMockScenario = "complete" | "unmet" | "impossible";
export type ValidateMockScenario = "clean" | "clashes";

const mockProjects = new Map<string, Project>([
  [mockProjectFixture.id, structuredClone(mockProjectFixture)],
  [impossibleProject.id, structuredClone(impossibleProject)],
]);
const MOCK_PROJECTS_STORAGE_KEY = "slotsmith.mock-projects";
const LEGACY_MOCK_PROJECT_STORAGE_KEY = "slotsmith.mock-project-data";
const MOCK_RESULTS_STORAGE_KEY = "slotsmith.mock-generation-results";
let mockProjectLoaded = false;
let mockProjectCounter = 0;
let firstRequestFinished = false;
let firstRequestTimer: ReturnType<typeof setTimeout> | undefined;
let wakingUpWasSignaled = false;

function readMockProjectFromStorage(): void {
  if (mockProjectLoaded || typeof window === "undefined") return;
  mockProjectLoaded = true;

  try {
    const stored = window.localStorage.getItem(MOCK_PROJECTS_STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    const savedProjects: unknown[] = Array.isArray(parsed) ? parsed : [];
    try {
      const legacyStored = window.localStorage.getItem(LEGACY_MOCK_PROJECT_STORAGE_KEY);
      if (legacyStored) savedProjects.push(JSON.parse(legacyStored));
    } catch {
      // Ignore the old single-project value if it cannot be read.
    }
    for (const value of savedProjects) {
      if (
        typeof value === "object" && value !== null &&
        "id" in value && typeof value.id === "string" &&
        "name" in value && typeof value.name === "string" &&
        "data" in value && typeof value.data === "object" && value.data !== null &&
        "courses" in value.data && Array.isArray(value.data.courses) &&
        "faculty" in value.data && Array.isArray(value.data.faculty) &&
        "rooms" in value.data && Array.isArray(value.data.rooms) &&
        "slots" in value.data && Array.isArray(value.data.slots) &&
        "constraints" in value && typeof value.constraints === "object" && value.constraints !== null &&
        "timetable" in value && Array.isArray(value.timetable)
      ) {
        mockProjects.set(value.id, value as Project);
      }
    }
  } catch {
    // Corrupt or blocked browser storage should leave the sample project usable.
  }
}

function persistMockProject(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MOCK_PROJECTS_STORAGE_KEY, JSON.stringify([...mockProjects.values()]));
  } catch {
    // Mock mode remains usable for this session if storage is unavailable.
  }
}

function createMockProjectId(): string {
  let id: string;
  do {
    mockProjectCounter += 1;
    id = `mock-${Date.now()}-${mockProjectCounter}`;
  } while (mockProjects.has(id));
  return id;
}

function isGenerateResult(value: unknown): value is GenerateResult {
  return typeof value === "object" && value !== null &&
    "status" in value && ["complete", "complete_with_unmet_preferences", "impossible"].includes(String(value.status)) &&
    "timetable" in value && Array.isArray(value.timetable) &&
    "unmet_constraints" in value && Array.isArray(value.unmet_constraints) &&
    "preferences_met" in value && typeof value.preferences_met === "number" &&
    "preferences_total" in value && typeof value.preferences_total === "number";
}

function persistMockResult(id: string, result: GenerateResult): void {
  if (typeof window === "undefined") return;
  try {
    const stored = window.localStorage.getItem(MOCK_RESULTS_STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    const results: Record<string, GenerateResult> =
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? parsed as Record<string, GenerateResult>
        : {};
    results[id] = result;
    window.localStorage.setItem(MOCK_RESULTS_STORAGE_KEY, JSON.stringify(results));
  } catch {
    // A blocked or malformed storage value should not prevent mock generation.
  }
}

export function getMockGeneratedResult(id: string): GenerateResult | null {
  if (!usesMocks || typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(MOCK_RESULTS_STORAGE_KEY);
    if (!stored) return null;
    const results: unknown = JSON.parse(stored);
    if (typeof results !== "object" || results === null || !(id in results)) return null;
    const result = (results as Record<string, unknown>)[id];
    return isGenerateResult(result) ? structuredClone(result) : null;
  } catch {
    return null;
  }
}

export function onServerWakingUp(listener: WakingUpListener): () => void {
  wakingUpListeners.add(listener);

  if (wakingUpWasSignaled) {
    listener();
  }

  return () => wakingUpListeners.delete(listener);
}

function signalServerWakingUp(): void {
  wakingUpWasSignaled = true;

  for (const listener of wakingUpListeners) {
    listener();
  }
}

function getMockProject(id: string): Project {
  readMockProjectFromStorage();
  const project = mockProjects.get(id);
  if (!project) {
    throw new ApiError("NOT_FOUND", "Project not found in the sample fixture.", [], 404);
  }

  return structuredClone(project);
}

function getApiBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!baseUrl) {
    throw new ApiError(
      "BAD_REQUEST",
      "NEXT_PUBLIC_API_URL is not set. Add it to frontend/.env.local.",
      [],
    );
  }

  return baseUrl.replace(/\/+$/, "");
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }

  const error = value.error;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string" &&
    "details" in error &&
    Array.isArray(error.details)
  );
}

function asApiErrorCode(code: string): ApiErrorCode {
  switch (code) {
    case "VALIDATION_ERROR":
    case "BAD_REQUEST":
    case "NOT_FOUND":
    case "METHOD_NOT_ALLOWED":
    case "CONFLICT":
    case "INTERNAL_ERROR":
    case "NOT_IMPLEMENTED":
    case "AI_NOT_CONFIGURED":
    case "AI_RATE_LIMITED":
    case "AI_PROVIDER_ERROR":
    case "AI_RESPONSE_INVALID":
    case "AI_TIMEOUT":
      return code;
    default:
      return "INTERNAL_ERROR";
  }
}

async function throwResponseError(response: Response): Promise<never> {
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      "INTERNAL_ERROR",
      "The server returned an unreadable error response.",
      [],
      response.status,
    );
  }

  if (isApiErrorResponse(payload)) {
    throw new ApiError(
      asApiErrorCode(payload.error.code),
      payload.error.message,
      payload.error.details,
      response.status,
    );
  }

  throw new ApiError(
    "INTERNAL_ERROR",
    "The server returned an error in an unexpected format.",
    [],
    response.status,
  );
}

async function request<T>(
  path: string,
  method: "GET" | "POST" | "PUT",
  body?: unknown,
  allowInMockMode = false,
): Promise<T> {
  if (usesMocks && !allowInMockMode) {
    throw new Error("request() must not be used while mock mode is enabled.");
  }

  if (!firstRequestFinished && firstRequestTimer === undefined) {
    firstRequestTimer = setTimeout(signalServerWakingUp, 3000);
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      await throwResponseError(response);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      "INTERNAL_ERROR",
      error instanceof Error
        ? `Could not reach the server: ${error.message}`
        : "Could not reach the server.",
      [],
    );
  } finally {
    if (!firstRequestFinished) {
      firstRequestFinished = true;
      clearTimeout(firstRequestTimer);
      firstRequestTimer = undefined;
    }
  }
}

async function requestFile(path: string): Promise<Blob> {
  if (usesMocks) {
    const format = path.endsWith("/pdf") ? "PDF" : "ICS";
    throw new ApiError(
      "NOT_IMPLEMENTED",
      `${format} export is not available in mock mode. The export endpoints are not implemented by the backend yet.`,
      [],
      501,
    );
  }

  if (!firstRequestFinished && firstRequestTimer === undefined) {
    firstRequestTimer = setTimeout(signalServerWakingUp, 3000);
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`);

    if (!response.ok) {
      await throwResponseError(response);
    }

    return await response.blob();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      "INTERNAL_ERROR",
      error instanceof Error
        ? `Could not reach the server: ${error.message}`
        : "Could not reach the server.",
      [],
    );
  } finally {
    if (!firstRequestFinished) {
      firstRequestFinished = true;
      clearTimeout(firstRequestTimer);
      firstRequestTimer = undefined;
    }
  }
}

export async function getHealth(): Promise<HealthResponse> {
  if (usesMocks) {
    return { status: "ok" };
  }

  return request<HealthResponse>("/api/health", "GET");
}

export async function createProject(
  input: CreateProjectRequest,
): Promise<Project> {
  if (usesMocks) {
    readMockProjectFromStorage();
    const project: Project = {
      ...structuredClone(mockProjectFixture),
      id: createMockProjectId(),
      name: input.name.trim(),
      data: { courses: [], faculty: [], rooms: [], slots: [] },
      constraints: { ...mockProjectFixture.constraints, preferences: [] },
      timetable: [],
    };
    mockProjects.set(project.id, project);
    persistMockProject();
    return structuredClone(project);
  }

  return request<Project>("/api/projects", "POST", input);
}

export async function getProject(id: string): Promise<Project> {
  if (usesMocks) {
    return getMockProject(id);
  }

  return request<Project>(`/api/projects/${encodeURIComponent(id)}`, "GET");
}

export async function updateProjectData(
  id: string,
  data: ProjectData,
): Promise<Project> {
  if (usesMocks) {
    const project = getMockProject(id);
    const updatedProject = { ...project, data };
    mockProjects.set(id, updatedProject);
    persistMockProject();
    return structuredClone(updatedProject);
  }

  return request<Project>(
    `/api/projects/${encodeURIComponent(id)}/data`,
    "PUT",
    data,
  );
}

export async function updateProjectConstraints(
  id: string,
  constraints: Constraints,
): Promise<Project> {
  if (usesMocks) {
    const project = getMockProject(id);
    const updatedProject = { ...project, constraints };
    mockProjects.set(id, updatedProject);
    persistMockProject();
    return structuredClone(updatedProject);
  }

  return request<Project>(
    `/api/projects/${encodeURIComponent(id)}/constraints`,
    "PUT",
    constraints,
  );
}

export async function interpretAIConstraints(
  id: string,
  input: AIInterpretRequest,
): Promise<AIInterpretResult> {
  // AI interpretation is a real backend call even while timetable fixtures are enabled.
  return request<AIInterpretResult>(
    `/api/projects/${encodeURIComponent(id)}/ai-constraints/interpret`,
    "POST",
    input,
    true,
  );
}

export async function generateTimetable(
  id: string,
  scenario: GenerateMockScenario = "complete",
): Promise<GenerateResult> {
  if (usesMocks) {
    getMockProject(id);
    const fixtures: Record<GenerateMockScenario, GenerateResult> = {
      complete: generateCompleteFixture as GenerateResult,
      unmet: generateUnmetPreferencesFixture as GenerateResult,
      impossible: generateImpossibleFixture as GenerateResult,
    };
    const result = structuredClone(fixtures[scenario]);
    persistMockResult(id, result);
    return result;
  }

  return request<GenerateResult>(
    `/api/projects/${encodeURIComponent(id)}/generate`,
    "POST",
  );
}

export async function validateTimetable(
  id: string,
  input: ValidateRequest,
  scenario: ValidateMockScenario = "clean",
): Promise<ValidateResponse> {
  if (usesMocks) {
    getMockProject(id);
    const fixture =
      scenario === "clashes" ? validateClashesFixture : validateCleanFixture;
    return structuredClone(fixture as ValidateResponse);
  }

  return request<ValidateResponse>(
    `/api/projects/${encodeURIComponent(id)}/validate`,
    "POST",
    input,
  );
}

export async function saveTimetable(
  id: string,
  input: SaveTimetableRequest,
): Promise<Project> {
  if (usesMocks) {
    const project = getMockProject(id);
    const slots = project.data.slots;
    const timetable = input.timetable.map((entry) => {
      const startSlot = slots.find((slot) => slot.id === entry.start_slot_id);
      let coveredSlots = startSlot ? [startSlot] : [];

      for (let offset = 1; startSlot && offset < entry.length_slots; offset += 1) {
        const previous = coveredSlots[offset - 1];
        const next = slots.find(
          (slot) =>
            slot.day === startSlot.day &&
            slot.start === previous.end,
        );
        if (!next) break;
        coveredSlots = [...coveredSlots, next];
      }

      return {
        ...entry,
        slot_ids: startSlot
          ? coveredSlots.map((slot) => slot.id)
          : [entry.start_slot_id],
      };
    });
    const updatedProject = { ...project, timetable };
    mockProjects.set(id, updatedProject);
    persistMockProject();
    return structuredClone(updatedProject);
  }

  return request<Project>(
    `/api/projects/${encodeURIComponent(id)}/timetable`,
    "PUT",
    input,
  );
}

export async function exportProjectPdf(id: string): Promise<Blob> {
  return requestFile(`/api/projects/${encodeURIComponent(id)}/export/pdf`);
}

export async function exportProjectIcs(id: string): Promise<Blob> {
  return requestFile(`/api/projects/${encodeURIComponent(id)}/export/ics`);
}

// TODO Phase 9: import endpoint, waiting for contract details
