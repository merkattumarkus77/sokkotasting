import "server-only";
import { adminDb } from "@/lib/firebaseAdmin";
import { assignItemCodes } from "@/lib/itemCodes";
import { MAX_TASTINGS_PER_EVENT } from "@/lib/limits";
import type { PortionUnit, TastingDoc, TastingLogic } from "@/lib/types";

function tastingsRef(eventId: string) {
  return adminDb.collection("events").doc(eventId).collection("tastings");
}

export interface CreateTastingInput {
  name: string;
  logic: TastingLogic;
  itemNames: string[];
  portionAmount: number;
  portionUnit: PortionUnit;
  hasGuessing: boolean;
  hasBronzeMatch: boolean;
  timeLimitMinutes: number | null;
  seedingRounds: number;
}

export class MaxTastingsReachedError extends Error {
  constructor() {
    super("MAX_TASTINGS_REACHED");
  }
}

export async function createTasting(eventId: string, input: CreateTastingInput): Promise<string> {
  const ref = tastingsRef(eventId).doc();

  await adminDb.runTransaction(async (tx) => {
    const existing = await tx.get(tastingsRef(eventId));
    if (existing.size >= MAX_TASTINGS_PER_EVENT) {
      throw new MaxTastingsReachedError();
    }

    const items = assignItemCodes(input.itemNames, () => crypto.randomUUID());

    const tasting: Omit<TastingDoc, "id"> = {
      eventId,
      name: input.name,
      logic: input.logic,
      items,
      portionSize: `${input.portionAmount} ${input.portionUnit}`,
      portionAmount: input.portionAmount,
      portionUnit: input.portionUnit,
      hasGuessing: input.hasGuessing,
      hasBronzeMatch: input.hasBronzeMatch,
      timeLimitMinutes: input.timeLimitMinutes,
      seedingRounds: input.seedingRounds,
      status: "pending",
      statsCommitted: false,
      createdAt: Date.now(),
    };
    tx.set(ref, tasting);
  });

  return ref.id;
}

export async function getTasting(eventId: string, tastingId: string): Promise<TastingDoc | null> {
  const doc = await tastingsRef(eventId).doc(tastingId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as TastingDoc;
}

export async function listTastings(eventId: string): Promise<TastingDoc[]> {
  const snapshot = await tastingsRef(eventId).orderBy("createdAt", "asc").get();
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as TastingDoc);
}

/** SPEC 5: pending -> in_progress. Idempotent (a second call is a no-op). */
export async function startTasting(eventId: string, tastingId: string): Promise<void> {
  const ref = tastingsRef(eventId).doc(tastingId);
  await adminDb.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new Error("TASTING_NOT_FOUND");
    const tasting = doc.data() as TastingDoc;
    if (tasting.status !== "pending") return;
    tx.update(ref, { status: "in_progress" });
  });
}
