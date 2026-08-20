import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { checkPassword } from "@/lib/config";
import { getActiveEvent } from "@/lib/events";
import type { Participant, TastingEvent } from "@/lib/types";

export async function findParticipantByName(
  eventId: string,
  name: string
): Promise<Participant | null> {
  const q = query(
    collection(db, "participants"),
    where("eventId", "==", eventId),
    where("name", "==", name)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const found = snapshot.docs[0]!;
  return { id: found.id, ...found.data() } as Participant;
}

export interface LoginResult {
  event: TastingEvent;
  participant: Participant;
  sessionToken: string;
}

/**
 * Kirjaa osallistujan sisään: tarkistaa yhteisen salasanan, etsii osallistujan
 * nimellä aktiivisesta tapahtumasta, ja arpoo uuden sessiotokenin — tämä
 * mitätöi automaattisesti minkä tahansa aiemman istunnon samalla nimellä,
 * koska muut laitteet vertaavat tallennettua tokeniaan tähän dokumenttiin.
 */
export async function loginParticipant(
  name: string,
  password: string
): Promise<LoginResult> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Anna nimi.");

  const valid = await checkPassword(password);
  if (!valid) throw new Error("Väärä salasana.");

  const event = await getActiveEvent();
  if (!event) throw new Error("Aktiivista tastingia ei ole käynnissä juuri nyt.");

  const participant = await findParticipantByName(event.id, trimmedName);
  if (!participant) {
    throw new Error(`Nimeä "${trimmedName}" ei löytynyt tästä tastingista.`);
  }

  const sessionToken = crypto.randomUUID();
  await updateDoc(doc(db, "participants", participant.id), { sessionToken });

  return { event, participant: { ...participant, sessionToken }, sessionToken };
}

/** Kuuntelee osallistujadokumenttia reaaliajassa (tarjoilun kuittaus, sessiotokenin vaihtuminen). */
export function subscribeToParticipant(
  participantId: string,
  onChange: (participant: Participant | null) => void
): () => void {
  return onSnapshot(doc(db, "participants", participantId), (snapshot) => {
    if (!snapshot.exists()) {
      onChange(null);
      return;
    }
    onChange({ id: snapshot.id, ...snapshot.data() } as Participant);
  });
}

/** Kuuntelee reaaliajassa kaikkia tapahtuman osallistujia (järjestäjän dashboard). */
export function subscribeToEventParticipants(
  eventId: string,
  onChange: (participants: Participant[]) => void
): () => void {
  const q = query(collection(db, "participants"), where("eventId", "==", eventId));
  return onSnapshot(q, (snapshot) => {
    const list = snapshot.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as Participant
    );
    list.sort((a, b) => a.name.localeCompare(b.name, "fi"));
    onChange(list);
  });
}

/**
 * Kuittaa osallistujan nykyisen kierroksen tarjoilluksi. Lukee ja kirjoittaa koko
 * rounds-taulukon, koska Firestore ei tue yksittäisen taulukkoalkion osittaista
 * päivitystä kenttäpolulla.
 */
export async function markCurrentRoundServed(participant: Participant): Promise<void> {
  const updatedRounds = participant.rounds.map((r, i) =>
    i === participant.currentRoundIndex ? { ...r, served: true } : r
  );
  await updateDoc(doc(db, "participants", participant.id), { rounds: updatedRounds });
}
