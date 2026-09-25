"use client";

import { useEffect, useRef } from "react";

// Full-screen animated starfield: layers of stars drifting slowly
// with a twinkle, like moving through space. Pure canvas, no images.
// Pauses when the tab is hidden; renders one static frame when the
// user prefers reduced motion.
type Star = {
  x: number;
  y: number;
  z: number; // depth 0..1 — deeper stars are smaller and slower
  gold: boolean;
  phase: number;
};

export default function SpaceCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let stars: Star[] = [];
    let raf = 0;
    let w = 0;
    let h = 0;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    function seed() {
      const count = Math.min(320, Math.floor((w * h) / 6000));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        z: Math.random(),
        gold: Math.random() < 0.08,
        phase: Math.random() * Math.PI * 2,
      }));
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function draw(time: number) {
      ctx!.fillStyle = "#08080a";
      ctx!.fillRect(0, 0, w, h);

      // Faint gold nebula glow, upper right — echoes the reference art.
      const glow = ctx!.createRadialGradient(
        w * 0.78,
        h * 0.28,
        0,
        w * 0.78,
        h * 0.28,
        Math.max(w, h) * 0.45
      );
      glow.addColorStop(0, "rgba(245, 185, 13, 0.06)");
      glow.addColorStop(1, "rgba(245, 185, 13, 0)");
      ctx!.fillStyle = glow;
      ctx!.fillRect(0, 0, w, h);

      for (const s of stars) {
        // Drift: deeper stars crawl, near stars glide. Wraps around.
        if (!reduced) {
          s.x -= (0.08 + s.z * 0.35) * (w / 1600 + 0.4);
          s.y += (0.02 + s.z * 0.08) * (h / 1200 + 0.4);
          if (s.x < -4) s.x = w + 4;
          if (s.y > h + 4) s.y = -4;
        }
        const twinkle = reduced ? 0.7 : 0.45 + 0.35 * Math.sin(time / 900 + s.phase);
        const r = 0.4 + s.z * 1.3;
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx!.fillStyle = s.gold
          ? `rgba(245, 185, 13, ${twinkle})`
          : `rgba(242, 240, 234, ${twinkle * (0.4 + s.z * 0.6)})`;
        ctx!.fill();
      }
    }

    function loop(time: number) {
      draw(time);
      if (!reduced && !document.hidden) raf = requestAnimationFrame(loop);
      else if (document.hidden) {
        // Resume when the tab is visible again.
        const onVis = () => {
          if (!document.hidden) {
            document.removeEventListener("visibilitychange", onVis);
            raf = requestAnimationFrame(loop);
          }
        };
        document.addEventListener("visibilitychange", onVis);
      }
    }

    resize();
    window.addEventListener("resize", resize);
    if (reduced) draw(0);
    else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
    />
  );
}
