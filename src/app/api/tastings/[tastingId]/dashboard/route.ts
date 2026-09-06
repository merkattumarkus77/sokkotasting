import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { handleApiError } from "@/lib/apiResponse";
import { getActiveEvent } from "@/lib/events";
import { listParticipants } from "@/lib/participants";
import { pairsPerParticipantCount } from "@/lib/roundRobin";
import { getCurrentRound, getParticipantState } from "@/lib/rounds";
import { getTasting } from "@/lib/tastings";

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
    const totalRounds = pairsPerParticipantCount(tasting.items.length);
    const participants = await listParticipants(event.id);

    const entries = await Promise.all(
      participants
        .filter((participant) => !participant.excludedTastingIds.includes(tastingId))
        .map(async (participant) => {
          const base = { participantId: participant.id, name: participant.name, totalRounds };
          const state = await getParticipantState(event.id, tastingId, participant.id);

          if (!state || state.currentRoundIndex >= totalRounds) {
            return {
              ...base,
              status: state ? ("done" as const) : ("not_started" as const),
              completedRounds: state ? totalRounds : 0,
            };
          }

          const round = await getCurrentRound(event.id, tastingId, participant.id);
          if (!round) {
            return { ...base, status: "done" as const, completedRounds: totalRounds };
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
