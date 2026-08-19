"use client";

import { useState, type FormEvent } from "react";
import { checkPassword } from "@/lib/config";

type Status = "idle" | "checking" | "ok" | "error";

export default function PasswordCheck({ label }: { label: string }) {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("checking");
    try {
      const valid = await checkPassword(password);
      if (valid) {
        setStatus("ok");
        setMessage("Salasana hyväksytty.");
      } else {
        setStatus("error");
        setMessage("Väärä salasana.");
      }
    } catch {
      setStatus("error");
      setMessage(
        "Yhteys tietokantaan epäonnistui. Onko .env.local täytetty ja config/app-dokumentti luotu?"
      );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
      <label className="flex flex-col gap-1 text-left text-sm">
        {label}
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
        disabled={status === "checking" || password.length === 0}
        className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-foreground disabled:opacity-50"
      >
        {status === "checking" ? "Tarkistetaan..." : "Kirjaudu"}
      </button>
      {message && (
        <p className={`text-sm ${status === "ok" ? "text-success" : "text-danger"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
