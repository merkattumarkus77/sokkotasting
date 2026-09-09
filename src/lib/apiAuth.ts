import "server-only";
import { cookies } from "next/headers";
import { getEvent } from "@/lib/events";
import {
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
  signSession,
  verifySession,
  type AdminSessionPayload,
  type ParticipantSessionPayload,
  type SessionPayload,
} from "@/lib/sessionCookie";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function requireAdmin(): Promise<AdminSessionPayload> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    throw new ApiError(401, "Kirjaudu järjestäjänä ensin.");
  }
  return session;
}

export async function requireParticipant(): Promise<ParticipantSessionPayload> {
  const session = await getSession();
  if (!session || session.role !== "participant") {
    throw new ApiError(401, "Kirjaudu osallistujana ensin.");
  }
  return session;
}

/**
 * SPEC 4.3: closing an event must invalidate its participants' sessions
 * "seuraavalla API-kutsulla" — the JWT itself stays valid for its full TTL
 * (jose has no built-in revocation), so every participant-authenticated
 * route must re-check the event's status here instead of trusting the
 * cookie alone.
 */
export async function requireActiveParticipant(): Promise<ParticipantSessionPayload> {
  const session = await requireParticipant();
  const event = await getEvent(session.eventId);
  if (!event || event.status !== "active") {
    throw new ApiError(401, "Tapahtuma on suljettu. Kirjaudu uudelleen.");
  }
  return session;
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await signSession(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}
