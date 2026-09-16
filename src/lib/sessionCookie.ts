import "server-only";
import { jwtVerify, SignJWT } from "jose";

// HttpOnly session cookie (SPEC 2.3). Signed, not encrypted — never put a
// secret inside the payload, only identifiers needed to authorize a request.

export const SESSION_COOKIE_NAME = "sokkotasting_session";
const SESSION_TTL_SECONDS = 24 * 60 * 60;

export interface AdminSessionPayload {
  role: "admin";
}

export interface ParticipantSessionPayload {
  role: "participant";
  eventId: string;
  participantId: string;
  sessionId: string;
}

export type SessionPayload = AdminSessionPayload | ParticipantSessionPayload;

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET puuttuu ympäristömuuttujista. Lisää se .env.local-tiedostoon " +
        "(ks. .env.local.example)."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.role !== "admin" && payload.role !== "participant") return null;
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_MAX_AGE_SECONDS = SESSION_TTL_SECONDS;
