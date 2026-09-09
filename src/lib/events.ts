import "server-only";
import { adminDb } from "@/lib/firebaseAdmin";
import { slugify } from "@/lib/normalize";
import type { EventDoc, TastingDoc } from "@/lib/types";

const EVENTS = "events";

export class ActiveEventExistsError extends Error {
  constructor(public readonly activeEvent: EventDoc) {
    super("ACTIVE_EVENT_EXISTS");
  }
}

export async function getActiveEvent(): Promise<EventDoc | null> {
  const snapshot = await adminDb.collection(EVENTS).where("status", "==", "active").limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0]!;
  return { id: doc.id, ...doc.data() } as EventDoc;
}

export async function getEvent(eventId: string): Promise<EventDoc | null> {
  const doc = await adminDb.collection(EVENTS).doc(eventId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as EventDoc;
}

function tastingsRef(eventId: string) {
  return adminDb.collection(EVENTS).doc(eventId).collection("tastings");
}

/**
 * SPEC 14: "Tasting pending, tapahtuma arkistoidaan -> pending-tastingit
 * merkitään completed, ei tilastoja." statsCommitted is set true directly
 * (not run through completeTasting()'s stats logic) since nothing was ever
 * tasted — there is nothing to commit, and this permanently skips it.
 */
async function archivePendingTastings(
  tx: FirebaseFirestore.Transaction,
  eventId: string
): Promise<void> {
  const pendingSnapshot = await tx.get(tastingsRef(eventId).where("status", "==", "pending"));
  const now = Date.now();
  for (const doc of pendingSnapshot.docs) {
    tx.update(doc.ref, {
      status: "completed",
      completedAt: now,
      statsCommitted: true,
    } satisfies Partial<TastingDoc>);
  }
}

export interface CreateEventInput {
  name: string;
  category: string;
  /** Set when the organizer confirmed replacing the currently active event. */
  archivePreviousEventId?: string;
}

/**
 * Creates a new event. SPEC 4.2: only one active event at a time. Fails with
 * ActiveEventExistsError if another event is already active, unless
 * archivePreviousEventId names that exact event — then it is archived in the
 * same transaction as the new one is created.
 */
export async function createEvent(input: CreateEventInput): Promise<string> {
  const eventRef = adminDb.collection(EVENTS).doc();

  await adminDb.runTransaction(async (tx) => {
    const activeSnapshot = await tx.get(
      adminDb.collection(EVENTS).where("status", "==", "active").limit(1)
    );

    if (!activeSnapshot.empty) {
      const activeDoc = activeSnapshot.docs[0]!;
      const activeEvent = { id: activeDoc.id, ...activeDoc.data() } as EventDoc;
      if (activeDoc.id !== input.archivePreviousEventId) {
        throw new ActiveEventExistsError(activeEvent);
      }
      await archivePendingTastings(tx, activeDoc.id);
      tx.update(activeDoc.ref, { status: "archived", closedAt: Date.now() });
    }

    const event: Omit<EventDoc, "id"> = {
      name: input.name,
      category: input.category,
      categoryId: slugify(input.category),
      status: "active",
      createdAt: Date.now(),
    };
    tx.set(eventRef, event);
  });

  return eventRef.id;
}

/** SPEC 4.3: "Sulje tapahtuma." Idempotent — archiving twice is a no-op. */
export async function archiveEvent(eventId: string): Promise<void> {
  const eventRef = adminDb.collection(EVENTS).doc(eventId);

  await adminDb.runTransaction(async (tx) => {
    const eventDoc = await tx.get(eventRef);
    if (!eventDoc.exists) throw new Error("EVENT_NOT_FOUND");
    const event = eventDoc.data() as EventDoc;
    if (event.status === "archived") return;

    await archivePendingTastings(tx, eventId);
    tx.update(eventRef, { status: "archived", closedAt: Date.now() });
  });
}
