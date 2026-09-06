import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "@/lib/apiAuth";
import { ActiveEventExistsError } from "@/lib/events";
import {
  RoundAlreadySubmittedError,
  RoundMismatchError,
  RoundNotServedError,
  SwissNotImplementedError,
} from "@/lib/rounds";
import { MaxTastingsReachedError } from "@/lib/tastings";

const NOT_FOUND_MESSAGES = new Set([
  "TASTING_NOT_FOUND",
  "STATE_NOT_FOUND",
  "ROUND_NOT_FOUND",
  "PARTICIPANT_NOT_FOUND",
]);

/** Maps a thrown error from the lib/ layer to a JSON API response. */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Virheellinen pyyntö.", issues: error.issues },
      { status: 400 }
    );
  }
  if (error instanceof ActiveEventExistsError) {
    return NextResponse.json(
      { error: "ACTIVE_EVENT_EXISTS", activeEvent: error.activeEvent },
      { status: 409 }
    );
  }
  if (error instanceof MaxTastingsReachedError) {
    return NextResponse.json(
      { error: "Tapahtumalla voi olla enintään 5 rinnakkaista tastingia." },
      { status: 409 }
    );
  }
  if (error instanceof RoundAlreadySubmittedError) {
    return NextResponse.json({ error: "Kierros on jo lähetetty." }, { status: 409 });
  }
  if (error instanceof RoundNotServedError) {
    return NextResponse.json({ error: "Kierrosta ei ole vielä tarjoiltu." }, { status: 409 });
  }
  if (error instanceof RoundMismatchError) {
    return NextResponse.json(
      { error: "Kierros on vaihtunut. Lataa sivu uudelleen." },
      { status: 409 }
    );
  }
  if (error instanceof SwissNotImplementedError) {
    return NextResponse.json(
      { error: "Sveitsiläinen turnauskaavio ei ole vielä käytössä." },
      { status: 501 }
    );
  }
  if (error instanceof Error && NOT_FOUND_MESSAGES.has(error.message)) {
    return NextResponse.json({ error: "Resurssia ei löytynyt." }, { status: 404 });
  }
  if (error instanceof Error && error.message === "EMPTY_NAME") {
    return NextResponse.json({ error: "Anna nimi." }, { status: 400 });
  }

  console.error(error);
  return NextResponse.json({ error: "Palvelinvirhe." }, { status: 500 });
}
