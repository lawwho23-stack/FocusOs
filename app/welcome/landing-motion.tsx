"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function LandingMotion({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const targets = element.querySelectorAll<HTMLElement>("[data-reveal]");
    let observer: IntersectionObserver | undefined;

    function observe() {
      observer?.disconnect();
      targets.forEach((target) => target.removeAttribute("data-revealed"));
      if (
        preference.matches ||
        typeof window.IntersectionObserver !== "function"
      ) return;
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              // Content is visible by default: a failed script cannot hide it.
              (entry.target as HTMLElement).dataset.revealed = "true";
              observer?.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.12 }
      );
      targets.forEach((target) => observer?.observe(target));
    }

    function visibility() {
      element!.dataset.paused = String(document.hidden);
    }

    observe();
    visibility();
    preference.addEventListener("change", observe);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer?.disconnect();
      preference.removeEventListener("change", observe);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
