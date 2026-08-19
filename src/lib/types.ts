// Firestore-tietomalli (kokoelmat: config, events, participants, scores)

export interface AppConfig {
  password: string;
  activeEventId?: string;
}

export type EventStatus = "active" | "finished";

export interface TastingEvent {
  id: string;
  name: string;
  category: string;
  /** Tuotteiden oikeat nimet, indeksi = tuotteen tunniste kierroksilla ja pisteissä. */
  productNames: string[];
  participantNames: string[];
  /** Kerta-annoksen koko, esim. { value: 30, unit: "ml" }. */
  portionSizeValue: number;
  portionSizeUnit: string;
  guessingEnabled: boolean;
  pairsPerParticipant: number;
  status: EventStatus;
  createdAt: number;
  finishedAt?: number;
}

/** Yksi osallistujalle arvottu tuotepari yhdellä kierroksella. */
export interface Round {
  index: number;
  productAIndex: number;
  productBIndex: number;
  served: boolean;
  completed: boolean;
}

export interface Participant {
  id: string;
  eventId: string;
  name: string;
  sessionToken: string;
  rounds: Round[];
  currentRoundIndex: number;
}

export interface Score {
  id: string;
  eventId: string;
  participantId: string;
  roundIndex: number;
  productAIndex: number;
  productBIndex: number;
  pointsA: number;
  pointsB: number;
  notes: string;
  guessAIndex?: number;
  guessBIndex?: number;
  submittedAt: number;
}
