interface PageHeaderProps {
  step: number;
  total: number;
  title: string;
  description: string;
  accentLine?: string;
}

export default function PageHeader({
  step,
  total,
  title,
  description,
  accentLine,
}: PageHeaderProps) {
  return (
    <header>
      <p className="step-label text-sm font-semibold uppercase tracking-wide text-[var(--brand-accent)]">
        Step {step} of {total}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--brand-accent)]">
        {title}
        {accentLine && (
          <span className="font-accent mt-1 block text-2xl leading-tight">
            {accentLine}
          </span>
        )}
      </h1>
      <p className="mt-3 max-w-3xl leading-7 text-[var(--brand-accent)]">
        {description}
      </p>
    </header>
  );
}
