"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DEMO_CREDENTIALS, useDemoSession } from "../../lib/auth-context";

const inputClass =
  "mt-1 min-h-12 w-full rounded-lg border border-slate-400 bg-white px-3 text-slate-950 shadow-sm outline-none focus-visible:border-brand-maroon focus-visible:ring-2 focus-visible:ring-brand-pink";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useDemoSession();
  const [error, setError] = useState<string | null>(null);

  function finishLogin(email: string, password: string) {
    if (login(email, password)) {
      setError(null);
      router.replace("/data");
      return;
    }

    setError("Those details don’t match the demo account. Please try again.");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    finishLogin(
      String(formData.get("email") ?? ""),
      String(formData.get("password") ?? ""),
    );
  }

  return (
    <section className="mx-auto max-w-lg rounded-2xl border border-slate-300 bg-[var(--panel-background)] p-6 text-slate-950 shadow-lg sm:p-8">
      <h1 className="text-3xl font-semibold tracking-tight text-brand-maroon">
        Welcome back to SlotSmith
      </h1>
      <p className="mt-3 leading-7 text-slate-700">
        Log in to build and manage your timetables.
      </p>

      <p className="mt-4 rounded-lg border border-pink-200 bg-pink-50 p-3 text-sm leading-6 text-pink-950">
        Demo login, no real account is created.
      </p>

      <div className="mt-5 rounded-lg border border-slate-300 bg-white p-4 text-sm text-slate-800">
        <p className="font-semibold">
          Demo account: {DEMO_CREDENTIALS.email} / {DEMO_CREDENTIALS.password}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-800">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-800">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
          />
        </div>

        <p role="alert" aria-live="polite" className="min-h-6 text-sm font-medium text-red-800">
          {error}
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            className="font-display min-h-11 flex-1 rounded-lg bg-brand-pink px-5 font-semibold text-brand-ink transition hover:bg-brand-pink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong"
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => finishLogin(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password)}
            className="min-h-11 flex-1 rounded-lg border border-brand-maroon-strong px-5 font-semibold text-brand-maroon transition hover:bg-brand-pink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong"
          >
            Continue as demo user
          </button>
        </div>
      </form>
    </section>
  );
}
