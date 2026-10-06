// Local fixture gateway. Start Next with the isolated database URL documented in
// tests/README-planning.md. No ancillary API request reaches the shared database.
import http from "node:http";
const origin = "http://127.0.0.1:3000";
const log = [];
let failMove = false,
  failSave = false,
  slowSave = false;
const day = (date) => ({
  date,
  mission: null,
  sessions: [],
  reflection: null,
  note: null,
  stats: {
    tasksDone: 0,
    tasksTotal: 0,
    taskPct: null,
    focusMinutes: 0,
    sessionsCompleted: 0,
    sessionsInterrupted: 0,
    plannedMinutes: 0,
    energy: null,
    minutesLost: null,
  },
});
for (const [port, mode] of [
  [3010, "normal"],
  [3012, "reduced"],
  [3013, "storage-failure"],
]) {
  http
    .createServer(async (req, res) => {
      const url = new URL(req.url, origin);
      log.push({ port, path: url.pathname, method: req.method });
      if (url.pathname === "/__test/log") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(log));
        return;
      }
      if (url.pathname === "/__test/fail-move") {
        failMove = true;
        res.end("Next move fails");
        return;
      }
      if (url.pathname === "/__test/fail-save") {
        failSave = true;
        res.end("Next save fails");
        return;
      }
      if (url.pathname === "/__test/slow-save") {
        slowSave = true;
        res.end("Next save delayed");
        return;
      }
      if (
        url.pathname.startsWith("/api/") &&
        !url.pathname.startsWith("/api/planning-ideas")
      ) {
        let data = [];
        if (url.pathname === "/api/day")
          data = day(url.searchParams.get("date") || "2026-10-06");
        if (url.pathname === "/api/ai/coach/chat") data = { messages: [] };
        if (url.pathname === "/api/ai/coach/health") data = { ok: true };
        if (url.pathname === "/api/ai/coach")
          data = {
            message:
              "Fixture preview. Your plans stay separate from daily missions.",
          };
        if (url.pathname === "/api/progress/days")
          data = {
            aiError: null,
            totals: {
              tasksDone: 0,
              focusMinutes: 0,
              activeDays: 0,
              avgScore: null,
            },
            days: [],
          };
        if (url.pathname === "/api/focus-sessions")
          data = {
            focusMinutes: 0,
            sessionsCompleted: 0,
            sessionsInterrupted: 0,
            days: [],
          };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
        return;
      }
      if (
        (failMove && url.pathname.endsWith("/move")) ||
        (failSave &&
          req.method !== "GET" &&
          url.pathname.startsWith("/api/planning-ideas") &&
          !url.pathname.endsWith("/move"))
      ) {
        failMove = false;
        failSave = false;
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ error: "Fixture save failure. Please try again." }),
        );
        return;
      }
      if (
        slowSave &&
        req.method !== "GET" &&
        url.pathname.startsWith("/api/planning-ideas")
      ) {
        slowSave = false;
        await new Promise((resolve) => setTimeout(resolve, 1800));
      }
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const response = await fetch(new URL(req.url, origin), {
          method: req.method,
          body: ["GET", "HEAD"].includes(req.method)
            ? undefined
            : Buffer.concat(chunks),
          headers: {
            "Content-Type": req.headers["content-type"] || "application/json",
            Accept: req.headers.accept || "*/*",
          },
        });
        const type = response.headers.get("content-type") || "";
        let body = Buffer.from(await response.arrayBuffer());
        if (type.includes("text/html")) {
          let injection = "";
          if (mode === "reduced")
            injection =
              '<script>const mm=window.matchMedia.bind(window);window.matchMedia=q=>{const r=mm(q);if(q.includes("prefers-reduced-motion"))Object.defineProperty(r,"matches",{value:true});return r;};</script>';
          if (mode === "storage-failure")
            injection =
              '<script>Storage.prototype.setItem=function(){throw new DOMException("Fixture storage unavailable","QuotaExceededError")};</script>';
          body = Buffer.from(
            body.toString().replace("<head>", "<head>" + injection),
          );
        }
        if (mode === "reduced" && type.includes("text/css"))
          body = Buffer.from(
            body
              .toString()
              .replace(
                /@media\s*\(prefers-reduced-motion:\s*reduce\)/g,
                "@media all",
              ),
          );
        res.writeHead(response.status, {
          "Content-Type": type,
          "Cache-Control": "no-store",
        });
        res.end(body);
      } catch (e) {
        res.writeHead(502);
        res.end(String(e));
      }
    })
    .listen(port, "127.0.0.1", () =>
      console.log(`${mode}: http://127.0.0.1:${port}/planning`),
    );
}
