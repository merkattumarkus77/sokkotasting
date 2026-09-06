import { describe, expect, it } from "vitest";
import {
  generateParticipantRounds,
  pairsPerParticipantCount,
  validateRounds,
} from "@/lib/roundRobin";

describe("pairsPerParticipantCount", () => {
  it("returns N(N-1)/2", () => {
    expect(pairsPerParticipantCount(3)).toBe(3);
    expect(pairsPerParticipantCount(4)).toBe(6);
    expect(pairsPerParticipantCount(12)).toBe(66);
  });
});

describe("generateParticipantRounds", () => {
  for (let n = 3; n <= 12; n++) {
    it(`N=${n}: produces exactly N(N-1)/2 rounds`, () => {
      const rounds = generateParticipantRounds(n, `seed-${n}`);
      expect(rounds.length).toBe(pairsPerParticipantCount(n));
    });

    it(`N=${n}: every unordered pair appears exactly once`, () => {
      const rounds = generateParticipantRounds(n, `seed-${n}`);
      expect(validateRounds(rounds, n)).toBe(true);
    });

    it(`N=${n}: never pairs an item with itself`, () => {
      const rounds = generateParticipantRounds(n, `seed-${n}`);
      for (const round of rounds) {
        expect(round.productAIndex).not.toBe(round.productBIndex);
      }
    });
  }

  it("same seed produces the same order", () => {
    const a = generateParticipantRounds(8, "sama-siemen");
    const b = generateParticipantRounds(8, "sama-siemen");
    expect(a).toEqual(b);
  });

  it("different seeds produce a different order", () => {
    const a = generateParticipantRounds(8, "siemen-a");
    const b = generateParticipantRounds(8, "siemen-b");
    expect(a).not.toEqual(b);
  });

  it("rejects fewer than two products", () => {
    expect(() => generateParticipantRounds(1, "seed")).toThrow();
  });
});

describe("validateRounds", () => {
  it("rejects a missing pair", () => {
    const rounds = generateParticipantRounds(4, "seed").slice(0, -1);
    expect(validateRounds(rounds, 4)).toBe(false);
  });

  it("rejects a duplicated pair", () => {
    const rounds = generateParticipantRounds(4, "seed");
    const withDuplicate = [...rounds.slice(0, -1), rounds[0]!];
    expect(validateRounds(withDuplicate, 4)).toBe(false);
  });

  it("rejects a self-paired item", () => {
    const rounds = generateParticipantRounds(4, "seed");
    const broken = [...rounds.slice(0, -1), { ...rounds[0]!, productBIndex: rounds[0]!.productAIndex }];
    expect(validateRounds(broken, 4)).toBe(false);
  });
});
