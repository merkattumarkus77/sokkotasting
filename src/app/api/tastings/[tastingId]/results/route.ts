import { NextResponse } from "next/server";
import { getSession, requireActiveParticipant } from "@/lib/apiAuth";
import { handleApiError } from "@/lib/apiResponse";
import { getActiveEvent } from "@/lib/events";
import { pickGuessingEndMessage } from "@/lib/guessing";
import { computeEventGuessingRanking, computeTastingResults } from "@/lib/results";

/**
 * SPEC 11.3: participants only ever see results once the tasting is
 * 'completed' — 403 before that, because a motivated participant could
 * otherwise read other people's scores mid-tasting. Admin can see the group
 * ranking and full data at any time (SPEC 11.2: "näkyy järjestäjälle jo
 * ennen julkaisua"), including real item names, which is fine — the admin
 * already sees those everywhere else too.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tastingId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Kirjaudu ensin." }, { status: 401 });
    }

    const { tastingId } = await params;

    let eventId: string;
    if (session.role === "admin") {
      const event = await getActiveEvent();
      if (!event) {
        return NextResponse.json({ error: "Aktiivista tapahtumaa ei löytynyt." }, { status: 404 });
      }
      eventId = event.id;
    } else {
      await requireActiveParticipant();
      eventId = session.eventId;
    }

    const results = await computeTastingResults(eventId, tastingId);
    if (!results) {
      return NextResponse.json({ error: "Tastingia ei löytynyt." }, { status: 404 });
    }

    if (session.role === "participant" && results.tasting.status !== "completed") {
      return NextResponse.json({ error: "Tuloksia ei ole vielä julkaistu." }, { status: 403 });
    }

    const eventGuessingRanking = results.tasting.hasGuessing
      ? await computeEventGuessingRanking(eventId)
      : [];

    if (session.role === "admin") {
      return NextResponse.json({
        tastingName: results.tasting.name,
        eventName: results.event.name,
        status: results.tasting.status,
        groupRanking: results.groupRanking,
        participantScores: results.participantScores,
        notes: results.notes,
        guessingRanking: results.guessingRanking,
        eventGuessingRanking,
      });
    }

    const own = results.participantScores.find((p) => p.participantId === session.participantId);
    const ownNotes = results.notes.filter((n) => n.participantId === session.participantId);

    const averageCorrect =
      results.guessingRanking.length > 0
        ? results.guessingRanking.reduce((sum, r) => sum + r.correctGuesses, 0) /
          results.guessingRanking.length
        : 0;
    const myRankIndex = results.guessingRanking.findIndex(
      (r) => r.participantId === session.participantId
    );
    const guessingEndMessage =
      results.tasting.hasGuessing && myRankIndex >= 0
        ? pickGuessingEndMessage(results.guessingRanking[myRankIndex]!, myRankIndex, averageCorrect)
        : null;

    return NextResponse.json({
      tastingName: results.tasting.name,
      eventName: results.event.name,
      status: results.tasting.status,
      groupRanking: results.groupRanking,
      ownScores: own?.scores ?? [],
      ownNotes,
      guessingRanking: results.guessingRanking,
      eventGuessingRanking,
      guessingEndMessage,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
