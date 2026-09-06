import "server-only";
import { adminDb } from "@/lib/firebaseAdmin";
import { generateRoundRobinPairs } from "@/lib/roundRobin";
import type {
  ParticipantDoc,
  ParticipantTastingState,
  RoundDoc,
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

export class SwissNotImplementedError extends Error {
  constructor() {
    super("SWISS_NOT_IMPLEMENTED");
  }
}

export class RoundMismatchError extends Error {
  constructor() {
    super("ROUND_MISMATCH");
  }
}

/**
 * Lazily creates a participant's rounds the first time they open an
 * in_progress tasting (SPEC 5.1). Idempotent: a participantState document
 * already existing means this has already run, so it does nothing.
 */
export async function ensureRounds(
  eventId: string,
  tasting: TastingDoc,
  participant: ParticipantDoc
): Promise<void> {
  if (tasting.logic !== "ROUND_ROBIN") {
    // TODO (Vaihe E): SWISS_TOURNAMENT should create only the first seeding
    // round here, then let submit trigger further pairing. Tracked in
    // docs/PROGRESS.md — the API rejects creating SWISS tastings until then.
    throw new SwissNotImplementedError();
  }

  const stateRef = participantStateRef(eventId, tasting.id, participant.id);

  await adminDb.runTransaction(async (tx) => {
    const existingState = await tx.get(stateRef);
    if (existingState.exists) return;

    const seed = `${tasting.id}:${participant.id}`;
    const pairs = generateRoundRobinPairs(
      tasting.items.map((item) => item.id),
      seed
    );

    // Round Robin has no seeding/playoff phases; "DONE" is a fixed sentinel
    // since the field is Swiss-shaped but required by the shared schema.
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
      const round: RoundDoc = {
        id: roundDocId(participant.id, index),
        tastingId: tasting.id,
        participantId: participant.id,
        roundIndex: index,
        itemAId: pair.itemAId,
        itemBId: pair.itemBId,
        status: "WAITING_SERVICE",
        servedAt: null,
        submittedAt: null,
        scoreA: null,
        notes: "",
        phase: "ROUND_ROBIN",
      };
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

/**
 * SPEC 5/7/8: submits the participant's current round. Rejects a second
 * submit for the same round (409-equivalent) and computes guess correctness
 * immediately — SPEC 8 requires this to happen at submit time, not later.
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
    const scoreB = 50 - scoreA;
    const now = Date.now();

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

    const tastedPoints = { ...state.tastedPoints };
    const tastedPairs = { ...state.tastedPairs };
    const cumulativePoints = { ...state.cumulativePoints };

    tastedPoints[round.itemAId] = (tastedPoints[round.itemAId] ?? 0) + scoreA;
    tastedPoints[round.itemBId] = (tastedPoints[round.itemBId] ?? 0) + scoreB;
    tastedPairs[round.itemAId] = (tastedPairs[round.itemAId] ?? 0) + 1;
    tastedPairs[round.itemBId] = (tastedPairs[round.itemBId] ?? 0) + 1;
    cumulativePoints[round.itemAId] = (cumulativePoints[round.itemAId] ?? 0) + scoreA;
    cumulativePoints[round.itemBId] = (cumulativePoints[round.itemBId] ?? 0) + scoreB;

    tx.update(stateRef, {
      currentRoundIndex: state.currentRoundIndex + 1,
      tastedPoints,
      tastedPairs,
      cumulativePoints,
      updatedAt: now,
    });
  });
}
