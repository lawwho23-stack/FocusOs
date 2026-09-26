"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Moon,
  NotebookPen,
  Orbit,
  Sparkles,
  Sun,
  Target,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { DOT_COLORS, GLASS, HUD, api } from "@/lib/ui";

type Project = { id: string; name: string };
type NavItem = { href: string; label: string; icon: LucideIcon };

// Every item is its own page.
const NAV: NavItem[] = [
  { href: "/", label: "My day", icon: Sun },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/focus", label: "Focus", icon: Timer },
  { href: "/notes", label: "Notes", icon: NotebookPen },
  { href: "/reflection", label: "Reflection", icon: Moon },
  { href: "/progress", label: "Progress", icon: Orbit },
];

// The coach lives in the floating lion widget that every page mounts.
function openCoach() {
  window.dispatchEvent(new Event("focusos:open-coach"));
}

export default function Sidebar() {
  const pathname = usePathname();
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    api("/api/projects").then(
      (list: Project[]) => setProjects(list),
      () => setProjects([])
    );
  }, []);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const itemClass = (active: boolean) =>
    `flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
      active
        ? "bg-primary/15 text-primary"
        : "text-foreground/80 hover:bg-white/5"
    }`;

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`sticky top-4 hidden w-56 shrink-0 flex-col gap-1 rounded-2xl p-3 md:flex ${GLASS}`}
      >
        <div className="flex items-center gap-2 px-2 py-2">
          <Orbit className="h-4 w-4 text-primary" />
          <p className="font-display text-lg font-semibold">FocusOS</p>
        </div>
        <p className={HUD + " px-3 pt-1"}>Space / Gravity / Motion</p>
        {NAV.map((n) => {
          const active = isActive(n.href);
          return (
            <Link key={n.href} href={n.href} className={itemClass(active)}>
              <n.icon
                className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`}
              />
              {n.label}
            </Link>
          );
        })}
        <button onClick={openCoach} className={itemClass(false)}>
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          AI Coach
        </button>
        {projects.length > 0 && <p className={HUD + " px-3 pt-3"}>Projects</p>}
        {projects.map((p, i) => (
          <div
            key={p.id}
            className="flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-sm"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: DOT_COLORS[i % DOT_COLORS.length] }}
            />
            <span className="truncate">{p.name}</span>
          </div>
        ))}
      </aside>

      {/* Phone nav: one scrollable row, since the sidebar is hidden there.
          pr-24 keeps the last item clear of the lion coach button. */}
      <nav
        className={`fixed inset-x-0 bottom-0 z-40 flex gap-1 overflow-x-auto border-t py-2 pl-2 pr-24 md:hidden ${GLASS}`}
      >
        {NAV.map((n) => {
          const active = isActive(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-[11px] ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
