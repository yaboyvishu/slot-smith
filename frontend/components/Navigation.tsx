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
    <nav aria-label="Main navigation" className="w-full border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-5 sm:px-8">
        <Link href="/data" className="w-fit rounded font-semibold tracking-tight text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700">
          SlotSmith
        </Link>
        <ul className="flex flex-wrap gap-2">
          {screens.map((screen) => (
            <li key={screen.href}>
              <Link
                href={screen.href}
                className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
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
