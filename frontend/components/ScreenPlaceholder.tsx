import PageHeader from "./PageHeader";

interface ScreenPlaceholderProps {
  title: string;
  description: string;
  step?: number;
}

export default function ScreenPlaceholder({
  title,
  description,
  step = 1,
}: ScreenPlaceholderProps) {
  return (
    <section className="rounded-2xl border border-slate-300 bg-[var(--panel-background)] p-6 text-slate-950 shadow-lg sm:p-8">
      <PageHeader step={step} total={6} title={title} description={description} />
      <p className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-800">
        More tools for this screen will be added later.
      </p>
    </section>
  );
}
