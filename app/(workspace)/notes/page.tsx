"use client";

import { useCallback, useEffect, useState } from "react";
import { PenLine } from "lucide-react";
import DayNotesCard from "@/components/day-notes-card";
import TodayCoach from "@/components/today-coach";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FIELD, GLASS, HUD, api, fmtDay, isValidDay, todayKey } from "@/lib/ui";

type Note = { id: string; noteDate: string; content: string; updatedAt: string };

// One note per day (DailyNote). The editor writes the chosen day;
// the history below lists every day that has a note.
export default function NotesPage() {
  const [today] = useState(todayKey);
  const [editDate, setEditDate] = useState(today);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setNotes((await api("/api/notes?recent=366")) as Note[]);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, []);

  useEffect(() => {
    let active = true;
    api("/api/notes?recent=366").then(
      (list: Note[]) => active && setNotes(list),
      (e) => active && setError(e instanceof Error ? e.message : "Load failed")
    );
    return () => {
      active = false;
    };
  }, []);

  const noteFor = (day: string) =>
    notes?.find((n) => n.noteDate.slice(0, 10) === day) ?? null;

  function edit(day: string) {
    setEditDate(day);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className={HUD + " text-primary"}>Notes / Journal</p>
        <h1 className="font-display text-5xl font-semibold tracking-tight">
          Your <span className="text-primary">notes</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          One page per day. Write today, look back any time.
        </p>
      </div>

      {error && (
        <p className="rounded-2xl bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className={HUD}>Writing for</span>
        <Input
          type="date"
          value={editDate}
          max={today}
          onChange={(e) => isValidDay(e.target.value) && setEditDate(e.target.value)}
          className={`w-44 ${FIELD}`}
        />
        {editDate !== today && (
          <Button variant="outline" size="sm" onClick={() => setEditDate(today)}>
            Back to today
          </Button>
        )}
      </div>

      {/* Remount per day (key) so unsaved text never crosses days.
          Wait for the list, or the editor would start empty and then
          a real saved note would look unsaved. */}
      {notes && (
        <DayNotesCard
          key={`notes-${editDate}`}
          date={editDate}
          initial={noteFor(editDate)?.content ?? ""}
          className={GLASS}
          hud={HUD}
          onSaved={load}
        />
      )}

      <Card className={GLASS}>
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-xl">Note history</CardTitle>
          <CardDescription className={HUD}>
            {notes ? `${notes.length} days written` : "Loading…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {notes?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No notes yet. Write the first one above.
            </p>
          )}
          {notes?.map((n) => {
            const day = n.noteDate.slice(0, 10);
            const open = expanded === n.id;
            return (
              <div
                key={n.id}
                className={`rounded-xl bg-white/[0.04] px-3 py-2 ${
                  day === editDate ? "ring-1 ring-primary/50" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => setExpanded(open ? null : n.id)}
                    className="text-left font-display text-base hover:text-primary"
                  >
                    {fmtDay(day, true)}
                    {day === today && (
                      <span className={HUD + " ml-2"}>today</span>
                    )}
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => edit(day)}
                    aria-label={`Edit note for ${day}`}
                  >
                    <PenLine className="h-4 w-4" />
                    Edit
                  </Button>
                </div>
                <p
                  onClick={() => setExpanded(open ? null : n.id)}
                  className={`cursor-pointer whitespace-pre-wrap text-sm text-muted-foreground ${
                    open ? "" : "line-clamp-2"
                  }`}
                >
                  {n.content}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>
      <TodayCoach />
    </main>
  );
}
