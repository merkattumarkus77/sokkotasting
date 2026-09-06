import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { handleApiError } from "@/lib/apiResponse";
import { getActiveEvent } from "@/lib/events";
import { markAllPendingServed } from "@/lib/rounds";

// Not in SPEC 2.4's endpoint list verbatim, but SPEC 5.2 explicitly requires
// a "Kuittaa kaikki odottavat" bulk action once there are 10+ participants.
export async function POST(
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
    const servedCount = await markAllPendingServed(event.id, tastingId);
    return NextResponse.json({ servedCount });
  } catch (error) {
    return handleApiError(error);
  }
}
