import { createRng } from "@/lib/prng";

export interface ItemPair {
  itemAId: string;
  itemBId: string;
}

export interface SeedingRoundResult {
  pairs: ItemPair[];
  byeItemId: string | null;
}

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
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
 * Greedily pairs every item in `pool` (already ordered best-to-worst for
 * fold preference) while never repeating a pair from `metPairs`. Prefers the
 * standard fold target (best-with-worst) and searches outward from there
 * when that target is forbidden. At most one item is left over (SPEC 6.2
 * rule 4: an unresolved tie group is acceptable — this never throws).
 */
function foldMatchAvoidingMet(
  pool: string[],
  metPairs: ReadonlySet<string>
): { pairs: ItemPair[]; leftover: string[] } {
  const remaining = [...pool];
  const pairs: ItemPair[] = [];
  let stuckStreak = 0;

  while (remaining.length > 1 && stuckStreak < remaining.length) {
    const a = remaining[0]!;
    // Prefer the current fold target (last remaining item), then search
    // inward from the end for the first non-conflicting partner.
    let partnerIndex = -1;
    for (let i = remaining.length - 1; i >= 1; i--) {
      if (!metPairs.has(pairKey(a, remaining[i]!))) {
        partnerIndex = i;
        break;
      }
    }
    if (partnerIndex === -1) {
      // `a` cannot be paired with anyone left in this pool right now;
      // rotate it to the back and let the next item lead. If we cycle the
      // whole current pool once without a single successful pairing, stop —
      // whatever remains is a genuinely unresolved leftover (SPEC 6.2 rule 4).
      remaining.shift();
      remaining.push(a);
      stuckStreak++;
      continue;
    }
    stuckStreak = 0;
    const b = remaining[partnerIndex]!;
    pairs.push({ itemAId: a, itemBId: b });
    remaining.splice(partnerIndex, 1);
    remaining.shift(); // `a` is still at index 0 (partnerIndex was >= 1)
  }

  return { pairs, leftover: remaining };
}

/** SPEC 6.2 Vaihe A, kierros 1: shuffle, pair adjacent, odd one out gets the bye. */
export function pairFirstSeedingRound(itemIds: string[], rngSeed: string): SeedingRoundResult {
  const random = createRng(`${rngSeed}:seed:1`);
  const shuffled = shuffle(itemIds, random);

  let byeItemId: string | null = null;
  const pool = [...shuffled];
  if (pool.length % 2 === 1) {
    byeItemId = pool.pop()!;
  }

  const pairs: ItemPair[] = [];
  for (let i = 0; i < pool.length; i += 2) {
    pairs.push({ itemAId: pool[i]!, itemBId: pool[i + 1]! });
  }

  return { pairs, byeItemId };
}

interface GroupedPairingInput {
  /** Groups ordered from best (highest points) to worst. Each group's items
   * are already ordered best-to-worst within the group. */
  groups: string[][];
  metPairs: ReadonlySet<string>;
  rngSeed: string;
}

/**
 * Shared engine for SPEC 6.2 kierros 2 (two point baskets) and kierrokset 3+
 * (exact-value tie groups): processes groups best-to-worst, fold-pairs within
 * each group while avoiding metPairs, and carries an odd leftover down into
 * the next (nearest-by-points) group. A final leftover becomes the bye.
 */
function pairGroups({ groups, metPairs, rngSeed }: GroupedPairingInput): SeedingRoundResult {
  const pairs: ItemPair[] = [];
  let carried: string[] = [];

  for (const group of groups) {
    const pool = [...carried, ...group];
    carried = [];
    const { pairs: groupPairs, leftover } = foldMatchAvoidingMet(pool, metPairs);
    pairs.push(...groupPairs);
    carried = leftover;
  }

  let byeItemId: string | null = null;
  if (carried.length === 1) {
    byeItemId = carried[0]!;
  } else if (carried.length > 1) {
    // Everyone left has already met everyone else left — SPEC 6.2 rule 4:
    // leave them unresolved this round rather than force an invalid pair.
    // A deterministic pick keeps the bye reproducible instead of arbitrary.
    const random = createRng(`${rngSeed}:leftover:${carried.join(",")}`);
    byeItemId = carried[Math.floor(random() * carried.length)]!;
  }

  return { pairs, byeItemId };
}

/**
 * SPEC 6.2 kierros 2: split into winners (cumulativePoints > 25, including
 * the bye recipient at exactly 25) and losers (< 25), sort each basket
 * descending, fold-pair best-vs-worst within each basket.
 */
export function pairSecondSeedingRound(
  cumulativePoints: Readonly<Record<string, number>>,
  metPairs: ReadonlySet<string>,
  rngSeed: string
): SeedingRoundResult {
  const items = Object.keys(cumulativePoints);
  const winners = items
    .filter((id) => cumulativePoints[id]! >= 25)
    .sort((a, b) => cumulativePoints[b]! - cumulativePoints[a]!);
  const losers = items
    .filter((id) => cumulativePoints[id]! < 25)
    .sort((a, b) => cumulativePoints[b]! - cumulativePoints[a]!);

  return pairGroups({ groups: [winners, losers], metPairs, rngSeed });
}

