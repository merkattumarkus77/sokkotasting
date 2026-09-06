import { NextResponse } from "next/server";
import { requireParticipant } from "@/lib/apiAuth";
import { handleApiError } from "@/lib/apiResponse";
import { pairsPerParticipantCount } from "@/lib/roundRobin";
import { getCurrentRound, getGuessCounts, getParticipantState } from "@/lib/rounds";
import { getTasting } from "@/lib/tastings";

// Participant-only. Never includes itemAId/itemBId or which item is A/B —
// only guessOptions (id+name, unordered) when guessing is on, so the
// participant can pick from real names without learning what is in front
// of them (SPEC 5.3/8). Polled instead of onSnapshot — see firestore.rules.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tastingId: string }> }
) {
  try {
    const session = await requireParticipant();
    const { tastingId } = await params;

    const tasting = await getTasting(session.eventId, tastingId);
    if (!tasting) {
      return NextResponse.json({ error: "Tastingia ei löytynyt." }, { status: 404 });
    }

    const totalRounds = pairsPerParticipantCount(tasting.items.length);
    const state = await getParticipantState(session.eventId, tastingId, session.participantId);

    if (!state) {
      return NextResponse.json({ status: "not_started", totalRounds });
    }
    if (state.currentRoundIndex >= totalRounds) {
      return NextResponse.json({ status: "done", totalRounds, completedRounds: totalRounds });
    }

    const round = await getCurrentRound(session.eventId, tastingId, session.participantId);
    if (!round) {
      return NextResponse.json({ status: "done", totalRounds, completedRounds: totalRounds });
    }

    let guessOptions: { id: string; name: string; guessedCount: number }[] | undefined;
    if (tasting.hasGuessing) {
      const guessCounts = await getGuessCounts(session.eventId, tastingId, session.participantId);
      guessOptions = tasting.items.map((item) => ({
        id: item.id,
        name: item.name,
        guessedCount: guessCounts[item.id] ?? 0,
      }));
    }

    return NextResponse.json({
      status: round.status === "SERVED" ? "serving" : "waiting_service",
      roundId: round.id,
      roundIndex: round.roundIndex,
      totalRounds,
      completedRounds: state.currentRoundIndex,
      hasGuessing: tasting.hasGuessing,
      guessOptions,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
