import { NextRequest, NextResponse } from "next/server";
import { getSession, requireAdmin } from "@/lib/apiAuth";
import { handleApiError } from "@/lib/apiResponse";
import { CreateTastingSchema } from "@/lib/apiSchemas";
import { getActiveEvent } from "@/lib/events";
import { getParticipant } from "@/lib/participants";
import { createTasting, listTastings } from "@/lib/tastings";
import type { TastingDoc } from "@/lib/types";

// Participants must never receive item real names/codes (SPEC 5.3) — the
// tasting document itself is not client-readable via Firestore for exactly
// this reason (see firestore.rules), so both roles fetch it through here.
// `excluded` reflects this specific participant's own opt-out (SPEC 3), so
// the card list can show the "Et osallistu" state (SPEC 11.2).
function sanitizeForParticipant(
  tasting: TastingDoc,
  excludedTastingIds: string[]
): Omit<TastingDoc, "items"> & { excluded: boolean } {
  return {
    id: tasting.id,
    eventId: tasting.eventId,
    name: tasting.name,
    logic: tasting.logic,
    portionSize: tasting.portionSize,
    portionAmount: tasting.portionAmount,
    portionUnit: tasting.portionUnit,
    hasGuessing: tasting.hasGuessing,
    hasBronzeMatch: tasting.hasBronzeMatch,
    timeLimitMinutes: tasting.timeLimitMinutes,
    seedingRounds: tasting.seedingRounds,
    status: tasting.status,
    statsCommitted: tasting.statsCommitted,
    createdAt: tasting.createdAt,
    completedAt: tasting.completedAt,
    excluded: excludedTastingIds.includes(tasting.id),
  };
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Kirjaudu ensin." }, { status: 401 });
    }

    const event = await getActiveEvent();
    if (!event) {
      return NextResponse.json({ tastings: [] });
    }

    const tastings = await listTastings(event.id);

    if (session.role === "admin") {
      return NextResponse.json({ tastings });
    }

    const participant = await getParticipant(session.eventId, session.participantId);
    const excludedTastingIds = participant?.excludedTastingIds ?? [];
    return NextResponse.json({
      tastings: tastings.map((tasting) => sanitizeForParticipant(tasting, excludedTastingIds)),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = CreateTastingSchema.parse(await request.json());

    const event = await getActiveEvent();
    if (!event) {
      return NextResponse.json({ error: "Luo ensin tapahtuma." }, { status: 404 });
    }

    const tastingId = await createTasting(event.id, body);
    return NextResponse.json({ tastingId }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
