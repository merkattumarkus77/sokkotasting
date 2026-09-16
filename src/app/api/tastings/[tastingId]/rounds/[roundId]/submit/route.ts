import { NextRequest, NextResponse } from "next/server";
import { requireActiveParticipant } from "@/lib/apiAuth";
import { handleApiError } from "@/lib/apiResponse";
import { SubmitRoundSchema } from "@/lib/apiSchemas";
import { getParticipant } from "@/lib/participants";
import { submitRound } from "@/lib/rounds";
import { getTasting } from "@/lib/tastings";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tastingId: string; roundId: string }> }
) {
  try {
    const session = await requireActiveParticipant();
    const { tastingId, roundId } = await params;
    const body = SubmitRoundSchema.parse(await request.json());

    const tasting = await getTasting(session.eventId, tastingId);
    if (!tasting) {
      return NextResponse.json({ error: "Tastingia ei löytynyt." }, { status: 404 });
    }

    const participant = await getParticipant(session.eventId, session.participantId);
    if (!participant) {
      return NextResponse.json({ error: "Osallistujaa ei löytynyt." }, { status: 404 });
    }

    await submitRound(session.eventId, tasting, participant, body, roundId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
