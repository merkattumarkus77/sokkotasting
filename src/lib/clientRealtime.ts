"use client";

import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { EventDoc, ParticipantDoc } from "@/lib/types";

// Direct browser reads of Firestore, allowed only for /events/{id} and its
// /participants subcollection (firestore.rules) — no product identity lives
// there. Everything under tastings/** goes through Route Handlers instead
// (polling), see the API routes under src/app/api/tastings.

export function subscribeToActiveEvent(onChange: (event: EventDoc | null) => void): () => void {
  const q = query(collection(db, "events"), where("status", "==", "active"));
  return onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      onChange(null);
      return;
    }
    const d = snapshot.docs[0]!;
    onChange({ id: d.id, ...d.data() } as EventDoc);
  });
}

export function subscribeToParticipant(
  eventId: string,
  participantId: string,
  onChange: (participant: ParticipantDoc | null) => void
): () => void {
  return onSnapshot(doc(db, "events", eventId, "participants", participantId), (snapshot) => {
    if (!snapshot.exists()) {
      onChange(null);
      return;
    }
    onChange({ id: snapshot.id, ...snapshot.data() } as ParticipantDoc);
  });
}

export function subscribeToEventParticipants(
  eventId: string,
  onChange: (participants: ParticipantDoc[]) => void
): () => void {
  return onSnapshot(collection(db, "events", eventId, "participants"), (snapshot) => {
    const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as ParticipantDoc);
    list.sort((a, b) => a.name.localeCompare(b.name, "fi"));
    onChange(list);
  });
}
