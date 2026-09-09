import { createRng } from "@/lib/prng";
import { pairKey } from "@/lib/swiss";
import type { BracketNode, BracketRoundName } from "@/lib/types";

/** SPEC 6.2 Vaihe B: B = 2^ceil(log2(N)). */
export function bracketSize(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

/**
 * Tennis (fold) seeding, recursive: seedPositions(2) = [1,2]; for larger
 * sizes each seed s from the previous half is followed by size+1-s, so the
 * two best seeds always land in different halves and can only meet in the
 * final. Returns seed numbers (1-based) in bracket slot order.
 */
export function seedPositions(size: number): number[] {
  if (size === 1) return [1];
  if (size === 2) return [1, 2];
  const prev = seedPositions(size / 2);
  const result: number[] = [];
  for (const s of prev) {
    result.push(s, size + 1 - s);
  }
  return result;
}

function roundNameForMatchCount(matchCount: number): BracketRoundName {
  switch (matchCount) {
    case 32:
      return "R64";
    case 16:
      return "R32";
    case 8:
      return "R16";
    case 4:
      return "QF";
    case 2:
      return "SF";
    case 1:
      return "FINAL";
    default:
      throw new Error(`Unexpected bracket match count: ${matchCount}`);
  }
}

/**
 * SPEC 6.2 Vaihe B: builds the full knockout bracket from a seedOrder
 * (item ids ranked 1..N, index 0 = seed 1). Byes (B-N of them) go to the
 * best seeds 1..(B-N) and are resolved immediately (isBye: true, winner set,
 * no RoundDoc needed for them) — only round 1 can ever contain a bye, since
 * every later round's slots are always filled by two real contestants once
 * both are known.
 */
export function buildBracket(seedOrder: string[], hasBronzeMatch: boolean): BracketNode[] {
  const n = seedOrder.length;
  const size = bracketSize(n);
  const positions = seedPositions(size);

  const nodes: BracketNode[] = [];
  const roundsMatchIds: string[][] = [];

  let matchCount = size / 2;
  let roundIndex = 0;
  let slotsForThisRound: (string | null)[] = positions.map((seed) =>
    seed <= n ? seedOrder[seed - 1]! : null
  );

  while (matchCount >= 1) {
    const roundName = roundNameForMatchCount(matchCount);
    const roundMatchIds: string[] = [];
    const winnersOut: (string | null)[] = [];

    for (let i = 0; i < matchCount; i++) {
      const slotA = slotsForThisRound[i * 2] ?? null;
      const slotB = slotsForThisRound[i * 2 + 1] ?? null;
      // Only round 1 (index 0) can have a genuine bye — a missing slot in
      // any later round just means "not decided yet", not "no opponent".
      const isBye = roundIndex === 0 && (slotA === null || slotB === null);
      const winner = isBye ? (slotA ?? slotB) : null;
      const matchId = `${roundName}-${i + 1}`;

      nodes.push({
        matchId,
        roundName,
        slotA,
        slotB,
        winner,
        loser: null,
        isBye,
        nextMatchId: null,
        nextSlot: null,
      });
      roundMatchIds.push(matchId);
      winnersOut.push(winner);
    }

    roundsMatchIds.push(roundMatchIds);
    slotsForThisRound = winnersOut;
    roundIndex++;
    if (matchCount === 1) break;
    matchCount = matchCount / 2;
  }

  for (let r = 0; r < roundsMatchIds.length - 1; r++) {
    const round = roundsMatchIds[r]!;
    const nextRound = roundsMatchIds[r + 1]!;
    for (let i = 0; i < round.length; i++) {
      const node = nodes.find((candidate) => candidate.matchId === round[i])!;
      node.nextMatchId = nextRound[Math.floor(i / 2)]!;
      node.nextSlot = i % 2 === 0 ? "A" : "B";
    }
  }

  if (hasBronzeMatch && roundsMatchIds.some((round) => round[0]?.startsWith("SF-"))) {
    nodes.push({
      matchId: "BRONZE-1",
      roundName: "BRONZE",
      slotA: null,
      slotB: null,
      winner: null,
      loser: null,
      isBye: false,
      nextMatchId: null,
      nextSlot: null,
    });
  }

  return nodes;
}

/**
 * Records a match's result: sets winner/loser, advances the winner into its
 * nextMatchId/nextSlot, and — for semifinals when hasBronzeMatch is on —
 * places the loser into the bronze match. Returns a new array (pure).
 */
export function advanceBracket(
  nodes: readonly BracketNode[],
  matchId: string,
  winnerId: string,
  loserId: string
): BracketNode[] {
  const updated = nodes.map((node) => ({ ...node }));
  const match = updated.find((node) => node.matchId === matchId);
  if (!match) throw new Error(`Unknown bracket matchId: ${matchId}`);

  match.winner = winnerId;
  match.loser = loserId;

  if (match.nextMatchId) {
    const next = updated.find((node) => node.matchId === match.nextMatchId)!;
    if (match.nextSlot === "A") next.slotA = winnerId;
    else next.slotB = winnerId;
  }

  if (match.roundName === "SF") {
    const bronze = updated.find((node) => node.matchId === "BRONZE-1");
    if (bronze) {
      if (match.matchId === "SF-1") bronze.slotA = loserId;
      else bronze.slotB = loserId;
    }
  }

  return updated;
}

const ROUND_RANK: Record<BracketRoundName, number> = {
  FINAL: 6,
  SF: 5,
  QF: 4,
  R16: 3,
  R32: 2,
  R64: 1,
  BRONZE: 0,
};

/**
 * SPEC 6.2 Vaihe C: full 1..N ranking. Places 1-4 explicitly (final +
 * bronze/SF-loser-points), then groups everyone else by the round they were
 * eliminated in (later elimination ranks better), breaking ties by
 * cumulativePoints -> head-to-head -> rngSeed. Always a full permutation.
 */
export function computeFinalRanking(
  nodes: readonly BracketNode[],
  cumulativePoints: Readonly<Record<string, number>>,
  headToHeadWinners: ReadonlyMap<string, string>,
  rngSeed: string
): string[] {
  const final = nodes.find((node) => node.roundName === "FINAL");
  if (!final?.winner || !final.loser) {
    throw new Error("computeFinalRanking called before the final was decided");
  }
  const champion = final.winner;
  const runnerUp = final.loser;

  const bronze = nodes.find((node) => node.roundName === "BRONZE");
  let third: string;
  let fourth: string;

  if (bronze?.winner && bronze.loser) {
    third = bronze.winner;
    fourth = bronze.loser;
  } else {
    const sfLosers = nodes
      .filter((node) => node.roundName === "SF" && node.loser)
      .map((node) => node.loser!)
      .sort((a, b) => (cumulativePoints[b] ?? 0) - (cumulativePoints[a] ?? 0));
    third = sfLosers[0]!;
    fourth = sfLosers[1]!;
  }

  const placed = [champion, runnerUp, third, fourth];
  const placedSet = new Set(placed);

  const eliminationRound = new Map<string, number>();
  for (const node of nodes) {
    if (node.roundName === "BRONZE") continue;
    if (node.loser && !placedSet.has(node.loser)) {
      eliminationRound.set(node.loser, ROUND_RANK[node.roundName]);
    }
  }

  const remaining = [...eliminationRound.keys()];
  const tieBreakRandom = createRng(`${rngSeed}:finalranking`);
  const randomKey = new Map(remaining.map((id) => [id, tieBreakRandom()]));

  remaining.sort((a, b) => {
    const roundDiff = eliminationRound.get(b)! - eliminationRound.get(a)!;
    if (roundDiff !== 0) return roundDiff;

    const pointsDiff = (cumulativePoints[b] ?? 0) - (cumulativePoints[a] ?? 0);
    if (pointsDiff !== 0) return pointsDiff;

    const headToHead = headToHeadWinners.get(pairKey(a, b));
    if (headToHead === a) return -1;
    if (headToHead === b) return 1;

    return randomKey.get(a)! - randomKey.get(b)!;
  });

  return [...placed, ...remaining];
}
