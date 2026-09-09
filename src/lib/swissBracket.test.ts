import { describe, expect, it } from "vitest";
import {
  advanceBracket,
  bracketSize,
  buildBracket,
  computeFinalRanking,
  seedPositions,
} from "@/lib/swissBracket";
import type { BracketNode } from "@/lib/types";

function itemIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `seed-${i + 1}`); // seed-1 = best seed
}

describe("bracketSize", () => {
  it("is the smallest power of two >= N", () => {
    expect(bracketSize(8)).toBe(8);
    expect(bracketSize(9)).toBe(16);
    expect(bracketSize(16)).toBe(16);
    expect(bracketSize(17)).toBe(32);
    expect(bracketSize(33)).toBe(64);
    expect(bracketSize(64)).toBe(64);
  });
});

describe("seedPositions", () => {
  it("matches the known canonical tennis seeding for size 4 and 8", () => {
    expect(seedPositions(4)).toEqual([1, 4, 2, 3]);
    expect(seedPositions(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("is a permutation of 1..size", () => {
    for (const size of [8, 16, 32, 64]) {
      const positions = seedPositions(size);
      expect([...positions].sort((a, b) => a - b)).toEqual(
        Array.from({ length: size }, (_, i) => i + 1)
      );
    }
  });
});

describe("buildBracket byes", () => {
  for (const n of [8, 9, 15, 16, 33, 64]) {
    it(`N=${n}: bye count is exactly B-N, all going to seeds 1..(B-N)`, () => {
      const seedOrder = itemIds(n);
      const size = bracketSize(n);
      const nodes = buildBracket(seedOrder, false);
      const byeNodes = nodes.filter((node) => node.isBye);
      expect(byeNodes.length).toBe(size - n);

      const byeWinners = byeNodes.map((node) => node.winner).sort();
      const expectedBestSeeds = seedOrder.slice(0, size - n).sort();
      expect(byeWinners).toEqual(expectedBestSeeds);
    });
  }
});

/** Plays every decidable match (both slots known) as "lower index = better seed wins", repeatedly, until nothing more can progress. */
function simulateByBestSeed(nodes: BracketNode[], seedOrder: string[]) {
  const seedIndex = new Map(seedOrder.map((id, i) => [id, i]));
  const meetings: [string, string, string][] = []; // [matchId, a, b]
  let current = nodes;
  let progressed = true;

  while (progressed) {
    progressed = false;
    for (const node of current) {
      if (node.winner) continue;
      if (node.slotA && node.slotB) {
        const winner = seedIndex.get(node.slotA)! < seedIndex.get(node.slotB)! ? node.slotA : node.slotB;
        const loser = winner === node.slotA ? node.slotB : node.slotA;
        meetings.push([node.matchId, node.slotA, node.slotB]);
        current = advanceBracket(current, node.matchId, winner, loser);
        progressed = true;
      }
    }
  }

  return { nodes: current, meetings };
}

describe("top two seeds meet no earlier than the final", () => {
  for (let n = 8; n <= 64; n++) {
    it(`N=${n}`, () => {
      const seedOrder = itemIds(n);
      const built = buildBracket(seedOrder, false);
      const { meetings } = simulateByBestSeed(built, seedOrder);

      const earlyMeeting = meetings.find(
        ([matchId, a, b]) =>
          !matchId.startsWith("FINAL") &&
          new Set([a, b]).has(seedOrder[0]!) &&
          new Set([a, b]).has(seedOrder[1]!)
      );
      expect(earlyMeeting).toBeUndefined();
    });
  }
});

describe("computeFinalRanking", () => {
  it("is a full permutation of length N, no duplicates", () => {
    const seedOrder = itemIds(16);
    const built = buildBracket(seedOrder, false);
    const { nodes } = simulateByBestSeed(built, seedOrder);

    const ranking = computeFinalRanking(nodes, {}, new Map(), "seed");
    expect(ranking).toHaveLength(16);
    expect(new Set(ranking).size).toBe(16);
    expect([...ranking].sort()).toEqual([...seedOrder].sort());
    expect(ranking[0]).toBe(seedOrder[0]); // best seed wins every match here
  });

  it("without bronze, 3rd/4th come from SF losers ranked by cumulativePoints", () => {
    const seedOrder = itemIds(8);
    const built = buildBracket(seedOrder, false);
    const { nodes } = simulateByBestSeed(built, seedOrder);

    const sfLosers = nodes.filter((n) => n.roundName === "SF").map((n) => n.loser!);
    const cumulativePoints = { [sfLosers[0]!]: 10, [sfLosers[1]!]: 999 };
    const ranking = computeFinalRanking(nodes, cumulativePoints, new Map(), "seed");
    expect(ranking[2]).toBe(sfLosers[1]);
    expect(ranking[3]).toBe(sfLosers[0]);
  });

  it("with bronze, 3rd/4th come from the bronze match result, not cumulativePoints", () => {
    const seedOrder = itemIds(8);
    const built = buildBracket(seedOrder, true);
    const { nodes } = simulateByBestSeed(built, seedOrder);

    const bronze = nodes.find((n) => n.roundName === "BRONZE")!;
    expect(bronze.winner).toBeTruthy();

    // Weight cumulativePoints to favor the bronze LOSER — the bronze result
    // must still win regardless, since the match was actually played.
    const cumulativePoints = { [bronze.winner!]: 0, [bronze.loser!]: 999 };
    const ranking = computeFinalRanking(nodes, cumulativePoints, new Map(), "seed");
    expect(ranking[2]).toBe(bronze.winner);
    expect(ranking[3]).toBe(bronze.loser);
  });

  it("throws if called before the final is decided", () => {
    const seedOrder = itemIds(8);
    const built = buildBracket(seedOrder, false);
    expect(() => computeFinalRanking(built, {}, new Map(), "seed")).toThrow();
  });
});
