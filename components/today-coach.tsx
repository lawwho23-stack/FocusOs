"use client";

import { useState } from "react";
import CoachWidget from "@/components/coach-widget";
import { fmtDay, todayKey } from "@/lib/ui";

// The lion coach for pages that are not tied to one selected day.
// "Today" comes from the browser clock, like on My day.
export default function TodayCoach() {
  const [today] = useState(todayKey);
  return <CoachWidget date={today} dateLabel={fmtDay(today)} />;
}
