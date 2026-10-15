"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  favoriteScreens,
  useDemoSession,
} from "../lib/auth-context";

const navigationScreens = [
  { href: "/data", label: "Data setup" },
  { href: "/constraints", label: "Constraints" },
  { href: "/results", label: "Generate & results" },
  { href: "/conflicts", label: "Conflicts" },
  { href: "/edit", label: "Edit timetable" },
  { href: "/export", label: "Export" },
];

function LoginDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { logIn } = useDemoSession();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = formData.get("name");
    if (typeof name === "string" && name.trim()) {
      logIn(name);
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="login-dialog-title"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      className="w-[min(26rem,calc(100%-2rem))] rounded-2xl border border-slate-300 bg-[var(--panel-background)] p-0 text-slate-950 shadow-2xl backdrop:bg-black/70"
    >
      <form onSubmit={handleSubmit} className="space-y-5 p-6 sm:p-7">
        <div>
          <h2
            id="login-dialog-title"
            className="text-2xl font-semibold text-[#681638]"
          >
            Demo login
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            Demo login only. No password, no server.
          </p>
        </div>
        <label htmlFor="demo-login-name" className="block text-sm font-medium">
          Your name
        </label>
        <input
          id="demo-login-name"
          name="name"
          type="text"
          autoComplete="name"
          autoFocus
          required
          maxLength={80}
          className="min-h-12 w-full rounded-lg border border-slate-400 bg-white px-3 text-slate-950 shadow-sm focus-visible:border-[#681638]"
        />
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-slate-400 px-4 text-slate-900 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="min-h-11 rounded-lg bg-[var(--brand-accent)] px-4 font-semibold text-[#111111] shadow-sm transition hover:bg-[#f3b4ce]"
          >
            Log in
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function Navigation() {
  const pathname = usePathname();
  const { userName, favorites, logOut, toggleFavorite } = useDemoSession();
  const [loginOpen, setLoginOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const currentScreen = favoriteScreens.find(
    (screen) => screen.href === pathname,
  );
  const isFavorite = currentScreen
    ? favorites.includes(currentScreen.href)
    : false;

  function handleFavoriteClick() {
    if (!userName) {
      setLoginOpen(true);
      return;
    }

    if (currentScreen) {
      toggleFavorite(currentScreen.href);
    }
  }

  return (
    <>
      <nav
        aria-label="Main navigation"
        className="w-full border-b border-[var(--brand-accent)]/30"
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-4 sm:gap-4 sm:px-8 sm:py-5">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <Link
              href="/data"
              className="brand-name w-fit shrink-0 rounded-xl px-1 py-1 text-[28px] font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)]"
            >
              SlotSmith
            </Link>
            <div className="flex min-w-0 items-center justify-end gap-1 sm:gap-2">
              {userName ? (
                <>
                  <span
                    className="max-w-24 truncate text-sm text-white sm:max-w-none"
                    title={`Hi, ${userName}`}
                  >
                    Hi, {userName}
                  </span>
                  <button
                    type="button"
                    onClick={logOut}
                    aria-label="Log out"
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-[var(--brand-accent)] transition hover:bg-[var(--brand-accent)] hover:text-[#111111] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-accent)] sm:px-3"
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
                    <span className="max-[420px]:sr-only">Log out</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setLoginOpen(true)}
                  aria-label="Log in"
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-[var(--brand-accent)] transition hover:bg-[var(--brand-accent)] hover:text-[#111111] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-accent)] sm:px-3"
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
                  <span className="max-[420px]:sr-only">Login</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleFavoriteClick}
                aria-label={
                  currentScreen
                    ? isFavorite
                      ? `Remove ${currentScreen.label} from favorites`
                      : `Add ${currentScreen.label} to favorites`
                    : "Favorites are available on the five main screens"
                }
                aria-pressed={isFavorite}
                disabled={!currentScreen}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-[var(--brand-accent)] transition hover:bg-[var(--brand-accent)] hover:text-[#111111] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-accent)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill={isFavorite ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="2"
                  className="size-6"
                >
                  <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
                </svg>
                <span className="sr-only">
                  {isFavorite ? "Favorited" : "Not favorited"}
                </span>
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setFavoritesOpen((open) => !open)}
                  aria-label="Show favorite screens"
                  aria-expanded={favoritesOpen}
                  aria-controls="favorite-screens-menu"
                  className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-[var(--brand-accent)] transition hover:bg-[var(--brand-accent)] hover:text-[#111111] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-accent)] sm:px-3"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="size-5"
                  >
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                  <span className="max-[420px]:sr-only">Favorites</span>
                </button>
                {favoritesOpen && (
                  <div
                    id="favorite-screens-menu"
                    className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-slate-300 bg-[var(--panel-background)] p-2 text-slate-950 shadow-xl"
                  >
                    <p className="px-3 py-2 text-sm font-semibold text-[#681638]">
                      Favorite screens
                    </p>
                    {userName && favorites.length ? (
                      <ul>
                        {favoriteScreens
                          .filter((screen) => favorites.includes(screen.href))
                          .map((screen) => (
                            <li key={screen.href}>
                              <Link
                                href={screen.href}
                                onClick={() => setFavoritesOpen(false)}
                                className="block rounded-lg px-3 py-2 text-sm text-slate-900 hover:bg-pink-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#681638]"
                              >
                                {screen.label}
                              </Link>
                            </li>
                          ))}
                      </ul>
                    ) : (
                      <p className="px-3 py-2 text-sm text-slate-700">
                        {userName
                          ? "No favorite screens yet."
                          : "Log in to save favorite screens."}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <ul className="flex flex-wrap gap-2">
            {navigationScreens.map((screen) => (
              <li key={screen.href}>
                <Link
                  href={screen.href}
                  onClick={() => setFavoritesOpen(false)}
                  className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-[var(--brand-accent)] transition hover:bg-[var(--brand-accent)] hover:text-[#111111] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-accent)]"
                >
                  {screen.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>
      <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}
