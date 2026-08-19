import { collection, doc, getDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generateRoundsForParticipants, pairsPerParticipantCount } from "@/lib/roundRobin";
import type { Participant, TastingEvent } from "@/lib/types";

export interface CreateEventInput {
  name: string;
  category: string;
  participantNames: string[];
  productNames: string[];
  portionSizeValue: number;
  portionSizeUnit: string;
  guessingEnabled: boolean;
}

export async function getActiveEvent(): Promise<TastingEvent | null> {
  const configSnapshot = await getDoc(doc(db, "config", "app"));
  const activeEventId = configSnapshot.exists() ? configSnapshot.data().activeEventId : undefined;
  if (!activeEventId) return null;

  const eventSnapshot = await getDoc(doc(db, "events", activeEventId));
  if (!eventSnapshot.exists()) return null;
  return { id: eventSnapshot.id, ...eventSnapshot.data() } as TastingEvent;
}

/**
 * Luo uuden tastingin: arpoo ja tarkistaa jokaisen osallistujan kierrokset,
 * tallentaa event- ja participant-dokumentit yhdellä batchilla, ja päivittää
 * config.activeEventId osoittamaan uuteen tapahtumaan.
 */
export async function createEvent(input: CreateEventInput): Promise<string> {
  const pairsPerParticipant = pairsPerParticipantCount(input.productNames.length);
  const roundsByParticipant = generateRoundsForParticipants(
    input.participantNames,
    input.productNames.length
  );

  const eventRef = doc(collection(db, "events"));
  const event: Omit<TastingEvent, "id"> = {
    name: input.name,
    category: input.category,
    productNames: input.productNames,
    participantNames: input.participantNames,
    portionSizeValue: input.portionSizeValue,
    portionSizeUnit: input.portionSizeUnit,
    guessingEnabled: input.guessingEnabled,
    pairsPerParticipant,
    status: "active",
    createdAt: Date.now(),
  };

  const batch = writeBatch(db);
  batch.set(eventRef, event);

  for (const name of input.participantNames) {
    const participantRef = doc(collection(db, "participants"));
    const participant: Omit<Participant, "id"> = {
      eventId: eventRef.id,
      name,
      sessionToken: "",
      rounds: roundsByParticipant.get(name)!,
      currentRoundIndex: 0,
    };
    batch.set(participantRef, participant);
  }

  batch.set(doc(db, "config", "app"), { activeEventId: eventRef.id }, { merge: true });

  await batch.commit();
  return eventRef.id;
}
