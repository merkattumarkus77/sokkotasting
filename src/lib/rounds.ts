import "server-only";
import { adminDb } from "@/lib/firebaseAdmin";
import { generateRoundRobinPairs } from "@/lib/roundRobin";
import {
  computeNextSeedingStep,
  pairKey,
  resolveSeedOrder,
  type SwissSeedingState,
} from "@/lib/swiss";
import { advanceBracket, buildBracket, computeFinalRanking } from "@/lib/swissBracket";
import type {
  BracketNode,
  ParticipantDoc,
  ParticipantTastingState,
  RoundDoc,
  RoundPhase,
  TastingDoc,
} from "@/lib/types";

function tastingRef(eventId: string, tastingId: string) {
  return adminDb.collection("events").doc(eventId).collection("tastings").doc(tastingId);
}

function participantStateRef(eventId: string, tastingId: string, participantId: string) {
  return tastingRef(eventId, tastingId).collection("participantState").doc(participantId);
}

function roundsRef(eventId: string, tastingId: string) {
  return tastingRef(eventId, tastingId).collection("rounds");
}

function roundDocId(participantId: string, roundIndex: number): string {
  return `${participantId}_${roundIndex}`;
}

/**
 * All submitted rounds for a tasting (across every participant) — the basis
 * for group-level scoring (SPEC 7), the guessing ranking (SPEC 8), and the
 * all-time stats commit (SPEC 13). Returned as a Query so callers can either
 * `.get()` it directly or `tx.get(query)` inside a transaction.
 */
export function submittedRoundsQuery(eventId: string, tastingId: string) {
  return roundsRef(eventId, tastingId).where("status", "==", "SUBMITTED");
}

export class RoundMismatchError extends Error {
  constructor() {
    super("ROUND_MISMATCH");
  }
}

function maxSeedingRounds(tasting: TastingDoc): number {
  return tasting.seedingRounds + 4;
}

function makeSwissRound(
  tastingId: string,
  participantId: string,
  roundIndex: number,
  itemAId: string,
  itemBId: string,
  phase: RoundPhase,
  extra: { seedingRoundNumber?: number; matchId?: string } = {}
): RoundDoc {
  return {
    id: roundDocId(participantId, roundIndex),
    tastingId,
    participantId,
    roundIndex,
    itemAId,
    itemBId,
    status: "WAITING_SERVICE",
    servedAt: null,
    submittedAt: null,
    scoreA: null,
    notes: "",
    phase,
    ...(extra.seedingRoundNumber !== undefined
      ? { seedingRoundNumber: extra.seedingRoundNumber }
      : {}),
    ...(extra.matchId !== undefined ? { matchId: extra.matchId } : {}),
  };
}

/**
 * Lazily creates a participant's rounds the first time they open an
 * in_progress tasting (SPEC 5.1). Idempotent: a participantState document
 * already existing means this has already run, so it does nothing.
 * SWISS_TOURNAMENT creates only seeding round 1 here — submitRound() drives
 * every later round, exactly as SPEC 5.1 describes.
 */
