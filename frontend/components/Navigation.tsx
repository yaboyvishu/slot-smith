"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import CatIllustration from "./CatIllustration";
import NewProjectDialog from "./NewProjectDialog";
import { useDemoSession } from "../lib/auth-context";
import { useFavorites } from "../lib/favorites-provider";
import { useProject } from "../lib/project-context";

const navigationScreens = [
  { href: "/data", label: "1 Add data" },
  { href: "/constraints", label: "2 Set rules" },
  { href: "/results", label: "3 Generate" },
  { href: "/conflicts", label: "4 Fix conflicts" },
  { href: "/edit", label: "5 Edit" },
  { href: "/export", label: "6 Export" },
];

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useDemoSession();
  const {
    projectId,
    projects,
    openProject,
    newProjectDialogOpen,
    openNewProjectDialog,
  } = useProject();
  const { favorites, removeFavorite } = useFavorites();
  const switchProjects = [
    ...projects,
    ...favorites
      .filter((favorite) => !projects.some((project) => project.id === favorite.id))
      .map((favorite) => ({ ...favorite, last_opened: "" })),
  ];
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const favoritesContainerRef = useRef<HTMLDivElement>(null);
  const favoritesTriggerRef = useRef<HTMLButtonElement>(null);
  const favoritesPanelRef = useRef<HTMLDivElement>(null);
  const favoritesCloseRef = useRef<HTMLButtonElement>(null);

  function openFavorite(id: string) {
    openProject(id);
    setFavoritesOpen(false);
    router.push("/results");
  }

  const closeFavorites = useCallback((restoreFocus = false) => {
    setFavoritesOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => favoritesTriggerRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!favoritesOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        favoritesContainerRef.current &&
        !favoritesContainerRef.current.contains(event.target as Node)
      ) {
        setFavoritesOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeFavorites(true);
    };

    const frame = window.requestAnimationFrame(() => {
      const firstAction = favoritesPanelRef.current?.querySelector<HTMLElement>(
        "[data-favorite-panel-focus]",
      );
      (firstAction ?? favoritesCloseRef.current)?.focus();
    });
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [favoritesOpen, closeFavorites]);

  return (
    <>
      <nav
        aria-label="Main navigation"
        className="print-hide w-full border-b border-[var(--brand-accent)]/30"
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-4 sm:gap-4 sm:px-8 sm:py-5">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 sm:gap-3">
            <div className="flex min-w-0 shrink items-center gap-1 sm:gap-2">
              <Link
                href="/data"
                className="brand-name w-fit shrink-0 rounded-xl px-1 py-1 text-[28px] font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)]"
              >
                SlotSmith
              </Link>
              <CatIllustration size="logo" />
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-1 sm:gap-2">
              <button
                type="button"
                onClick={openNewProjectDialog}
                className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-[var(--brand-accent)] px-2 text-xs font-semibold text-brand-ink transition hover:bg-brand-pink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-accent)] sm:px-3 sm:text-sm"
              >
                + New project
              </button>
              {switchProjects.some((project) => project.id !== projectId) && (
                <label className="sr-only" htmlFor="project-switcher">Switch project</label>
              )}
              {switchProjects.some((project) => project.id !== projectId) && (
                <select id="project-switcher" aria-label="Switch project" value={projectId ?? ""} onChange={(event) => { if (event.target.value) openProject(event.target.value); }} className="min-h-10 max-w-32 rounded-lg border border-[var(--brand-accent)]/60 bg-brand-ink px-2 text-xs text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-accent)] sm:max-w-48 sm:text-sm">
                  <option value="" disabled>Select project</option>
                  {switchProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              )}
              {user ? (
                  <>
                  <span
                    className="max-w-24 truncate text-sm text-white sm:max-w-none"
                    title={`Hi, ${user.name}`}
                  >
                    Hi, {user.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      router.push("/login");
                    }}
                    aria-label="Log out"
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-[var(--brand-accent)] transition hover:bg-[var(--brand-accent)] hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-accent)] sm:px-3"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="size-5"
                    >
                      <path d="M10 17l5-5-5-5M15 12H3m9-8h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" />
                    </svg>
                    <span>Log out</span>
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  aria-label="Log in"
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-[var(--brand-accent)] transition hover:bg-[var(--brand-accent)] hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-accent)] sm:px-3"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="size-5"
                  >
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4m-5-4 5-5-5-5m5 5H3" />
                  </svg>
                  <span>Log in</span>
                </Link>
              )}

              <div className="relative" ref={favoritesContainerRef}>
                <button
                  ref={favoritesTriggerRef}
                  type="button"
                  onClick={() => setFavoritesOpen((open) => !open)}
                  aria-label={`Favorites${favorites.length ? `, ${favorites.length} saved projects` : ""}`}
                  aria-expanded={favoritesOpen}
                  aria-controls="favorites-panel"
                  className="relative inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-[var(--brand-accent)] transition hover:bg-[var(--brand-accent)] hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-accent)] sm:px-3"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill={favorites.length ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="2"
                    className="size-5"
                  >
                    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
                  </svg>
                  <span className="max-[420px]:sr-only">Favorites</span>
                  {favorites.length > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand-accent)] px-1 text-[11px] font-bold leading-none text-brand-ink"
                    >
                      {favorites.length}
                    </span>
                  )}
                </button>
                {favoritesOpen && (
                  <div
                    id="favorites-panel"
                    ref={favoritesPanelRef}
                    role="region"
                    aria-labelledby="favorites-heading"
                    className="fixed left-5 right-5 top-28 z-50 max-h-[calc(100dvh-9rem)] overflow-y-auto rounded-xl border border-slate-300 bg-[var(--panel-background)] p-3 text-slate-950 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-[70vh] sm:w-80"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-slate-300 px-2 pb-2">
                      <h2 id="favorites-heading" className="text-base font-semibold text-brand-maroon">
                        Favorites
                      </h2>
                      <button
                        ref={favoritesCloseRef}
                        type="button"
                        onClick={() => closeFavorites(true)}
                        aria-label="Close favorites"
                        data-favorite-panel-focus={favorites.length === 0 ? "true" : undefined}
                        className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-xl text-slate-800 hover:bg-pink-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon"
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </div>
                    {favorites.length ? (
                      <>
                        <ul className="divide-y divide-slate-200">
                          {favorites.map((favorite, index) => (
                            <li key={favorite.id} className="flex flex-wrap items-center justify-between gap-2 px-2 py-3">
                              <div className="min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={() => openFavorite(favorite.id)}
                                  data-favorite-panel-focus={index === 0 ? "true" : undefined}
                                  className="favorite-project-link group flex min-h-11 w-full min-w-0 items-center gap-2 text-left font-semibold text-slate-950 underline decoration-slate-400 underline-offset-2 hover:text-brand-maroon focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon"
                                >
                                  <span className="min-w-0 flex-1 truncate">{favorite.name}</span>
                                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="favorite-project-arrow size-4 shrink-0">
                                    <path d="M3 10h13m-5-5 5 5-5 5" />
                                  </svg>
                                </button>
                                <p className="text-xs text-slate-600">
                                  Saved on {new Date(favorite.saved_at).toLocaleDateString()}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openFavorite(favorite.id)}
                                  className="min-h-11 rounded-lg bg-brand-pink px-3 text-sm font-semibold text-brand-ink hover:bg-brand-pink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon"
                                >
                                  Open
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeFavorite(favorite.id)}
                                  aria-label={`Remove ${favorite.name} from this browser's favorites`}
                                  className="inline-flex size-11 items-center justify-center rounded-lg text-pink-700 hover:bg-pink-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon"
                                >
                                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" className="size-5">
                                    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
                                  </svg>
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                        <p className="px-2 pt-2 text-xs text-slate-600">
                          Removing a favorite only removes it from this browser&apos;s list.
                        </p>
                      </>
                    ) : (
                      <p className="px-2 py-4 text-sm text-slate-700">
                        No favorites yet. Tap the heart on a project to save it here.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <ul className="flex flex-wrap gap-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm">
            {navigationScreens.map((screen) => (
              <li key={screen.href}>
                <Link
                  href={screen.href}
                  onClick={() => setFavoritesOpen(false)}
                  aria-current={pathname === screen.href ? "page" : undefined}
                  className={`inline-flex min-h-10 items-center rounded-full px-3 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-accent)] ${pathname === screen.href ? "bg-brand-pink text-brand-ink" : "text-[var(--brand-accent)] hover:bg-brand-pink/15 hover:text-[var(--brand-accent)] focus-visible:bg-brand-pink/15"}`}
                >
                  {screen.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>
      {newProjectDialogOpen && <NewProjectDialog />}
    </>
  );
}
