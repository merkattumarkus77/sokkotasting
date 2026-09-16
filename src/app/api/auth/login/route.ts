import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/apiAuth";
import { handleApiError } from "@/lib/apiResponse";
import { LoginSchema } from "@/lib/apiSchemas";
import { checkAdminPassword, checkEventPassword } from "@/lib/config";
import { getActiveEvent } from "@/lib/events";
import { loginParticipant } from "@/lib/participants";

export async function POST(request: NextRequest) {
  try {
    const body = LoginSchema.parse(await request.json());

    if (body.mode === "admin") {
      const valid = await checkAdminPassword(body.username, body.password);
      if (!valid) {
        return NextResponse.json({ error: "Väärä tunnus tai salasana." }, { status: 401 });
      }
      await setSessionCookie({ role: "admin" });
      return NextResponse.json({ role: "admin" });
    }

    const validPassword = await checkEventPassword(body.password);
    if (!validPassword) {
      return NextResponse.json({ error: "Väärä salasana." }, { status: 401 });
    }

    const event = await getActiveEvent();
    if (!event) {
      return NextResponse.json(
        { error: "Aktiivista tapahtumaa ei ole käynnissä juuri nyt." },
        { status: 404 }
      );
    }

    const { participant, sessionId } = await loginParticipant(event.id, body.nickname);
    await setSessionCookie({
      role: "participant",
      eventId: event.id,
      participantId: participant.id,
      sessionId,
    });
    return NextResponse.json({
      role: "participant",
      eventId: event.id,
      participantId: participant.id,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
