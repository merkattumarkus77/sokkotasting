import "server-only";
import { getEvent } from "@/lib/events";
import { computeGuessingRanking, type GuessingRankingEntry } from "@/lib/guessing";
import { listParticipants } from "@/lib/participants";
import { aggregateGuessingTallies } from "@/lib/roundAggregation";
import { submittedRoundsQuery } from "@/lib/rounds";
import { computeGroupRanking, type GroupRankingEntry } from "@/lib/scoring";
import { getTasting, listTastings } from "@/lib/tastings";
import type { EventDoc, RoundDoc, TastingDoc } from "@/lib/types";

export interface NoteEntry {
  participantId: string;
  participantName: string;
  itemAName: string;
  itemBName: string;
  notes: string;
}

export interface ParticipantScoreEntry {
  participantId: string;
  name: string;
  scores: GroupRankingEntry[];
}

export interface TastingResults {
  tasting: TastingDoc;
  event: EventDoc;
  groupRanking: GroupRankingEntry[];
  guessingRanking: GuessingRankingEntry[];
  participantScores: ParticipantScoreEntry[];
  notes: NoteEntry[];
}

/**
 * SPEC 7/8/12: full results for one tasting — real item names throughout,
 * since gating on SPEC 11.3 (participants only after 'completed') is the
 * caller's job (the Route Handler), not this function's.
 */
export async function computeTastingResults(
  eventId: string,
  tastingId: string
): Promise<TastingResults | null> {
  const [event, tasting] = await Promise.all([getEvent(eventId), getTasting(eventId, tastingId)]);
  if (!event || !tasting) return null;

  const [roundsSnapshot, participants] = await Promise.all([
    submittedRoundsQuery(eventId, tastingId).get(),
    listParticipants(eventId),
  ]);
  const rounds = roundsSnapshot.docs.map((d) => d.data() as RoundDoc);

  const itemById = new Map(tasting.items.map((item) => [item.id, item]));
  const participantById = new Map(participants.map((p) => [p.id, p]));

  // Group totals (SPEC 7) and per-participant own totals, both from the
  // same round scan — one pass, two aggregations.
  const groupByItem = new Map<string, { points: number; pairs: number; won: number }>();
  const ownByParticipant = new Map<string, Map<string, { points: number; pairs: number; won: number }>>();

  function bump(
    map: Map<string, { points: number; pairs: number; won: number }>,
    itemId: string,
    points: number,
    won: boolean
  ) {
    const entry = map.get(itemId) ?? { points: 0, pairs: 0, won: 0 };
    entry.points += points;
    entry.pairs += 1;
    if (won) entry.won += 1;
    map.set(itemId, entry);
  }

  for (const round of rounds) {
    if (round.scoreA == null) continue;
    const scoreB = 50 - round.scoreA;

    bump(groupByItem, round.itemAId, round.scoreA, round.scoreA > 25);
    bump(groupByItem, round.itemBId, scoreB, scoreB > 25);

    let ownMap = ownByParticipant.get(round.participantId);
    if (!ownMap) {
      ownMap = new Map();
      ownByParticipant.set(round.participantId, ownMap);
    }
    bump(ownMap, round.itemAId, round.scoreA, round.scoreA > 25);
    bump(ownMap, round.itemBId, scoreB, scoreB > 25);
  }

  const groupRanking = computeGroupRanking(
    tasting.items.map((item) => {
      const stats = groupByItem.get(item.id);
      return {
        itemId: item.id,
        itemName: item.name,
        tastedPoints: stats?.points ?? 0,
        tastedPairs: stats?.pairs ?? 0,
        wonPairs: stats?.won ?? 0,
      };
    })
  );

  const participantScores: ParticipantScoreEntry[] = [...ownByParticipant.entries()].map(
    ([participantId, itemMap]) => ({
      participantId,
      name: participantById.get(participantId)?.name ?? "?",
      scores: computeGroupRanking(
        tasting.items.map((item) => {
          const stats = itemMap.get(item.id);
          return {
            itemId: item.id,
            itemName: item.name,
            tastedPoints: stats?.points ?? 0,
            tastedPairs: stats?.pairs ?? 0,
            wonPairs: stats?.won ?? 0,
          };
        })
      ),
    })
  );

  const guessTallies = aggregateGuessingTallies(rounds);
  const guessingRanking = tasting.hasGuessing
    ? computeGuessingRanking(
        [...guessTallies.entries()].map(([participantId, tally]) => ({
          participantId,
          name: participantById.get(participantId)?.name ?? "?",
          correctGuesses: tally.correct,
          attemptedGuesses: tally.attempted,
        }))
      )
    : [];

  const notes: NoteEntry[] = rounds
    .filter((round) => round.notes && round.notes.trim())
    .map((round) => ({
      participantId: round.participantId,
      participantName: participantById.get(round.participantId)?.name ?? "?",
      itemAName: itemById.get(round.itemAId)?.name ?? "?",
      itemBName: itemById.get(round.itemBId)?.name ?? "?",
      notes: round.notes,
    }));

  return { tasting, event, groupRanking, guessingRanking, participantScores, notes };
}

/**
 * SPEC 8: "jos arvaus on käytössä useammassa rinnakkaisessa tastingissa,
 * näytetään sekä tastingkohtainen että tapahtuman yhteisranking." Only
 * completed tastings count — an in-progress parallel tasting's guesses
 * aren't final yet.
 */
export async function computeEventGuessingRanking(eventId: string): Promise<GuessingRankingEntry[]> {
  const [tastings, participants] = await Promise.all([listTastings(eventId), listParticipants(eventId)]);
  const participantById = new Map(participants.map((p) => [p.id, p]));
  const totals = new Map<string, { correct: number; attempted: number }>();

  for (const tasting of tastings) {
    if (!tasting.hasGuessing || tasting.status !== "completed") continue;
    const roundsSnapshot = await submittedRoundsQuery(eventId, tasting.id).get();
    const rounds = roundsSnapshot.docs.map((d) => d.data() as RoundDoc);
    const tallies = aggregateGuessingTallies(rounds);
    for (const [participantId, tally] of tallies) {
      const entry = totals.get(participantId) ?? { correct: 0, attempted: 0 };
      entry.correct += tally.correct;
      entry.attempted += tally.attempted;
      totals.set(participantId, entry);
    }
  }

  return computeGuessingRanking(
    [...totals.entries()].map(([participantId, tally]) => ({
      participantId,
      name: participantById.get(participantId)?.name ?? "?",
      correctGuesses: tally.correct,
      attemptedGuesses: tally.attempted,
    }))
  );
}
