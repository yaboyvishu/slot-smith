interface ScreenPlaceholderProps {
  title: string;
  description: string;
}

export default function ScreenPlaceholder({
  title,
  description,
}: ScreenPlaceholderProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-[var(--panel-background)] p-6 shadow-sm sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
        Phase 0 setup
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl leading-7 text-slate-600">{description}</p>
      <p className="mt-6 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
        This screen is a placeholder. Its interactive features will be added in
        the corresponding project phase.
      </p>
    </section>
  );
}
