import sampleProjectFixture from "../mocks/sample_project.json";
import type {
  ApiErrorResponse,
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
  | "INTERNAL_ERROR";

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
let mockProject: Project = structuredClone(mockProjectFixture);
let firstRequestFinished = false;
let firstRequestTimer: ReturnType<typeof setTimeout> | undefined;
let wakingUpWasSignaled = false;

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

function unavailableMockFixture(feature: string): never {
  throw new ApiError(
    "INTERNAL_ERROR",
    `Mock fixture unavailable for ${feature}. Ask the backend teammate for the fixture before testing this feature in mock mode.`,
    [],
  );
}

function getMockProject(id: string): Project {
  if (id !== mockProject.id) {
    throw new ApiError("NOT_FOUND", "Project not found in the sample fixture.", [], 404);
  }

  return structuredClone(mockProject);
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
): Promise<T> {
  if (usesMocks) {
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
    return unavailableMockFixture(path.endsWith("/pdf") ? "PDF export" : "ICS export");
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
    mockProject = { ...structuredClone(mockProjectFixture), name: input.name };
    return structuredClone(mockProject);
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
    getMockProject(id);
    mockProject = { ...mockProject, data };
    return structuredClone(mockProject);
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
    getMockProject(id);
    mockProject = { ...mockProject, constraints };
    return structuredClone(mockProject);
  }

  return request<Project>(
    `/api/projects/${encodeURIComponent(id)}/constraints`,
    "PUT",
    constraints,
  );
}

export async function generateTimetable(id: string): Promise<GenerateResult> {
  if (usesMocks) {
    getMockProject(id);
    return unavailableMockFixture("timetable generation");
  }

  return request<GenerateResult>(
    `/api/projects/${encodeURIComponent(id)}/generate`,
    "POST",
  );
}

export async function validateTimetable(
  id: string,
  input: ValidateRequest,
): Promise<ValidateResponse> {
  if (usesMocks) {
    getMockProject(id);
    return unavailableMockFixture("timetable validation");
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
    getMockProject(id);
    mockProject = { ...mockProject, timetable: input.timetable };
    return structuredClone(mockProject);
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
