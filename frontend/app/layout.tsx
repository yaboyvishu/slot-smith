import type { Metadata } from "next";
import { Chango } from "next/font/google";
import Navigation from "../components/Navigation";
import "./globals.css";

const chango = Chango({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-chango",
});

export const metadata: Metadata = {
  title: "SlotSmith | Auto Timetable Scheduler",
  description: "Create and manage clash-free weekly timetables.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${chango.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col text-slate-900">
        <Navigation />
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8 sm:py-12">
          {children}
        </main>
        <footer className="border-t border-[var(--brand-accent)]/30 px-5 py-5 text-center text-sm text-[var(--brand-accent)]">
          Team Curly Coders · Auto Timetable Scheduler
        </footer>
      </body>
    </html>
  );
}
