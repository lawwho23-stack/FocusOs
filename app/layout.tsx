import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import SpaceCanvas from "@/components/space-canvas";
import Sidebar from "@/components/sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FocusOS",
  description: "Personal AI productivity tool — daily mission, tasks, focus sessions",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SpaceCanvas />
        {/* Shared shell: the sidebar stays put while pages change beside it */}
        <div className="mx-auto flex w-full max-w-6xl items-start gap-4 p-4 pb-24 md:pb-4">
          <Sidebar />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
