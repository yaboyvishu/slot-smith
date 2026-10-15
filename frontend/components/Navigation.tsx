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
      className="w-full border-b border-[#f5e6d3]/30"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-5 sm:px-8">
        <Link
          href="/data"
          className="w-fit rounded-xl bg-[#f5e6d3] px-4 py-2 font-display text-2xl font-bold tracking-tight text-[#0a0a0a] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f5e6d3]"
        >
          SlotSmith
        </Link>
        <ul className="flex flex-wrap gap-2">
          {screens.map((screen) => (
            <li key={screen.href}>
              <Link
                href={screen.href}
                className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-[#f5e6d3] transition hover:bg-[#f5e6d3] hover:text-[#0a0a0a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5e6d3]"
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
