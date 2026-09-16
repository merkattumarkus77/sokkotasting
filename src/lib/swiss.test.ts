import { describe, expect, it } from "vitest";
import {
  computeNextSeedingStep,
  pairFirstSeedingRound,
  pairKey,
  pairSecondSeedingRound,
  pairSubsequentSeedingRound,
  resolveSeedOrder,
  type ItemPair,
  type SwissSeedingState,
} from "@/lib/swiss";

function itemIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `item-${i}`);
}

function coveredItems(pairs: ItemPair[], byeItemId: string | null): Set<string> {
  const set = new Set<string>();
  for (const pair of pairs) {
    set.add(pair.itemAId);
    set.add(pair.itemBId);
  }
  if (byeItemId) set.add(byeItemId);
  return set;
}

describe("pairFirstSeedingRound", () => {
  for (const n of [8, 9, 15, 16, 33]) {
    it(`N=${n}: pairs floor(N/2) matches and covers every item exactly once`, () => {
      const ids = itemIds(n);
      const { pairs, byeItemId } = pairFirstSeedingRound(ids, `seed-${n}`);

      expect(pairs.length).toBe(Math.floor(n / 2));

      const covered = coveredItems(pairs, byeItemId);
      expect(covered.size).toBe(n);
      expect([...covered].sort()).toEqual([...ids].sort());
    });

    it(`N=${n}: exactly one bye iff N is odd`, () => {
      const { byeItemId } = pairFirstSeedingRound(itemIds(n), `seed-${n}`);
      if (n % 2 === 1) {
        expect(byeItemId).not.toBeNull();
      } else {
        expect(byeItemId).toBeNull();
      }
    });

    it(`N=${n}: never pairs an item with itself`, () => {
      const { pairs } = pairFirstSeedingRound(itemIds(n), `seed-${n}`);
      for (const pair of pairs) {
        expect(pair.itemAId).not.toBe(pair.itemBId);
      }
    });
  }

  it("same seed produces the same pairing", () => {
    const ids = itemIds(16);
    const a = pairFirstSeedingRound(ids, "sama");
    const b = pairFirstSeedingRound(ids, "sama");
    expect(a).toEqual(b);
  });
});

describe("pairSecondSeedingRound", () => {
  it("folds winners against winners and losers against losers (SPEC 6.2 example: 50v26, 24v0)", () => {
    const cumulativePoints = { a: 50, b: 26, c: 24, d: 0 };
    const { pairs, byeItemId } = pairSecondSeedingRound(cumulativePoints, new Set(), "seed");

    expect(byeItemId).toBeNull();
    expect(pairs).toHaveLength(2);
    const keys = pairs.map((p) => pairKey(p.itemAId, p.itemBId)).sort();
    expect(keys).toEqual([pairKey("a", "b"), pairKey("c", "d")]);
  });

  it("sends the bye recipient (exactly 25) to the winner basket", () => {
    // a=25 (bye credit), b=40 (real winner) -> winner basket {a,b}; c=10 loser, alone.
    const cumulativePoints = { a: 25, b: 40, c: 10 };
    const { pairs, byeItemId } = pairSecondSeedingRound(cumulativePoints, new Set(), "seed");

    expect(pairs).toHaveLength(1);
    expect(pairKey(pairs[0]!.itemAId, pairs[0]!.itemBId)).toBe(pairKey("a", "b"));
    expect(byeItemId).toBe("c");
  });

  it("never repeats a pair already in metPairs", () => {
    const cumulativePoints = { a: 50, b: 26, c: 24, d: 0 };
    const met = new Set([pairKey("a", "b")]);
    const { pairs } = pairSecondSeedingRound(cumulativePoints, met, "seed");
    const keys = pairs.map((p) => pairKey(p.itemAId, p.itemBId));
    expect(keys).not.toContain(pairKey("a", "b"));
  });
});

