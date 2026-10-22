import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import { DemoSessionProvider } from "../lib/auth-context";
import { FavoritesProvider } from "../lib/favorites-provider";
import { ProjectProvider } from "../lib/project-context";
import Navigation from "../components/Navigation";
import "./globals.css";

const mainFont = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-instrument-sans",
});

const accentFont = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: "italic",
  display: "swap",
  variable: "--font-instrument-serif",
});

export const metadata: Metadata = {
  title: "SlotSmith | Auto Timetable Scheduler",
  description: "Create and manage clash-free weekly timetables.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${mainFont.variable} ${accentFont.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <DemoSessionProvider>
          <FavoritesProvider>
            <ProjectProvider>
            <Navigation />
            <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8 sm:py-12">
              {children}
            </main>
            <footer className="print-hide border-t border-[var(--brand-accent)]/30 px-5 py-5 text-center text-sm text-[var(--brand-accent)]">
              Team Curly Coders · Auto Timetable Scheduler
            </footer>
            </ProjectProvider>
          </FavoritesProvider>
        </DemoSessionProvider>
      </body>
    </html>
  );
}