export async function ensureRounds(
  eventId: string,
  tasting: TastingDoc,
  participant: ParticipantDoc
): Promise<void> {
  const stateRef = participantStateRef(eventId, tasting.id, participant.id);

  await adminDb.runTransaction(async (tx) => {
    const existingState = await tx.get(stateRef);
    if (existingState.exists) return;

    const seed = `${tasting.id}:${participant.id}`;
    const itemIds = tasting.items.map((item) => item.id);

    if (tasting.logic === "ROUND_ROBIN") {
      const pairs = generateRoundRobinPairs(itemIds, seed);

      // Round Robin has no seeding/playoff phases; "DONE" is a fixed
      // sentinel since the field is Swiss-shaped but required by the
      // shared schema.
      const state: ParticipantTastingState = {
        participantId: participant.id,
        phase: "DONE",
        rngSeed: seed,
        currentRoundIndex: 0,
        seedingRoundNumber: 0,
        cumulativePoints: {},
        tastedPoints: {},
        tastedPairs: {},
        metPairs: [],
        updatedAt: Date.now(),
      };
      tx.set(stateRef, state);

      pairs.forEach((pair, index) => {
        const round = makeSwissRound(
          tasting.id,
          participant.id,
          index,
          pair.itemAId,
          pair.itemBId,
          "ROUND_ROBIN"
        );
        tx.set(roundsRef(eventId, tasting.id).doc(round.id), round);
      });
      return;
    }

    // SWISS_TOURNAMENT: round 1 is a plain shuffle, always produces at
    // least one pair for any itemIds.length >= 2 (SPEC 6.2 requires >= 8),
    // so computeNextSeedingStep here can never come back "needsCutoff".
    const seedingState: SwissSeedingState = {
      itemIds,
      cumulativePoints: {},
      metPairs: [],
      seedingRoundNumber: 1,
      rngSeed: seed,
    };
    const step = computeNextSeedingStep(seedingState, maxSeedingRounds(tasting));
    if (step.kind !== "round") {
      throw new Error("Swiss round 1 unexpectedly produced no pairing");
    }

    const cumulativePoints: Record<string, number> = {};
    if (step.byeItemId) cumulativePoints[step.byeItemId] = 25;

    const state: ParticipantTastingState = {
      participantId: participant.id,
      phase: "SEEDING",
      rngSeed: seed,
      currentRoundIndex: 0,
      seedingRoundNumber: 1,
      cumulativePoints,
      tastedPoints: {},
      tastedPairs: {},
      metPairs: [],
      updatedAt: Date.now(),
    };
    tx.set(stateRef, state);

    step.pairs.forEach((pair, index) => {
      const round = makeSwissRound(
        tasting.id,
        participant.id,
        index,
        pair.itemAId,
        pair.itemBId,
        "SEEDING",
        { seedingRoundNumber: 1 }
      );
      tx.set(roundsRef(eventId, tasting.id).doc(round.id), round);
    });
  });
}

/** SPEC 8 guess-history counter: how many times has this participant already guessed each item. */
export async function getGuessCounts(
  eventId: string,
  tastingId: string,
  participantId: string
): Promise<Record<string, number>> {
  const snapshot = await roundsRef(eventId, tastingId)
    .where("participantId", "==", participantId)
    .get();

  const counts: Record<string, number> = {};
  for (const doc of snapshot.docs) {
    const round = doc.data() as RoundDoc;
    if (round.guessAId) counts[round.guessAId] = (counts[round.guessAId] ?? 0) + 1;
    if (round.guessBId) counts[round.guessBId] = (counts[round.guessBId] ?? 0) + 1;
  }
  return counts;
}

export async function getParticipantState(
  eventId: string,
  tastingId: string,
  participantId: string
): Promise<ParticipantTastingState | null> {
  const doc = await participantStateRef(eventId, tastingId, participantId).get();
  if (!doc.exists) return null;
  return doc.data() as ParticipantTastingState;
}

/** The round a participant is currently on, or null once all are submitted. */
export async function getCurrentRound(
  eventId: string,
  tastingId: string,
  participantId: string
): Promise<RoundDoc | null> {
  const state = await getParticipantState(eventId, tastingId, participantId);
  if (!state) return null;
  const doc = await roundsRef(eventId, tastingId)
    .doc(roundDocId(participantId, state.currentRoundIndex))
    .get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as RoundDoc;
}

/**
 * SPEC 5.2: serves the participant's current round, if any and if it is
 * still waiting. A participant can only ever have one SERVED round at a
 * time, because the next round only becomes current once this one is
 * SUBMITTED — so no separate check is needed here.
 */
export async function markRoundServed(
  eventId: string,
  tastingId: string,
  participantId: string,
  expectedRoundId?: string
): Promise<void> {
  const stateRef = participantStateRef(eventId, tastingId, participantId);

  await adminDb.runTransaction(async (tx) => {
    const stateDoc = await tx.get(stateRef);
    if (!stateDoc.exists) throw new Error("STATE_NOT_FOUND");
    const state = stateDoc.data() as ParticipantTastingState;

    const roundId = roundDocId(participantId, state.currentRoundIndex);
    if (expectedRoundId !== undefined && expectedRoundId !== roundId) {
      throw new RoundMismatchError();
    }

    const roundRef = roundsRef(eventId, tastingId).doc(roundId);
    const roundDoc = await tx.get(roundRef);
    if (!roundDoc.exists) return; // all rounds already complete
    const round = roundDoc.data() as RoundDoc;
    if (round.status !== "WAITING_SERVICE") return; // idempotent

    tx.update(roundRef, { status: "SERVED", servedAt: Date.now() });
  });
}

