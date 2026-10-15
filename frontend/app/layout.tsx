import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import Navigation from "../components/Navigation";
import "./globals.css";

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-playfair",
});

export const metadata: Metadata = {
  title: "SlotSmith | Auto Timetable Scheduler",
  description: "Create and manage clash-free weekly timetables.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${playfairDisplay.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col text-slate-900">
        <Navigation />
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8 sm:py-12">
          {children}
        </main>
        <footer className="border-t border-[#f5e6d3]/30 px-5 py-5 text-center text-sm text-[#f5e6d3]">
          Team Curly Coders · Auto Timetable Scheduler
        </footer>
      </body>
    </html>
  );
}
