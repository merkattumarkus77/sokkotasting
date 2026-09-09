// SPEC 9: pure countdown math, no DOM/Firebase dependency so it is testable
// without a browser. The caller is responsible for recomputing this from
// Date.now() on every tick/visibilitychange — never by decrementing a
// counter (setInterval drifts in background tabs).

export type TimerAppearance = "green" | "orange" | "red" | "red-pulse" | "pulse" | "overtime";
export type TimerSound = "none" | "calm" | "urgent";

export interface TimerPhase {
  appearance: TimerAppearance;
  sound: TimerSound;
}

/** Remaining time in ms; negative once the round has run over (SPEC 9: this is expected, never locks the form). */
export function computeRemainingMs(
  servedAtMs: number,
  timeLimitMinutes: number,
  nowMs: number
): number {
  return servedAtMs + timeLimitMinutes * 60000 - nowMs;
}

/** p = remaining fraction of the total round time; can go negative. */
export function computeP(remainingMs: number, timeLimitMinutes: number): number {
  const totalMs = timeLimitMinutes * 60000;
  return remainingMs / totalMs;
}

/**
 * SPEC 9 table. Boundaries are inclusive on the lower edge of each tier
 * (e.g. p === 0.35 is "orange", not "green" — SPEC 15.1 tests this exact
 * value alongside 0.36 to prove the boundary lands on the right side).
 */
export function computeTimerPhase(p: number): TimerPhase {
  if (p < 0) return { appearance: "overtime", sound: "urgent" };
  if (p <= 0.05) return { appearance: "pulse", sound: "calm" };
  if (p <= 0.15) return { appearance: "red-pulse", sound: "none" };
  if (p <= 0.25) return { appearance: "red", sound: "none" };
  if (p <= 0.35) return { appearance: "orange", sound: "none" };
  return { appearance: "green", sound: "none" };
}

export interface TimerState extends TimerPhase {
  remainingMs: number;
  p: number;
}

export function getTimerState(
  servedAtMs: number,
  timeLimitMinutes: number,
  nowMs: number
): TimerState {
  const remainingMs = computeRemainingMs(servedAtMs, timeLimitMinutes, nowMs);
  const p = computeP(remainingMs, timeLimitMinutes);
  return { remainingMs, p, ...computeTimerPhase(p) };
}
