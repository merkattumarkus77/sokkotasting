import { describe, expect, it } from "vitest";
import {
  aggregateGroupStats,
  aggregateGuessingTallies,
  distinctParticipantCount,
} from "@/lib/roundAggregation";
import type { RoundDoc } from "@/lib/types";

function makeRound(overrides: Partial<RoundDoc>): RoundDoc {
  return {
    id: "r",
    tastingId: "t",
    participantId: "p1",
    roundIndex: 0,
    itemAId: "a",
    itemBId: "b",
    status: "SUBMITTED",
    servedAt: 1,
    submittedAt: 2,
    scoreA: 30,
    notes: "",
    phase: "ROUND_ROBIN",
    ...overrides,
  };
}

describe("aggregateGroupStats", () => {
  it("accumulates points, pairs and wins for both items in a round", () => {
    const rounds = [makeRound({ scoreA: 30 })]; // A wins 30-20
    const stats = aggregateGroupStats(rounds);
    expect(stats.get("a")).toMatchObject({ tastedPoints: 30, tastedPairs: 1, wonPairs: 1 });
    expect(stats.get("b")).toMatchObject({ tastedPoints: 20, tastedPairs: 1, wonPairs: 0 });
  });

  it("a 25-25 tie counts toward pairs/points but not wonPairs for either item", () => {
    const stats = aggregateGroupStats([makeRound({ scoreA: 25 })]);
    expect(stats.get("a")!.wonPairs).toBe(0);
    expect(stats.get("b")!.wonPairs).toBe(0);
  });

  it("ignores rounds that were never submitted (scoreA null)", () => {
    const stats = aggregateGroupStats([makeRound({ scoreA: null, status: "SERVED" })]);
    expect(stats.size).toBe(0);
  });

  it("accumulates across multiple rounds for the same item", () => {
    const rounds = [
      makeRound({ itemAId: "a", itemBId: "b", scoreA: 30 }),
      makeRound({ itemAId: "a", itemBId: "c", scoreA: 40 }),
    ];
    const stats = aggregateGroupStats(rounds);
    expect(stats.get("a")).toMatchObject({ tastedPoints: 70, tastedPairs: 2, wonPairs: 2 });
  });
});

describe("aggregateGuessingTallies", () => {
  it("counts up to two guesses per round, correct and attempted separately", () => {
    const rounds = [
      makeRound({ participantId: "p1", guessAId: "x", guessACorrect: true, guessBId: "y", guessBCorrect: false }),
    ];
    const tallies = aggregateGuessingTallies(rounds);
    expect(tallies.get("p1")).toEqual({ correct: 1, attempted: 2 });
  });

  it("does not count a guess slot that was left blank", () => {
    const rounds = [makeRound({ participantId: "p1", guessAId: "x", guessACorrect: true })];
    const tallies = aggregateGuessingTallies(rounds);
    expect(tallies.get("p1")).toEqual({ correct: 1, attempted: 1 });
  });

  it("aggregates across rounds for the same participant", () => {
    const rounds = [
      makeRound({ participantId: "p1", guessAId: "x", guessACorrect: true }),
      makeRound({ participantId: "p1", guessAId: "y", guessACorrect: false }),
    ];
    const tallies = aggregateGuessingTallies(rounds);
    expect(tallies.get("p1")).toEqual({ correct: 1, attempted: 2 });
  });
});

describe("distinctParticipantCount", () => {
  it("counts each participant once regardless of round count", () => {
    const rounds = [
      makeRound({ participantId: "p1" }),
      makeRound({ participantId: "p1" }),
      makeRound({ participantId: "p2" }),
    ];
    expect(distinctParticipantCount(rounds)).toBe(2);
  });
});
