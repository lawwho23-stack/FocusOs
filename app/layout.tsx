import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import SpaceCanvas from "@/components/space-canvas";
import Sidebar from "@/components/sidebar";

// IBM Plex Sans: plain, readable docs-style text (like posthog.com).
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  weight: "variable",
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
      className={`${plexSans.variable} h-full antialiased`}
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
