import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { handleApiError } from "@/lib/apiResponse";
import { PatchEventSchema } from "@/lib/apiSchemas";
import { adminDb } from "@/lib/firebaseAdmin";
import { archiveEvent, getEvent } from "@/lib/events";

// SPEC 4.3 "Sulje tapahtuma": status -> 'archived'. Any pending tastings
// under the event are cascaded to 'completed' with no stats (SPEC 14) —
// see lib/events.ts's archiveEvent(). Idempotent: archiving twice is a
// no-op, matching CLAUDE.md rule 5.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    await requireAdmin();
    const { eventId } = await params;
    const body = PatchEventSchema.parse(await request.json());

    const event = await getEvent(eventId);
    if (!event) {
      return NextResponse.json({ error: "Tapahtumaa ei löytynyt." }, { status: 404 });
    }

    if (body.name) {
      await adminDb.collection("events").doc(eventId).update({ name: body.name });
    }
    if (body.status === "archived") {
      await archiveEvent(eventId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