describe("pairSubsequentSeedingRound", () => {
  it("groups by identical cumulativePoints and never repeats a metPair", () => {
    const cumulativePoints = { a: 100, b: 100, c: 100, d: 100 };
    const met = new Set([pairKey("a", "b"), pairKey("c", "d")]);
    const { pairs } = pairSubsequentSeedingRound(cumulativePoints, met, "seed", 3);
    const keys = pairs.map((p) => pairKey(p.itemAId, p.itemBId));
    for (const key of keys) {
      expect(met.has(key)).toBe(false);
    }
  });

  it("does not crash and returns a bye when a group is fully exhausted", () => {
    // Only two items left tied, and they've already played each other.
    const cumulativePoints = { a: 100, b: 100 };
    const met = new Set([pairKey("a", "b")]);
    const result = pairSubsequentSeedingRound(cumulativePoints, met, "seed", 5);
    expect(result.pairs).toHaveLength(0);
    expect(result.byeItemId).not.toBeNull();
  });
});

describe("resolveSeedOrder", () => {
  it("is always a full permutation of itemIds", () => {
    const ids = itemIds(9);
    const cumulativePoints = Object.fromEntries(ids.map((id, i) => [id, i % 3]));
    const seedOrder = resolveSeedOrder({
      itemIds: ids,
      cumulativePoints,
      tastedPoints: {},
      headToHeadWinners: new Map(),
      rngSeed: "seed",
    });
    expect(seedOrder).toHaveLength(ids.length);
    expect(new Set(seedOrder).size).toBe(ids.length);
    expect([...seedOrder].sort()).toEqual([...ids].sort());
  });

  it("breaks ties with head-to-head result before tastedPoints or rng", () => {
    const seedOrder = resolveSeedOrder({
      itemIds: ["a", "b"],
      cumulativePoints: { a: 50, b: 50 },
      tastedPoints: { a: 0, b: 1000 }, // would favor b if head-to-head didn't decide first
      headToHeadWinners: new Map([[pairKey("a", "b"), "a"]]),
      rngSeed: "seed",
    });
    expect(seedOrder).toEqual(["a", "b"]);
  });

  it("falls back to tastedPoints when there is no head-to-head result", () => {
    const seedOrder = resolveSeedOrder({
      itemIds: ["a", "b"],
      cumulativePoints: { a: 50, b: 50 },
      tastedPoints: { a: 10, b: 20 },
      headToHeadWinners: new Map(),
      rngSeed: "seed",
    });
    expect(seedOrder).toEqual(["b", "a"]);
  });
});

describe("computeNextSeedingStep — termination with identical evaluations", () => {
  for (const n of [8, 9, 16]) {
    it(`N=${n}: reaches needsCutoff within maxSeedingRounds even when every match is decided identically`, () => {
      const ids = itemIds(n);
      const seedingRounds = 2;
      const maxSeedingRounds = seedingRounds + 4;

      let state: SwissSeedingState = {
        itemIds: ids,
        cumulativePoints: {},
        metPairs: [],
        seedingRoundNumber: 1,
        rngSeed: `identical-${n}`,
      };

      let iterations = 0;
      let cutoffReached = false;

      while (iterations <= maxSeedingRounds + 1) {
        const step = computeNextSeedingStep(state, maxSeedingRounds);
        iterations++;

        if (step.kind === "needsCutoff") {
          cutoffReached = true;
          break;
        }

        // Simulate "identical evaluations": itemAId always wins every match
        // with the same score, exactly like a participant always submitting
        // the same scoreA regardless of what's being compared.
        const cumulativePoints = { ...state.cumulativePoints };
        const metPairs = [...state.metPairs];
        for (const pair of step.pairs) {
          cumulativePoints[pair.itemAId] = (cumulativePoints[pair.itemAId] ?? 0) + 30;
          cumulativePoints[pair.itemBId] = (cumulativePoints[pair.itemBId] ?? 0) + 20;
          metPairs.push(pairKey(pair.itemAId, pair.itemBId));
        }
        if (step.byeItemId) {
          cumulativePoints[step.byeItemId] = (cumulativePoints[step.byeItemId] ?? 0) + 25;
        }

        state = {
          ...state,
          cumulativePoints,
          metPairs,
          seedingRoundNumber: step.seedingRoundNumber + 1,
        };
      }

      expect(cutoffReached).toBe(true);
      expect(iterations).toBeLessThanOrEqual(maxSeedingRounds + 1);

      const seedOrder = resolveSeedOrder({
        itemIds: ids,
        cumulativePoints: state.cumulativePoints,
        tastedPoints: {},
        headToHeadWinners: new Map(),
        rngSeed: state.rngSeed,
      });
      expect(seedOrder).toHaveLength(n);
      expect(new Set(seedOrder).size).toBe(n);
    });
  }
});
