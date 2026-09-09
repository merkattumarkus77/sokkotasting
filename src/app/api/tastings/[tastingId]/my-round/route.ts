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
//
// totalRounds is only meaningful for ROUND_ROBIN (fixed N(N-1)/2 up front).
// SWISS_TOURNAMENT's round count is not known in advance (SPEC 6.2: rounds
// are computed lazily as seeding/playoff progress) — totalRounds is null
// and the client shows the current phase instead of a fraction.
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

    const totalRounds =
      tasting.logic === "ROUND_ROBIN" ? pairsPerParticipantCount(tasting.items.length) : null;
    const state = await getParticipantState(session.eventId, tastingId, session.participantId);

    if (!state) {
      return NextResponse.json({ status: "not_started", totalRounds });
    }

    const isDone =
      tasting.logic === "ROUND_ROBIN"
        ? state.currentRoundIndex >= (totalRounds ?? 0)
        : state.phase === "DONE";

    if (isDone) {
      return NextResponse.json({
        status: "done",
        totalRounds,
        completedRounds: totalRounds ?? state.currentRoundIndex,
        // No finalRanking here even for a finished Swiss bracket — SPEC 11.3:
        // results are revealed only once the tasting itself is 'completed'
        // (Vaihe G), never per-participant as soon as their own bracket ends.
      });
    }

    const round = await getCurrentRound(session.eventId, tastingId, session.participantId);
    if (!round) {
      return NextResponse.json({
        status: "done",
        totalRounds,
        completedRounds: totalRounds ?? state.currentRoundIndex,
        // No finalRanking here even for a finished Swiss bracket — SPEC 11.3:
        // results are revealed only once the tasting itself is 'completed'
        // (Vaihe G), never per-participant as soon as their own bracket ends.
      });
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
      phase: state.phase,
      // Server timestamp, needed for the countdown (SPEC 9) — the client
      // must never trust its own clock for this.
      servedAt: round.servedAt,
      hasGuessing: tasting.hasGuessing,
      guessOptions,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
