import { NextResponse } from "next/server";
import { requireParticipant } from "@/lib/apiAuth";
import { handleApiError } from "@/lib/apiResponse";
import { getParticipant } from "@/lib/participants";
import { ensureRounds } from "@/lib/rounds";
import { getTasting } from "@/lib/tastings";

export async function POST(
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
    if (tasting.status !== "in_progress") {
      return NextResponse.json({ error: "Tasting ei ole käynnissä." }, { status: 409 });
    }

    const participant = await getParticipant(session.eventId, session.participantId);
    if (!participant) {
      return NextResponse.json({ error: "Osallistujaa ei löytynyt." }, { status: 404 });
    }
    if (participant.excludedTastingIds.includes(tastingId)) {
      return NextResponse.json({ error: "Et osallistu tähän tastingiin." }, { status: 403 });
    }

    await ensureRounds(session.eventId, tasting, participant);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
