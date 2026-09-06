// Firestore data model (SPEC.md chapter 3).
//
// Paths:
//   config/appConfig
//   events/{eventId}
//   events/{eventId}/participants/{participantId}
//   events/{eventId}/tastings/{tastingId}
//   events/{eventId}/tastings/{tastingId}/participantState/{participantId}
//   events/{eventId}/tastings/{tastingId}/rounds/{roundId}
//   categories/{categoryId}

export interface AppConfig {
  adminUsername: string;
  adminPasswordHash: string; // bcrypt
  eventPasswordHash: string; // bcrypt, shared participant password
  updatedAt: number;
}

export type EventStatus = "active" | "archived";

export interface EventDoc {
  id: string;
  name: string;
  category: string; // free text, e.g. "grillimakkarat"
  categoryId: string; // slug, references /categories/{categoryId}
  status: EventStatus;
  createdAt: number;
  closedAt?: number;
}

export interface ParticipantDoc {
  id: string;
  name: string; // nickname, unique within the event
  nameKey: string; // normalized (trim + lowercase) for uniqueness checks
  activeSessionId: string;
  excludedTastingIds: string[]; // opt-OUT list, not opt-in
  createdAt: number;
  lastActiveAt: number;
}

export interface TastingItem {
  id: string;
  name: string;
  code: string; // "T1", "T2"... organizer-only, see SPEC 5.3
}

export type TastingLogic = "ROUND_ROBIN" | "SWISS_TOURNAMENT";
export type TastingStatus = "pending" | "in_progress" | "completed";
export type PortionUnit = "ml" | "g";

export interface TastingDoc {
  id: string;
  eventId: string;
  name: string;
  logic: TastingLogic;
  items: TastingItem[];
  portionSize: string; // free text for display, e.g. "30 ml"
  portionAmount: number; // for the pre-calculator
  portionUnit: PortionUnit;
  hasGuessing: boolean;
  hasBronzeMatch: boolean;
  timeLimitMinutes: number | null;
  seedingRounds: number; // SWISS only, organizer-configurable 2-4, default 2
  status: TastingStatus;
  statsCommitted: boolean; // idempotence for all-time stats
  createdAt: number;
  completedAt?: number;
}

export type ParticipantTastingPhase = "SEEDING" | "PLAYOFF" | "BRONZE" | "FINAL" | "DONE";

export interface ParticipantTastingState {
  participantId: string;
  phase: ParticipantTastingPhase;
  rngSeed: string; // deterministic draw and tie-break of last resort
  currentRoundIndex: number;
  seedingRoundNumber: number;
  cumulativePoints: Record<string, number>; // itemId -> seeding-stage points (incl. bye credit)
  tastedPoints: Record<string, number>; // itemId -> points from actually tasted pairs
  tastedPairs: Record<string, number>; // itemId -> number of tasted pairs
  metPairs: string[]; // "itemA|itemB" alphabetically sorted, prevents duplicate pairings
  seedOrder?: string[]; // itemId[] by placement, once the seeding stage ends
  bracket?: BracketNode[]; // knockout bracket
  finalRanking?: string[]; // itemId[] from 1st place
  updatedAt: number;
}

export type BracketRoundName = "R64" | "R32" | "R16" | "QF" | "SF" | "FINAL" | "BRONZE";

export interface BracketNode {
  matchId: string; // e.g. "R16-3"
  roundName: BracketRoundName;
  slotA: string | null; // itemId or null (not yet decided)
  slotB: string | null;
  winner: string | null;
  loser: string | null;
  isBye: boolean;
  nextMatchId: string | null;
  nextSlot: "A" | "B" | null;
}

export type RoundStatus = "WAITING_SERVICE" | "SERVED" | "SUBMITTED";
export type RoundPhase = "ROUND_ROBIN" | "SEEDING" | "PLAYOFF" | "BRONZE" | "FINAL";

export interface RoundDoc {
  id: string;
  tastingId: string;
  participantId: string;
  roundIndex: number; // 0-based, presentation order
  itemAId: string;
  itemBId: string;
  status: RoundStatus;
  servedAt: number | null; // server timestamp
  submittedAt: number | null;
  scoreA: number | null; // 0..50; scoreB = 50 - scoreA
  notes: string;
  guessAId?: string | null;
  guessBId?: string | null;
  guessACorrect?: boolean;
  guessBCorrect?: boolean;
  phase: RoundPhase;
  matchId?: string; // SWISS: references a BracketNode
  seedingRoundNumber?: number;
}

export interface CategoryStat {
  itemName: string;
  totalPoints: number;
  totalPossiblePoints: number;
  normalizedPercentage: number;
  eventCount: number;
  participantCount: number;
}

export interface CategoryDoc {
  id: string; // slug
  name: string;
  knownItems: string[];
  stats: CategoryStat[];
  updatedAt: number;
}
