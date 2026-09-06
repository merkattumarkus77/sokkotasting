import "server-only";
import { adminDb } from "@/lib/firebaseAdmin";
import { normalizeName } from "@/lib/normalize";
import type { ParticipantDoc } from "@/lib/types";

function participantsRef(eventId: string) {
  return adminDb.collection("events").doc(eventId).collection("participants");
}

export interface LoginResult {
  participant: ParticipantDoc;
  sessionId: string;
}

/**
 * SPEC 4.2 login: find by nameKey, create if missing, always issue a fresh
 * activeSessionId. This invalidates any other device already logged in
 * under the same nickname, since their onSnapshot listener will see the
 * mismatch and log out.
 */
export async function loginParticipant(eventId: string, nickname: string): Promise<LoginResult> {
  const trimmedName = nickname.trim();
  const nameKey = normalizeName(trimmedName);
  if (!nameKey) throw new Error("EMPTY_NAME");

  const ref = participantsRef(eventId);
  const sessionId = crypto.randomUUID();

  const participant = await adminDb.runTransaction<ParticipantDoc>(async (tx) => {
    const existing = await tx.get(ref.where("nameKey", "==", nameKey).limit(1));
    const now = Date.now();

    if (!existing.empty) {
      const doc = existing.docs[0]!;
      tx.update(doc.ref, { activeSessionId: sessionId, lastActiveAt: now });
      return {
        ...(doc.data() as Omit<ParticipantDoc, "id">),
        id: doc.id,
        activeSessionId: sessionId,
        lastActiveAt: now,
      };
    }

    const newRef = ref.doc();
    const data: Omit<ParticipantDoc, "id"> = {
      name: trimmedName,
      nameKey,
      activeSessionId: sessionId,
      excludedTastingIds: [],
      createdAt: now,
      lastActiveAt: now,
    };
    tx.set(newRef, data);
    return { id: newRef.id, ...data };
  });

  return { participant, sessionId };
}

export async function getParticipant(
  eventId: string,
  participantId: string
): Promise<ParticipantDoc | null> {
  const doc = await participantsRef(eventId).doc(participantId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as ParticipantDoc;
}

export async function listParticipants(eventId: string): Promise<ParticipantDoc[]> {
  const snapshot = await participantsRef(eventId).orderBy("name").get();
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as ParticipantDoc);
}

/** Organizer-controlled opt-out per tasting (SPEC 3: excludedTastingIds). */
export async function setParticipantExclusion(
  eventId: string,
  participantId: string,
  tastingId: string,
  excluded: boolean
): Promise<void> {
  const ref = participantsRef(eventId).doc(participantId);
  await adminDb.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new Error("PARTICIPANT_NOT_FOUND");
    const data = doc.data() as ParticipantDoc;
    const excludedSet = new Set(data.excludedTastingIds);
    if (excluded) excludedSet.add(tastingId);
    else excludedSet.delete(tastingId);
    tx.update(ref, { excludedTastingIds: [...excludedSet] });
  });
}
