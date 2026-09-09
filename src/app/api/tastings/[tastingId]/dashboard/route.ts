import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { handleApiError } from "@/lib/apiResponse";
import { getActiveEvent } from "@/lib/events";
import { listParticipants } from "@/lib/participants";
import { pairsPerParticipantCount } from "@/lib/roundRobin";
import { getCurrentRound, getParticipantState } from "@/lib/rounds";
import { getTasting } from "@/lib/tastings";
import type { ParticipantTastingState, TastingDoc } from "@/lib/types";

// totalRounds is only meaningful for ROUND_ROBIN — SWISS_TOURNAMENT's count
// isn't known in advance (SPEC 6.2), so it stays null and "done" is read
// from participantState.phase instead of a round-index/total comparison.
function isParticipantDone(tasting: TastingDoc, state: ParticipantTastingState, totalRounds: number | null): boolean {
  if (tasting.logic === "ROUND_ROBIN") return state.currentRoundIndex >= (totalRounds ?? 0);
  return state.phase === "DONE";
}

// Admin-only, real product names included. Not exposed via onSnapshot — see
// firestore.rules — so the dashboard polls this instead of subscribing.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tastingId: string }> }
) {
  try {
    await requireAdmin();
    const { tastingId } = await params;

    const event = await getActiveEvent();
    if (!event) {
      return NextResponse.json({ error: "Aktiivista tapahtumaa ei löytynyt." }, { status: 404 });
    }

    const tasting = await getTasting(event.id, tastingId);
    if (!tasting) {
      return NextResponse.json({ error: "Tastingia ei löytynyt." }, { status: 404 });
    }

    const itemsById = new Map(tasting.items.map((item) => [item.id, item]));
    const totalRounds =
      tasting.logic === "ROUND_ROBIN" ? pairsPerParticipantCount(tasting.items.length) : null;
    const participants = await listParticipants(event.id);

    const entries = await Promise.all(
      participants
        .filter((participant) => !participant.excludedTastingIds.includes(tastingId))
        .map(async (participant) => {
          const base = { participantId: participant.id, name: participant.name, totalRounds };
          const state = await getParticipantState(event.id, tastingId, participant.id);

          if (!state || isParticipantDone(tasting, state, totalRounds)) {
            return {
              ...base,
              status: state ? ("done" as const) : ("not_started" as const),
              completedRounds: state ? (totalRounds ?? state.currentRoundIndex) : 0,
            };
          }

          const round = await getCurrentRound(event.id, tastingId, participant.id);
          if (!round) {
            return {
              ...base,
              status: "done" as const,
              completedRounds: totalRounds ?? state.currentRoundIndex,
            };
          }

          if (round.status === "WAITING_SERVICE") {
            return {
              ...base,
              status: "waiting_service" as const,
              completedRounds: state.currentRoundIndex,
              nextRound: {
                roundId: round.id,
                itemAName: itemsById.get(round.itemAId)?.name ?? "?",
                itemBName: itemsById.get(round.itemBId)?.name ?? "?",
              },
            };
          }

          return { ...base, status: "tasting" as const, completedRounds: state.currentRoundIndex };
        })
    );

    return NextResponse.json({ tasting, entries });
  } catch (error) {
    return handleApiError(error);
  }
}
