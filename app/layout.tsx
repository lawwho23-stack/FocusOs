import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import SpaceCanvas from "@/components/space-canvas";

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
        {children}
      </body>
    </html>
  );
}