/** SPEC 5.2 "Kuittaa kaikki odottavat": serves every participant who can be served. */
export async function markAllPendingServed(eventId: string, tastingId: string): Promise<number> {
  const participantsSnapshot = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("participants")
    .get();

  let servedCount = 0;

  for (const doc of participantsSnapshot.docs) {
    const participant = { id: doc.id, ...doc.data() } as ParticipantDoc;
    if (participant.excludedTastingIds.includes(tastingId)) continue;

    const stateDoc = await participantStateRef(eventId, tastingId, participant.id).get();
    if (!stateDoc.exists) continue; // hasn't opened the tasting yet

    const state = stateDoc.data() as ParticipantTastingState;
    const roundRef = roundsRef(eventId, tastingId).doc(
      roundDocId(participant.id, state.currentRoundIndex)
    );
    const roundDoc = await roundRef.get();
    if (!roundDoc.exists) continue;
    const round = roundDoc.data() as RoundDoc;
    if (round.status !== "WAITING_SERVICE") continue;

    await roundRef.update({ status: "SERVED", servedAt: Date.now() });
    servedCount++;
  }

  return servedCount;
}

export interface SubmitRoundInput {
  scoreA: number;
  notes: string;
  guessAId?: string | null;
  guessBId?: string | null;
}

export class RoundNotServedError extends Error {
  constructor() {
    super("ROUND_NOT_SERVED");
  }
}

export class RoundAlreadySubmittedError extends Error {
  constructor() {
    super("ROUND_ALREADY_SUBMITTED");
  }
}

export class SwissTieForbiddenError extends Error {
  constructor() {
    super("SWISS_TIE_FORBIDDEN");
  }
}

function roundPhaseForBracketNode(node: BracketNode): RoundPhase {
  if (node.roundName === "BRONZE") return "BRONZE";
  if (node.roundName === "FINAL") return "FINAL";
  return "PLAYOFF";
}

/**
 * SPEC 5/7/8: submits the participant's current round. Rejects a second
 * submit for the same round (409-equivalent) and computes guess correctness
 * immediately — SPEC 8 requires this to happen at submit time, not later.
 * For SWISS_TOURNAMENT this also drives the whole state machine (SPEC 5.1:
 * "jokainen submit laukaisee seuraavan parituksen laskennan"): advances the
 * seeding stage, transitions into the knockout bracket once seeding ends,
 * advances the bracket, and computes finalRanking once it's fully decided —
 * all inside this one transaction, all reads before any writes.
 */
