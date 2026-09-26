"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

// One free-text note per day. The parent remounts this card with
// key={date}, so switching days always starts from that day's saved text
// and unsaved typing never leaks onto another day.
export default function DayNotesCard({
  date,
  initial,
  className,
  hud,
  onSaved,
}: {
  date: string;
  initial: string;
  className?: string;
  hud: string;
  onSaved: () => void;
}) {
  const [text, setText] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const dirty = text.trim() !== initial.trim();

  async function save() {
    setStatus("saving");
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteDate: date, content: text }),
      });
      if (!res.ok) throw new Error();
      setStatus("saved");
      onSaved();
    } catch {
      setStatus("error");
    }
  }

  return (
    <Card id="notes" className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-xl">Personal notes</CardTitle>
        <CardDescription className={hud}>
          {status === "saved" && !dirty
            ? "Saved."
            : status === "error"
              ? "Save failed — try again."
              : "Anything worth remembering."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (status !== "saving") setStatus("idle");
          }}
          placeholder="Thoughts, ideas, what happened today…"
          className="min-h-40 border-white/10 bg-white/[0.04]"
        />
        <Button onClick={save} disabled={!dirty || status === "saving"}>
          {status === "saving" ? "Saving…" : "Save note"}
        </Button>
      </CardContent>
    </Card>
  );
}
