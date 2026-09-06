import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { handleApiError } from "@/lib/apiResponse";
import { ServeSchema } from "@/lib/apiSchemas";
import { getActiveEvent } from "@/lib/events";
import { markRoundServed } from "@/lib/rounds";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tastingId: string }> }
) {
  try {
    await requireAdmin();
    const { tastingId } = await params;
    const body = ServeSchema.parse(await request.json());

    const event = await getActiveEvent();
    if (!event) {
      return NextResponse.json({ error: "Aktiivista tapahtumaa ei löytynyt." }, { status: 404 });
    }

    await markRoundServed(event.id, tastingId, body.participantId, body.roundId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
