import { describe, expect, it } from "vitest";
import { computeP, computeRemainingMs, computeTimerPhase, getTimerState } from "@/lib/timer";

describe("computeRemainingMs", () => {
  it("counts down from servedAt + timeLimitMinutes", () => {
    const servedAt = 1_000_000;
    const timeLimitMinutes = 5;
    expect(computeRemainingMs(servedAt, timeLimitMinutes, servedAt)).toBe(5 * 60000);
    expect(computeRemainingMs(servedAt, timeLimitMinutes, servedAt + 60000)).toBe(4 * 60000);
  });

  it("goes negative once the round has run over — this is expected, not an error", () => {
    const servedAt = 1_000_000;
    const timeLimitMinutes = 5;
    const remaining = computeRemainingMs(servedAt, timeLimitMinutes, servedAt + 6 * 60000);
    expect(remaining).toBe(-60000);
  });
});

// SPEC 15.1: tilarajat p = 0.36, 0.35, 0.26, 0.25, 0.16, 0.15, 0.06, 0.05, 0.0, -0.1
describe("computeTimerPhase boundaries", () => {
  const cases: [number, ReturnType<typeof computeTimerPhase>["appearance"]][] = [
    [0.36, "green"],
    [0.35, "orange"],
    [0.26, "orange"],
    [0.25, "red"],
    [0.16, "red"],
    [0.15, "red-pulse"],
    [0.06, "red-pulse"],
    [0.05, "pulse"],
    [0.0, "pulse"],
    [-0.1, "overtime"],
  ];

  for (const [p, expected] of cases) {
    it(`p=${p} -> ${expected}`, () => {
      expect(computeTimerPhase(p).appearance).toBe(expected);
    });
  }

  it("only pulse (5-0%) and overtime (below 0%) have sound", () => {
    expect(computeTimerPhase(0.36).sound).toBe("none");
    expect(computeTimerPhase(0.15).sound).toBe("none");
    expect(computeTimerPhase(0.05).sound).toBe("calm");
    expect(computeTimerPhase(0.0).sound).toBe("calm");
    expect(computeTimerPhase(-0.1).sound).toBe("urgent");
  });

  it("negative time never implies a locked/disabled state — the phase is purely descriptive", () => {
    const phase = computeTimerPhase(-5);
    expect(phase.appearance).toBe("overtime");
    expect(Object.keys(phase)).toEqual(["appearance", "sound"]);
  });
});

describe("getTimerState", () => {
  it("combines remaining time, p and phase", () => {
    const servedAt = 0;
    const timeLimitMinutes = 10;
    const state = getTimerState(servedAt, timeLimitMinutes, 9 * 60000); // 1 min left of 10 -> p=0.1
    expect(state.remainingMs).toBe(60000);
    expect(state.p).toBeCloseTo(0.1);
    expect(state.appearance).toBe("red-pulse");
  });

  it("computeP handles overtime correctly", () => {
    expect(computeP(-30000, 5)).toBeCloseTo(-0.1);
  });
});