export async function submitRound(
  eventId: string,
  tasting: TastingDoc,
  participant: ParticipantDoc,
  input: SubmitRoundInput,
  expectedRoundId?: string
): Promise<void> {
  const stateRef = participantStateRef(eventId, tasting.id, participant.id);

  await adminDb.runTransaction(async (tx) => {
    // ---- reads ----
    const stateDoc = await tx.get(stateRef);
    if (!stateDoc.exists) throw new Error("STATE_NOT_FOUND");
    const state = stateDoc.data() as ParticipantTastingState;

    const roundId = roundDocId(participant.id, state.currentRoundIndex);
    if (expectedRoundId !== undefined && expectedRoundId !== roundId) {
      throw new RoundMismatchError();
    }

    const roundRef = roundsRef(eventId, tasting.id).doc(roundId);
    const roundDoc = await tx.get(roundRef);
    if (!roundDoc.exists) throw new Error("ROUND_NOT_FOUND");
    const round = roundDoc.data() as RoundDoc;

    if (round.status === "SUBMITTED") throw new RoundAlreadySubmittedError();
    if (round.status !== "SERVED") throw new RoundNotServedError();

    const scoreA = input.scoreA;
    if (tasting.logic === "SWISS_TOURNAMENT" && scoreA === 25) {
      throw new SwissTieForbiddenError();
    }
    const scoreB = 50 - scoreA;
    const now = Date.now();

    const tastedPoints = { ...state.tastedPoints };
    const tastedPairs = { ...state.tastedPairs };
    const cumulativePoints = { ...state.cumulativePoints };
    tastedPoints[round.itemAId] = (tastedPoints[round.itemAId] ?? 0) + scoreA;
    tastedPoints[round.itemBId] = (tastedPoints[round.itemBId] ?? 0) + scoreB;
    tastedPairs[round.itemAId] = (tastedPairs[round.itemAId] ?? 0) + 1;
    tastedPairs[round.itemBId] = (tastedPairs[round.itemBId] ?? 0) + 1;
    cumulativePoints[round.itemAId] = (cumulativePoints[round.itemAId] ?? 0) + scoreA;
    cumulativePoints[round.itemBId] = (cumulativePoints[round.itemBId] ?? 0) + scoreB;

    const nextRoundIndex = state.currentRoundIndex + 1;
    const stateUpdate: Partial<ParticipantTastingState> = {
      currentRoundIndex: nextRoundIndex,
      tastedPoints,
      tastedPairs,
      cumulativePoints,
      updatedAt: now,
    };
    const newRounds: RoundDoc[] = [];

    if (tasting.logic === "SWISS_TOURNAMENT") {
      const metPairs = [...state.metPairs, pairKey(round.itemAId, round.itemBId)];
      stateUpdate.metPairs = metPairs;

      if (state.phase === "PLAYOFF") {
        // Bracket advancement must happen for every playoff/bronze/final
        // submit, regardless of whether a next round is already waiting —
        // this participant's OTHER already-created sibling match (e.g. the
        // other semifinal) still needs this result applied when it's its
        // own turn to be checked for readiness.
        const winnerId = scoreA > 25 ? round.itemAId : round.itemBId;
        const loserId = winnerId === round.itemAId ? round.itemBId : round.itemAId;
        const bracket = advanceBracket(state.bracket ?? [], round.matchId!, winnerId, loserId);
        stateUpdate.bracket = bracket;

        const finalNode = bracket.find((node) => node.roundName === "FINAL");
        const bronzeNode = bracket.find((node) => node.roundName === "BRONZE");
        const isComplete = Boolean(
          finalNode?.winner &&
            finalNode?.loser &&
            (!bronzeNode || (bronzeNode.winner && bronzeNode.loser))
        );

        if (isComplete) {
          const headToHeadWinners = new Map<string, string>();
          for (const node of bracket) {
            if (node.winner && node.loser) {
              headToHeadWinners.set(pairKey(node.winner, node.loser), node.winner);
            }
          }
          stateUpdate.phase = "DONE";
          stateUpdate.finalRanking = computeFinalRanking(
            bracket,
            cumulativePoints,
            headToHeadWinners,
            state.rngSeed
          );
        } else {
          const nextRoundDoc = await tx.get(
            roundsRef(eventId, tasting.id).doc(roundDocId(participant.id, nextRoundIndex))
          );
          if (!nextRoundDoc.exists) {
            let index = nextRoundIndex;
            for (const node of bracket) {
              if (node.isBye || node.winner) continue;
              if (!(node.slotA && node.slotB)) continue;
              // matchId values (e.g. "QF-1") repeat across participants —
              // each has their own independent bracket (SPEC 6.2) — so this
              // must also filter by participantId or it would find and skip
              // a different participant's already-created match.
              const existing = await tx.get(
                roundsRef(eventId, tasting.id)
                  .where("participantId", "==", participant.id)
                  .where("matchId", "==", node.matchId)
                  .limit(1)
              );
              if (!existing.empty) continue;
              newRounds.push(
                makeSwissRound(
                  tasting.id,
                  participant.id,
                  index,
                  node.slotA,
                  node.slotB,
                  roundPhaseForBracketNode(node),
                  { matchId: node.matchId }
                )
              );
              index++;
            }
          }
        }
      } else if (state.phase === "SEEDING") {
        const nextRoundDoc = await tx.get(
          roundsRef(eventId, tasting.id).doc(roundDocId(participant.id, nextRoundIndex))
        );

        if (!nextRoundDoc.exists) {
          const seedingState: SwissSeedingState = {
            itemIds: tasting.items.map((item) => item.id),
            cumulativePoints,
            metPairs,
            seedingRoundNumber: state.seedingRoundNumber + 1,
            rngSeed: state.rngSeed,
          };
          const step = computeNextSeedingStep(seedingState, maxSeedingRounds(tasting));

          if (step.kind === "round") {
            if (step.byeItemId) {
              cumulativePoints[step.byeItemId] = (cumulativePoints[step.byeItemId] ?? 0) + 25;
            }
            stateUpdate.seedingRoundNumber = step.seedingRoundNumber;
            stateUpdate.cumulativePoints = cumulativePoints;
            step.pairs.forEach((pair, i) => {
              newRounds.push(
                makeSwissRound(
                  tasting.id,
                  participant.id,
                  nextRoundIndex + i,
                  pair.itemAId,
                  pair.itemBId,
                  "SEEDING",
                  { seedingRoundNumber: step.seedingRoundNumber }
                )
              );
            });
          } else {
            // needsCutoff: resolve seedOrder using head-to-head history from
            // every submitted seeding match (including the one just above,
            // not yet visible to a fresh query within this same transaction).
            const seedingRoundsSnapshot = await tx.get(
              roundsRef(eventId, tasting.id)
                .where("participantId", "==", participant.id)
                .where("phase", "==", "SEEDING")
            );
            const headToHeadWinners = new Map<string, string>();
            for (const doc of seedingRoundsSnapshot.docs) {
              const r = doc.data() as RoundDoc;
              if (r.status !== "SUBMITTED" || r.scoreA == null) continue;
              headToHeadWinners.set(
                pairKey(r.itemAId, r.itemBId),
                r.scoreA > 25 ? r.itemAId : r.itemBId
              );
            }
            headToHeadWinners.set(
              pairKey(round.itemAId, round.itemBId),
              scoreA > 25 ? round.itemAId : round.itemBId
            );

            const seedOrder = resolveSeedOrder({
              itemIds: tasting.items.map((item) => item.id),
              cumulativePoints,
              tastedPoints,
              headToHeadWinners,
              rngSeed: state.rngSeed,
            });
            const bracket = buildBracket(seedOrder, tasting.hasBronzeMatch);

            stateUpdate.phase = "PLAYOFF";
            stateUpdate.seedOrder = seedOrder;
            stateUpdate.bracket = bracket;

            let index = nextRoundIndex;
            for (const node of bracket) {
              if (node.isBye || node.roundName === "BRONZE") continue;
              if (node.slotA && node.slotB && !node.winner) {
                newRounds.push(
                  makeSwissRound(
                    tasting.id,
                    participant.id,
                    index,
                    node.slotA,
                    node.slotB,
                    roundPhaseForBracketNode(node),
                    { matchId: node.matchId }
                  )
                );
                index++;
              }
            }
          }
        }
      }
    }

    // ---- writes ----
    const guessACorrect = input.guessAId != null ? input.guessAId === round.itemAId : undefined;
    const guessBCorrect = input.guessBId != null ? input.guessBId === round.itemBId : undefined;

    tx.update(roundRef, {
      status: "SUBMITTED",
      submittedAt: now,
      scoreA,
      notes: input.notes,
      // Firestore rejects `undefined` fields: omit guess fields entirely
      // when guessing is off or a guess was left blank.
      ...(input.guessAId !== undefined ? { guessAId: input.guessAId } : {}),
      ...(input.guessBId !== undefined ? { guessBId: input.guessBId } : {}),
      ...(guessACorrect !== undefined ? { guessACorrect } : {}),
      ...(guessBCorrect !== undefined ? { guessBCorrect } : {}),
    });

    tx.update(stateRef, stateUpdate);

    for (const newRound of newRounds) {
      tx.set(roundsRef(eventId, tasting.id).doc(newRound.id), newRound);
    }
  });
}
