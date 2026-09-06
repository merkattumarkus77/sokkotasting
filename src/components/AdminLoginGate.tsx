"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

type Status = "checking" | "login" | "authorized";

export default function AdminLoginGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((data) => setStatus(data.session?.role === "admin" ? "authorized" : "login"))
      .catch(() => setStatus("login"));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "admin", username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Kirjautuminen epäonnistui.");
        return;
      }
      setStatus("authorized");
    } catch {
      setError("Yhteys palvelimeen epäonnistui.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "checking") {
    return <p className="text-sm text-muted">Ladataan...</p>;
  }

  if (status === "login") {
    return (
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
        <label className="flex flex-col gap-1 text-left text-sm">
          Tunnus
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent"
            autoComplete="username"
          />
        </label>
        <label className="flex flex-col gap-1 text-left text-sm">
          Salasana
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent"
            autoComplete="current-password"
          />
        </label>
        <button
          type="submit"
          disabled={submitting || !username.trim() || password.length === 0}
          className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-foreground disabled:opacity-50"
        >
          {submitting ? "Kirjaudutaan..." : "Kirjaudu"}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    );
  }

  return <>{children}</>;
}
