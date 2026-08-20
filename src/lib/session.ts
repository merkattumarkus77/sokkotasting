// Osallistujan istunnon säilytys selaimen localStoragessa (Vaihe 3).

export interface StoredSession {
  eventId: string;
  participantId: string;
  participantName: string;
  sessionToken: string;
}

const STORAGE_KEY = "sokkotasting_session";

export function saveSession(session: StoredSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function loadSession(): StoredSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
