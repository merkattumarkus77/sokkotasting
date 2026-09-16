import "server-only";
import { mergeCategoryStats, mergeKnownItems } from "@/lib/categoryStats";
import { adminDb } from "@/lib/firebaseAdmin";
import { assignItemCodes } from "@/lib/itemCodes";
import { MAX_TASTINGS_PER_EVENT } from "@/lib/limits";
import { slugify } from "@/lib/normalize";
import { aggregateGroupStats, distinctParticipantCount } from "@/lib/roundAggregation";
import { submittedRoundsQuery } from "@/lib/rounds";
import type { CategoryDoc, EventDoc, PortionUnit, RoundDoc, TastingDoc, TastingLogic } from "@/lib/types";

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

function categoriesRef() {
  return adminDb.collection("categories");
}

/**
 * SPEC 5 "Päätä tasting ja julkaise" + SPEC 13 all-time stats. One
 * transaction: idempotent on both the status transition (a second call is a
 * no-op, CLAUDE.md rule 5 — double-click can't break anything) and the
 * stats commit specifically (gated on `statsCommitted`, so even calling
 * complete() again after a successful commit never double-counts).
 */
export async function completeTasting(eventId: string, tastingId: string): Promise<void> {
  const ref = tastingsRef(eventId).doc(tastingId);
  const eventRef = adminDb.collection("events").doc(eventId);

  await adminDb.runTransaction(async (tx) => {
    const tastingDoc = await tx.get(ref);
    if (!tastingDoc.exists) throw new Error("TASTING_NOT_FOUND");
    const tasting = tastingDoc.data() as TastingDoc;
    if (tasting.status === "completed") return;

    const now = Date.now();
    const update: Partial<TastingDoc> = { status: "completed", completedAt: now };

    if (!tasting.statsCommitted) {
      const eventDoc = await tx.get(eventRef);
      const event = eventDoc.exists ? (eventDoc.data() as EventDoc) : null;

      const roundsSnapshot = await tx.get(submittedRoundsQuery(eventId, tastingId));
      const rounds = roundsSnapshot.docs.map((d) => d.data() as RoundDoc);
      const groupStats = aggregateGroupStats(rounds);
      const participantCount = distinctParticipantCount(rounds);

      if (event && groupStats.size > 0) {
        const categoryId = slugify(event.category);
        const categoryRef = categoriesRef().doc(categoryId);
        const categoryDoc = await tx.get(categoryRef);
        const category = categoryDoc.exists ? (categoryDoc.data() as CategoryDoc) : null;

        const itemNameById = new Map(tasting.items.map((item) => [item.id, item.name]));
        const statUpdates = [...groupStats.entries()].map(([itemId, stats]) => ({
          itemName: itemNameById.get(itemId) ?? itemId,
          tastedPoints: stats.tastedPoints,
          tastedPairs: stats.tastedPairs,
        }));

        const mergedStats = mergeCategoryStats(category?.stats ?? [], statUpdates, participantCount);
        const mergedKnownItems = mergeKnownItems(
          category?.knownItems ?? [],
          statUpdates.map((u) => u.itemName)
        );

        const categoryUpdate: CategoryDoc = {
          id: categoryId,
          name: event.category,
          knownItems: mergedKnownItems,
          stats: mergedStats,
          updatedAt: now,
        };
        tx.set(categoryRef, categoryUpdate);
      }

      update.statsCommitted = true;
    }

    tx.update(ref, update);
  });
}
