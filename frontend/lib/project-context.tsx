"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Conflict, GenerateResult } from "./types";
import { useFavorites } from "./favorites-provider";

const STORAGE_KEY = "slotsmith.current-project-id";
const PROJECTS_KEY = "slotsmith.browser-project-index";

export type BrowserProject = { id: string; name: string; last_opened: string };

type ProjectContextValue = {
  projectId: string | null;
  setProjectId: (projectId: string | null) => void;
  isProjectIdLoaded: boolean;
  projects: BrowserProject[];
  isProjectsLoaded: boolean;
  rememberProject: (project: Pick<BrowserProject, "id" | "name">) => void;
  removeProject: (id: string) => void;
  openProject: (id: string) => void;
  projectLoadVersion: number;
  generateResult: GenerateResult | null;
  setGenerateResult: (result: GenerateResult | null) => void;
  hasUnsavedChanges: boolean;
  registerUnsavedChanges: (dirty: boolean, save: () => Promise<boolean>) => () => void;
  saveUnsavedChanges: () => Promise<boolean>;
  newProjectDialogOpen: boolean;
  openNewProjectDialog: () => void;
  closeNewProjectDialog: () => void;
  newProjectStage: "warning" | "form";
  setNewProjectStage: (stage: "warning" | "form") => void;
  newProjectNotice: string | null;
  setNewProjectNotice: (notice: string | null) => void;
  activeConflict: Conflict | null;
  setActiveConflict: (conflict: Conflict | null) => void;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { updateFavoriteName } = useFavorites();
  const [projectId, setProjectIdState] = useState<string | null>(null);
  const [isProjectIdLoaded, setIsProjectIdLoaded] = useState(false);
  const [projects, setProjects] = useState<BrowserProject[]>([]);
  const [isProjectsLoaded, setIsProjectsLoaded] = useState(false);
  const [projectLoadVersion, setProjectLoadVersion] = useState(0);
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [newProjectStage, setNewProjectStage] = useState<"warning" | "form">("form");
  const [newProjectNotice, setNewProjectNotice] = useState<string | null>(null);
  const unsavedSaveRef = useRef<(() => Promise<boolean>) | null>(null);
  const newProjectOpenerRef = useRef<HTMLElement | null>(null);
  const [activeConflict, setActiveConflict] = useState<Conflict | null>(null);

  useEffect(() => {
    setProjectIdState(window.localStorage.getItem(STORAGE_KEY));
    try {
      const saved = JSON.parse(window.localStorage.getItem(PROJECTS_KEY) ?? "[]");
      if (Array.isArray(saved)) {
        setProjects(saved.filter((item): item is BrowserProject =>
          !!item && typeof item.id === "string" && typeof item.name === "string" && typeof item.last_opened === "string",
        ));
      }
    } catch {
      setProjects([]);
    }
    setIsProjectsLoaded(true);
    setIsProjectIdLoaded(true);
  }, []);

  const rememberProject = useCallback((project: Pick<BrowserProject, "id" | "name">) => {
    updateFavoriteName(project.id, project.name);
    setProjects((current) => {
      const next = [{ ...project, last_opened: new Date().toISOString() }, ...current.filter((item) => item.id !== project.id)];
      window.localStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
      return next;
    });
  }, [updateFavoriteName]);

  const removeProject = useCallback((id: string) => {
    setProjects((current) => {
      const next = current.filter((item) => item.id !== id);
      window.localStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setProjectId = useCallback((nextProjectId: string | null) => {
    setProjectIdState(nextProjectId);
    setGenerateResult(null);
    setActiveConflict(null);
    if (nextProjectId) {
      window.localStorage.setItem(STORAGE_KEY, nextProjectId);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const openProject = useCallback((id: string) => {
    setProjectLoadVersion((version) => version + 1);
    setProjectId(id);
  }, [setProjectId]);

  const registerUnsavedChanges = useCallback((dirty: boolean, save: () => Promise<boolean>) => {
    unsavedSaveRef.current = save;
    setHasUnsavedChanges(dirty);
    return () => {
      if (unsavedSaveRef.current === save) {
        unsavedSaveRef.current = null;
        setHasUnsavedChanges(false);
      }
    };
  }, []);

  const saveUnsavedChanges = useCallback(async () => {
    const save = unsavedSaveRef.current;
    return save ? save() : true;
  }, []);

  const openNewProjectDialog = useCallback(() => {
    const activeElement = document.activeElement;
    newProjectOpenerRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    setNewProjectStage(hasUnsavedChanges ? "warning" : "form");
    setNewProjectDialogOpen(true);
  }, [hasUnsavedChanges]);

  const closeNewProjectDialog = useCallback(() => {
    setNewProjectDialogOpen(false);
    window.requestAnimationFrame(() => newProjectOpenerRef.current?.focus());
  }, []);

  const value = useMemo(
    () => ({
      projectId,
      setProjectId,
      isProjectIdLoaded,
      projects,
      isProjectsLoaded,
      rememberProject,
      removeProject,
      openProject,
      projectLoadVersion,
      generateResult,
      setGenerateResult,
      hasUnsavedChanges,
      registerUnsavedChanges,
      saveUnsavedChanges,
      newProjectDialogOpen,
      openNewProjectDialog,
      closeNewProjectDialog,
      newProjectStage,
      setNewProjectStage,
      newProjectNotice,
      setNewProjectNotice,
      activeConflict,
      setActiveConflict,
    }),
    [
      projectId,
      setProjectId,
      isProjectIdLoaded,
      projects,
      isProjectsLoaded,
      rememberProject,
      removeProject,
      openProject,
      projectLoadVersion,
      generateResult,
      hasUnsavedChanges,
      registerUnsavedChanges,
      saveUnsavedChanges,
      newProjectDialogOpen,
      openNewProjectDialog,
      closeNewProjectDialog,
      newProjectStage,
      setNewProjectStage,
      newProjectNotice,
      setNewProjectNotice,
      activeConflict,
    ],
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used inside ProjectProvider.");
  }
  return context;
}
