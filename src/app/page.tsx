"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

type ConnectionStatus = "checking" | "ok" | "error";

export default function Home() {
  const [status, setStatus] = useState<ConnectionStatus>("checking");
  const [message, setMessage] = useState("Yhdistetään Firestoreen...");

  useEffect(() => {
    let cancelled = false;

    async function testConnection() {
      try {
        const snapshot = await getDoc(doc(db, "config", "app"));
        if (cancelled) return;
        setStatus("ok");
        setMessage(
          snapshot.exists()
            ? "Yhteys Firestoreen toimii. config/app löytyi."
            : "Yhteys Firestoreen toimii. config/app-dokumenttia ei ole vielä luotu."
        );
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setMessage(
          error instanceof Error ? error.message : "Tuntematon virhe Firestore-yhteydessä."
        );
      }
    }

    testConnection();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Sokkotasting</h1>
        <p className="text-muted">Vaihe 0: projektin alustus</p>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 text-left">
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              status === "checking"
                ? "bg-muted animate-pulse"
                : status === "ok"
                  ? "bg-success"
                  : "bg-danger"
            }`}
          />
          <span className="text-sm font-medium">
            {status === "checking" && "Tarkistetaan Firebase-yhteyttä..."}
            {status === "ok" && "Firebase-yhteys OK"}
            {status === "error" && "Firebase-yhteys epäonnistui"}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted">{message}</p>
      </div>
    </main>
  );
}
