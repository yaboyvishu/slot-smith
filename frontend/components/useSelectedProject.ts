"use client";

import { useEffect, useState } from "react";
import { ApiError, getProject, onServerWakingUp } from "../lib/api";
import { useProject } from "../lib/project-context";
import type { Project } from "../lib/types";

export function useSelectedProject() {
  const { projectId, isProjectIdLoaded, projectLoadVersion, rememberProject } = useProject();
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [projectNotFound, setProjectNotFound] = useState(false);

  useEffect(() => onServerWakingUp(() => setIsWakingUp(true)), []);

  useEffect(() => {
    if (!isProjectIdLoaded) {
      return;
    }

    const selectedProjectId = projectId;
    if (!selectedProjectId) {
      setProject(null);
      setIsLoading(false);
      setErrorMessage(null);
      setProjectNotFound(false);
      return;
    }
    const projectIdToLoad = selectedProjectId as string;

    let isCancelled = false;
    setProject(null);
    setIsLoading(true);
    setIsWakingUp(false);
    setErrorMessage(null);
    setProjectNotFound(false);

    async function load() {
      try {
        const loadedProject = await getProject(projectIdToLoad);
        if (!isCancelled) {
          setProject(loadedProject);
          rememberProject(loadedProject);
        }
      } catch (error) {
        if (!isCancelled) {
          setProject(null);
          setProjectNotFound(error instanceof ApiError && error.code === "NOT_FOUND");
          setErrorMessage(
            error instanceof ApiError
              ? error.code === "NOT_FOUND"
                ? "We couldn’t find this project on the server. You can remove it from this browser’s list if you no longer need it."
                : error.message
              : "Something went wrong while loading the project.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
          setIsWakingUp(false);
        }
      }
    }

    void load();
    return () => {
      isCancelled = true;
    };
  }, [isProjectIdLoaded, projectId, projectLoadVersion, rememberProject]);

  return {
    project,
    projectId,
    isProjectIdLoaded,
    isLoading,
    isWakingUp,
    errorMessage,
    projectNotFound,
  };
}
