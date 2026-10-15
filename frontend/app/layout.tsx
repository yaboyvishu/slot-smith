import type { Metadata } from "next";
import Navigation from "../components/Navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "SlotSmith | Auto Timetable Scheduler",
  description: "Create and manage clash-free weekly timetables.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-slate-50 text-slate-900">
        <Navigation />
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8 sm:py-12">
          {children}
        </main>
        <footer className="border-t border-slate-200 px-5 py-5 text-center text-sm text-slate-500">
          Team Curly Coders · Auto Timetable Scheduler
        </footer>
      </body>
    </html>
  );
}
