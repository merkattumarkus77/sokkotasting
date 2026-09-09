// Pure aggregation over already-fetched RoundDoc[] — no Firebase dependency,
// so it's testable without an emulator. The caller (lib/rounds.ts,
// lib/tastings.ts) does the actual Firestore query.

import type { RoundDoc } from "@/lib/types";

export interface GroupItemStats {
  itemId: string;
  tastedPoints: number;
  tastedPairs: number;
  wonPairs: number;
}

/** SPEC 7: per-item group totals from every submitted round of a tasting. */
export function aggregateGroupStats(rounds: readonly RoundDoc[]): Map<string, GroupItemStats> {
  const map = new Map<string, GroupItemStats>();

  function ensure(itemId: string): GroupItemStats {
    let entry = map.get(itemId);
    if (!entry) {
      entry = { itemId, tastedPoints: 0, tastedPairs: 0, wonPairs: 0 };
      map.set(itemId, entry);
    }
    return entry;
  }

  for (const round of rounds) {
    if (round.scoreA == null) continue;
    const scoreB = 50 - round.scoreA;

    const a = ensure(round.itemAId);
    a.tastedPoints += round.scoreA;
    a.tastedPairs += 1;
    if (round.scoreA > 25) a.wonPairs += 1;

    const b = ensure(round.itemBId);
    b.tastedPoints += scoreB;
    b.tastedPairs += 1;
    if (scoreB > 25) b.wonPairs += 1;
  }

  return map;
}

export interface GuessingTally {
  correct: number;
  attempted: number;
}

/** SPEC 8: per-participant guess tallies from every submitted round. */
export function aggregateGuessingTallies(rounds: readonly RoundDoc[]): Map<string, GuessingTally> {
  const map = new Map<string, GuessingTally>();

  function ensure(participantId: string): GuessingTally {
    let entry = map.get(participantId);
    if (!entry) {
      entry = { correct: 0, attempted: 0 };
      map.set(participantId, entry);
    }
    return entry;
  }

  for (const round of rounds) {
    const tally = ensure(round.participantId);
    if (round.guessAId != null) {
      tally.attempted += 1;
      if (round.guessACorrect) tally.correct += 1;
    }
    if (round.guessBId != null) {
      tally.attempted += 1;
      if (round.guessBCorrect) tally.correct += 1;
    }
  }

  return map;
}

/** Distinct participants who submitted at least one round — SPEC 13's "osallistujat". */
export function distinctParticipantCount(rounds: readonly RoundDoc[]): number {
  return new Set(rounds.map((r) => r.participantId)).size;
}
