import Link from "next/link";

const screens = [
  { href: "/data", label: "Data setup" },
  { href: "/constraints", label: "Constraints" },
  { href: "/results", label: "Generate & results" },
  { href: "/conflicts", label: "Conflicts" },
  { href: "/edit", label: "Edit timetable" },
  { href: "/export", label: "Export" },
];

export default function Navigation() {
  return (
    <nav
      aria-label="Main navigation"
      className="w-full border-b border-[var(--brand-accent)]/30"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-5 sm:px-8">
        <Link
          href="/data"
          className="brand-name w-fit rounded-xl px-1 py-1 text-2xl font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)]"
        >
          SlotSmith
        </Link>
        <ul className="flex flex-wrap gap-2">
          {screens.map((screen) => (
            <li key={screen.href}>
              <Link
                href={screen.href}
                className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-[var(--brand-accent)] transition hover:bg-[var(--brand-accent)] hover:text-[#0b1d4d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-accent)]"
              >
                {screen.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