/**
 * SPEC 6.2 kierrokset 3+: group by identical cumulativePoints (highest
 * first), fold-pair within each tie group avoiding metPairs, carrying an
 * odd leftover to the next (nearest lower) group.
 */
export function pairSubsequentSeedingRound(
  cumulativePoints: Readonly<Record<string, number>>,
  metPairs: ReadonlySet<string>,
  rngSeed: string,
  roundNumber: number
): SeedingRoundResult {
  const items = Object.keys(cumulativePoints);
  // Deterministic within-tie-group order: no other signal separates items
  // with identical cumulativePoints, so use a round-specific seeded shuffle
  // rather than always falling back to array/insertion order.
  const random = createRng(`${rngSeed}:seed:${roundNumber}`);
  const shuffled = shuffle(items, random);

  const byPoints = new Map<number, string[]>();
  for (const id of shuffled) {
    const points = cumulativePoints[id]!;
    const group = byPoints.get(points);
    if (group) group.push(id);
    else byPoints.set(points, [id]);
  }

  const groups = [...byPoints.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, group]) => group);

  return pairGroups({ groups, metPairs, rngSeed });
}

export interface SeedTieBreakContext {
  itemIds: string[];
  cumulativePoints: Readonly<Record<string, number>>;
  tastedPoints: Readonly<Record<string, number>>;
  /** itemA|itemB (sorted) -> winning item id, for matches actually played. */
  headToHeadWinners: ReadonlyMap<string, string>;
  rngSeed: string;
}

/**
 * SPEC 6.2 katkaisu: resolves the final seedOrder once the seeding stage
 * ends (either maxSeedingRounds reached or no further pairing is possible).
 * Ties broken by: head-to-head result -> tastedPoints total -> deterministic
 * rngSeed-based order. Always returns a full permutation of itemIds.
 */
export function resolveSeedOrder(context: SeedTieBreakContext): string[] {
  const { itemIds, cumulativePoints, tastedPoints, headToHeadWinners, rngSeed } = context;
  const tieBreakRandom = createRng(`${rngSeed}:tiebreak`);
  const randomKey = new Map(itemIds.map((id) => [id, tieBreakRandom()]));

  function compare(a: string, b: string): number {
    const pointsDiff = (cumulativePoints[b] ?? 0) - (cumulativePoints[a] ?? 0);
    if (pointsDiff !== 0) return pointsDiff;

    const headToHead = headToHeadWinners.get(pairKey(a, b));
    if (headToHead === a) return -1;
    if (headToHead === b) return 1;

    const tastedDiff = (tastedPoints[b] ?? 0) - (tastedPoints[a] ?? 0);
    if (tastedDiff !== 0) return tastedDiff;

    return randomKey.get(a)! - randomKey.get(b)!;
  }

  return [...itemIds].sort(compare);
}

export interface SwissSeedingState {
  itemIds: string[];
  cumulativePoints: Readonly<Record<string, number>>;
  metPairs: readonly string[]; // pairKey format ("a|b")
  /** The round about to be computed (1-based). */
  seedingRoundNumber: number;
  rngSeed: string;
}

export type SwissSeedingStep =
  | { kind: "round"; seedingRoundNumber: number; pairs: ItemPair[]; byeItemId: string | null }
  | { kind: "needsCutoff" };

/**
 * SPEC 6.2 Vaihe A dispatcher: picks round 1 / round 2 / round 3+ pairing.
 * Signals `needsCutoff` once maxSeedingRounds is exceeded, or — defensively
 * — earlier, if a round would produce literally nothing (SPEC's own rules
 * mean an unresolved tie group still yields a bye, so this should not
 * normally trigger, but it guarantees termination regardless of that
 * reasoning holding in every edge case). Does not resolve the cutoff itself
 * — that needs head-to-head data from Firestore, which the caller fetches
 * only when actually needed and passes to resolveSeedOrder() directly.
 */
export function computeNextSeedingStep(
  state: SwissSeedingState,
  maxSeedingRounds: number
): SwissSeedingStep {
  const metPairsSet = new Set(state.metPairs);
  let roundNumber = state.seedingRoundNumber;

  while (roundNumber <= maxSeedingRounds) {
    const result =
      roundNumber === 1
        ? pairFirstSeedingRound(state.itemIds, state.rngSeed)
        : roundNumber === 2
          ? pairSecondSeedingRound(state.cumulativePoints, metPairsSet, state.rngSeed)
          : pairSubsequentSeedingRound(state.cumulativePoints, metPairsSet, state.rngSeed, roundNumber);

    if (result.pairs.length > 0 || result.byeItemId !== null) {
      return {
        kind: "round",
        seedingRoundNumber: roundNumber,
        pairs: result.pairs,
        byeItemId: result.byeItemId,
      };
    }
    roundNumber++;
  }

  return { kind: "needsCutoff" };
}
