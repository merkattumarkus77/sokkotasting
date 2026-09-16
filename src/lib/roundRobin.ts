import { createRng } from "@/lib/prng";

export interface ItemPair {
  itemAId: string;
  itemBId: string;
}

/** All pairs (i < j) for N items, e.g. 4 items -> 6 pairs. */
export function pairsPerParticipantCount(itemCount: number): number {
  return (itemCount * (itemCount - 1)) / 2;
}

function allTheoreticalPairs(itemIds: string[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < itemIds.length; i++) {
    for (let j = i + 1; j < itemIds.length; j++) {
      pairs.push([itemIds[i]!, itemIds[j]!]);
    }
  }
  return pairs;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Checks that every unordered pair of item ids appears exactly once in the
 * pair list (the A/B order within a pair does not matter for this check).
 */
export function validateItemPairs(pairs: ItemPair[], itemIds: string[]): boolean {
  const expected = allTheoreticalPairs(itemIds);
  if (pairs.length !== expected.length) return false;

  const seen = new Set<string>();
  for (const pair of pairs) {
    if (pair.itemAId === pair.itemBId) return false;
    const key = [pair.itemAId, pair.itemBId].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
  }

  return expected.every(([a, b]) => seen.has([a, b].sort().join("|")));
}

const MAX_GENERATION_ATTEMPTS = 50;

/**
 * Draws every possible item pair for one participant in random order, with a
 * random A/B split within each pair. Validates the result and redraws if any
 * pair is missing or duplicated.
 *
 * `seed` makes the draw deterministic (SPEC 6.1: the same seed produces the
 * same order) — the only way to test the draw reliably and the only way to
 * reproduce it later from a stored rngSeed.
 */
export function generateRoundRobinPairs(itemIds: string[], seed: string): ItemPair[] {
  if (itemIds.length < 2) {
    throw new Error("Round Robin requires at least two items.");
  }

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const random = createRng(`${seed}:${attempt}`);
    const orderedPairs = shuffle(allTheoreticalPairs(itemIds), random);
    const pairs: ItemPair[] = orderedPairs.map(([a, b]) => {
      const swap = random() < 0.5;
      return { itemAId: swap ? b : a, itemBId: swap ? a : b };
    });

    if (validateItemPairs(pairs, itemIds)) {
      return pairs;
    }
  }

  throw new Error("Round Robin draw repeatedly failed validation. Try again.");
}
