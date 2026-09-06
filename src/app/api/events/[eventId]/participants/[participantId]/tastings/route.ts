import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { handleApiError } from "@/lib/apiResponse";
import { ParticipantExclusionSchema } from "@/lib/apiSchemas";
import { setParticipantExclusion } from "@/lib/participants";

// SPEC 2.4 opt-in/opt-out endpoint. SPEC 3: excludedTastingIds is an
// opt-OUT list, so `excluded: true` adds the tasting to it.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; participantId: string }> }
) {
  try {
    await requireAdmin();
    const { eventId, participantId } = await params;
    const body = ParticipantExclusionSchema.parse(await request.json());
    await setParticipantExclusion(eventId, participantId, body.tastingId, body.excluded);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
