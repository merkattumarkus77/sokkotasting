"use client";

import { useEffect, useRef, useState } from "react";
import type { BeepPlayer } from "@/lib/audioBeep";
import { getTimerState, type TimerAppearance } from "@/lib/timer";

interface CountdownTimerProps {
  servedAtMs: number;
  timeLimitMinutes: number;
  clockOffsetMs: number;
  beepPlayer: BeepPlayer | null;
}

const APPEARANCE_CLASSES: Record<TimerAppearance, string> = {
  green: "text-success",
  orange: "text-orange-500",
  red: "text-danger",
  "red-pulse": "text-danger animate-pulse",
  pulse: "text-danger animate-pulse",
  overtime: "text-danger animate-pulse text-3xl font-bold",
};

function formatRemaining(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const sign = totalSeconds < 0 ? "-" : "";
  const abs = Math.abs(totalSeconds);
  const minutes = Math.floor(abs / 60);
  const seconds = abs % 60;
  return `${sign}${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// SPEC 9: recomputed from Date.now() (corrected by clockOffsetMs, from the
// server's clock via GET /api/me) on every tick and on visibilitychange —
// never by decrementing a counter, since setInterval drifts in background
// tabs. Never locks the form: negative time is rendered, not hidden.
export default function CountdownTimer({
  servedAtMs,
  timeLimitMinutes,
  clockOffsetMs,
  beepPlayer,
}: CountdownTimerProps) {
  const [now, setNow] = useState(() => Date.now() + clockOffsetMs);
  const lastSoundRef = useRef<"none" | "calm" | "urgent">("none");

  useEffect(() => {
    function tick() {
      setNow(Date.now() + clockOffsetMs);
    }
    tick();
    const interval = setInterval(tick, 1000);
    function onVisibilityChange() {
      if (document.visibilityState === "visible") tick();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [clockOffsetMs]);

  const state = getTimerState(servedAtMs, timeLimitMinutes, now);

  useEffect(() => {
    if (!beepPlayer || state.sound === lastSoundRef.current) return;
    if (state.sound === "calm") beepPlayer.playCalm();
    if (state.sound === "urgent") beepPlayer.playUrgent();
    lastSoundRef.current = state.sound;
  }, [beepPlayer, state.sound]);

  const isOvertime = state.appearance === "overtime";

  return (
    <div className={isOvertime ? "rounded-lg bg-danger/20 p-3 text-center" : "text-center"}>
      <p className={`font-mono text-xl ${APPEARANCE_CLASSES[state.appearance]}`}>
        {formatRemaining(state.remainingMs)}
      </p>
    </div>
  );
}
