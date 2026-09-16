import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { handleApiError } from "@/lib/apiResponse";
import { getActiveEvent } from "@/lib/events";
import { completeTasting } from "@/lib/tastings";

// SPEC 5 "Päätä tasting ja julkaise" + SPEC 13 all-time stats, both in one
// idempotent transaction (lib/tastings.ts) — a double-click can't double
// the stats or error out.
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

    await completeTasting(event.id, tastingId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
