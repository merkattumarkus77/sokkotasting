import { describe, expect, it } from "vitest";
import { adminDb } from "@/lib/firebaseAdmin";
import { pairsPerParticipantCount } from "@/lib/roundRobin";
import {
  ensureRounds,
  getParticipantState,
  RoundMismatchError,
  submitRound,
} from "@/lib/rounds";
import { seedParticipant, seedTasting } from "@/lib/testHelpers.integration";

// SPEC 15.2: "ensure-rounds kahdesti -> kierroksia ei tule kahta settiä"
describe("ensureRounds idempotency", () => {
  it("does nothing the second time it is called for the same participant", async () => {
    const eventId = crypto.randomUUID();
    const tastingId = crypto.randomUUID();
    const participantId = crypto.randomUUID();

    const tasting = await seedTasting(eventId, tastingId);
    const participant = await seedParticipant(eventId, participantId);

    await ensureRounds(eventId, tasting, participant);
    await ensureRounds(eventId, tasting, participant);

    const snapshot = await adminDb
      .collection("events")
      .doc(eventId)
      .collection("tastings")
      .doc(tastingId)
      .collection("rounds")
      .get();

    expect(snapshot.size).toBe(pairsPerParticipantCount(tasting.items.length));

    const state = await getParticipantState(eventId, tastingId, participantId);
    expect(state?.currentRoundIndex).toBe(0);
  });
});

// SPEC 15.2: "submit samalle kierrokselle kahdesti -> toinen palauttaa 409"
describe("submitRound double submit", () => {
  it("rejects a second submit for a round that has already advanced", async () => {
    const eventId = crypto.randomUUID();
    const tastingId = crypto.randomUUID();
    const participantId = crypto.randomUUID();

    const tasting = await seedTasting(eventId, tastingId);
    const participant = await seedParticipant(eventId, participantId);
    await ensureRounds(eventId, tasting, participant);

    const roundsRef = adminDb
      .collection("events")
      .doc(eventId)
      .collection("tastings")
      .doc(tastingId)
      .collection("rounds");
    const firstRoundId = `${participantId}_0`;
    await roundsRef.doc(firstRoundId).update({ status: "SERVED", servedAt: Date.now() });

    await submitRound(eventId, tasting, participant, { scoreA: 30, notes: "" }, firstRoundId);

    await expect(
      submitRound(eventId, tasting, participant, { scoreA: 10, notes: "" }, firstRoundId)
    ).rejects.toBeInstanceOf(RoundMismatchError);

    const state = await getParticipantState(eventId, tastingId, participantId);
    expect(state?.currentRoundIndex).toBe(1);
  });
});
