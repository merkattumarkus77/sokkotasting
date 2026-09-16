// Shared setup helpers for *.integration.test.ts files (emulator only).
// Writes documents directly rather than going through createEvent()/
// createTasting(), which enforce the "one active event" invariant globally —
// that would make tests interfere with each other when run in the same
// emulator session. Each test gets its own random event/tasting ids instead.
import { adminDb } from "@/lib/firebaseAdmin";
import type { ParticipantDoc, TastingDoc, TastingItem } from "@/lib/types";

export function makeItems(names: string[]): TastingItem[] {
  return names.map((name, index) => ({
    id: crypto.randomUUID(),
    name,
    code: `T${index + 1}`,
  }));
}

export async function seedTasting(
  eventId: string,
  tastingId: string,
  overrides: Partial<TastingDoc> = {}
): Promise<TastingDoc> {
  const tasting: TastingDoc = {
    id: tastingId,
    eventId,
    name: "Integraatiotesti",
    logic: "ROUND_ROBIN",
    items: makeItems(["Atria", "Snellman", "HK"]),
    portionSize: "30 ml",
    portionAmount: 30,
    portionUnit: "ml",
    hasGuessing: false,
    hasBronzeMatch: false,
    timeLimitMinutes: null,
    seedingRounds: 2,
    status: "in_progress",
    statsCommitted: false,
    createdAt: Date.now(),
    ...overrides,
  };
  await adminDb
    .collection("events")
    .doc(eventId)
    .collection("tastings")
    .doc(tastingId)
    .set(tasting);
  return tasting;
}

export async function seedParticipant(
  eventId: string,
  participantId: string,
  overrides: Partial<ParticipantDoc> = {}
): Promise<ParticipantDoc> {
  const participant: ParticipantDoc = {
    id: participantId,
    name: "Matti",
    nameKey: "matti",
    activeSessionId: "",
    excludedTastingIds: [],
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    ...overrides,
  };
  await adminDb
    .collection("events")
    .doc(eventId)
    .collection("participants")
    .doc(participantId)
    .set(participant);
  return participant;
}
