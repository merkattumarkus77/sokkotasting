import { describe, expect, it } from "vitest";
import {
  generateRoundRobinPairs,
  pairsPerParticipantCount,
  validateItemPairs,
} from "@/lib/roundRobin";

function itemIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `item-${i}`);
}

describe("pairsPerParticipantCount", () => {
  it("returns N(N-1)/2", () => {
    expect(pairsPerParticipantCount(3)).toBe(3);
    expect(pairsPerParticipantCount(4)).toBe(6);
    expect(pairsPerParticipantCount(12)).toBe(66);
  });
});

describe("generateRoundRobinPairs", () => {
  for (let n = 3; n <= 12; n++) {
    it(`N=${n}: produces exactly N(N-1)/2 pairs`, () => {
      const pairs = generateRoundRobinPairs(itemIds(n), `seed-${n}`);
      expect(pairs.length).toBe(pairsPerParticipantCount(n));
    });

    it(`N=${n}: every unordered pair appears exactly once`, () => {
      const ids = itemIds(n);
      const pairs = generateRoundRobinPairs(ids, `seed-${n}`);
      expect(validateItemPairs(pairs, ids)).toBe(true);
    });

    it(`N=${n}: never pairs an item with itself`, () => {
      const pairs = generateRoundRobinPairs(itemIds(n), `seed-${n}`);
      for (const pair of pairs) {
        expect(pair.itemAId).not.toBe(pair.itemBId);
      }
    });
  }

  it("same seed produces the same order", () => {
    const ids = itemIds(8);
    const a = generateRoundRobinPairs(ids, "sama-siemen");
    const b = generateRoundRobinPairs(ids, "sama-siemen");
    expect(a).toEqual(b);
  });

  it("different seeds produce a different order", () => {
    const ids = itemIds(8);
    const a = generateRoundRobinPairs(ids, "siemen-a");
    const b = generateRoundRobinPairs(ids, "siemen-b");
    expect(a).not.toEqual(b);
  });

  it("rejects fewer than two items", () => {
    expect(() => generateRoundRobinPairs(itemIds(1), "seed")).toThrow();
  });
});

describe("validateItemPairs", () => {
  const ids = itemIds(4);

  it("rejects a missing pair", () => {
    const pairs = generateRoundRobinPairs(ids, "seed").slice(0, -1);
    expect(validateItemPairs(pairs, ids)).toBe(false);
  });

  it("rejects a duplicated pair", () => {
    const pairs = generateRoundRobinPairs(ids, "seed");
    const withDuplicate = [...pairs.slice(0, -1), pairs[0]!];
    expect(validateItemPairs(withDuplicate, ids)).toBe(false);
  });

  it("rejects a self-paired item", () => {
    const pairs = generateRoundRobinPairs(ids, "seed");
    const broken = [...pairs.slice(0, -1), { itemAId: pairs[0]!.itemAId, itemBId: pairs[0]!.itemAId }];
    expect(validateItemPairs(broken, ids)).toBe(false);
  });
});
