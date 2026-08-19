"use client";

import { useState, type FormEvent } from "react";
import { checkPassword } from "@/lib/config";
import { createEvent, getActiveEvent } from "@/lib/events";
import { pairsPerParticipantCount } from "@/lib/roundRobin";
import type { TastingEvent } from "@/lib/types";
import NameListInput from "@/components/NameListInput";

type Step = "password" | "form" | "success";

export default function OrganizerCreateEvent() {
  const [step, setStep] = useState<Step>("password");

  const [password, setPassword] = useState("");
  const [passwordChecking, setPasswordChecking] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const [activeEvent, setActiveEvent] = useState<TastingEvent | null>(null);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [participantNames, setParticipantNames] = useState(["", ""]);
  const [productNames, setProductNames] = useState(["", ""]);
  const [portionSizeValue, setPortionSizeValue] = useState(30);
  const [portionSizeUnit, setPortionSizeUnit] = useState("ml");
  const [guessingEnabled, setGuessingEnabled] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [createdEventId, setCreatedEventId] = useState("");

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setPasswordChecking(true);
    setPasswordError("");
    try {
      const valid = await checkPassword(password);
      if (!valid) {
        setPasswordError("Väärä salasana.");
        return;
      }
      const existing = await getActiveEvent();
      setActiveEvent(existing);
      setStep("form");
    } catch {
      setPasswordError(
        "Yhteys tietokantaan epäonnistui. Onko .env.local täytetty ja config/app-dokumentti luotu?"
      );
    } finally {
      setPasswordChecking(false);
    }
  }

  const trimmedParticipants = participantNames.map((n) => n.trim()).filter(Boolean);
  const trimmedProducts = productNames.map((n) => n.trim()).filter(Boolean);
  const productCount = trimmedProducts.length;
  const participantCount = trimmedParticipants.length;
  const pairsPerParticipant = productCount >= 2 ? pairsPerParticipantCount(productCount) : 0;
  const perProductPerParticipant = productCount >= 2 ? productCount - 1 : 0;
  const perProductTotal = participantCount * perProductPerParticipant * portionSizeValue;

  function validate(): string | null {
    if (!name.trim()) return "Anna tastingille nimi.";
    if (!category.trim()) return "Anna kategoria.";
    if (trimmedParticipants.length < 2) return "Osallistujia on oltava vähintään kaksi.";
    if (new Set(trimmedParticipants).size !== trimmedParticipants.length)
      return "Osallistujien nimet eivät voi toistua.";
    if (trimmedProducts.length < 2) return "Tuotteita on oltava vähintään kaksi.";
    if (new Set(trimmedProducts).size !== trimmedProducts.length)
      return "Tuotteiden nimet eivät voi toistua.";
    if (!(portionSizeValue > 0)) return "Anna kerta-annoksen koko.";
    if (activeEvent && activeEvent.status === "active" && !overrideConfirmed)
      return "Vahvista, että edellinen kesken oleva tasting saa siirtyä historiaan.";
    return null;
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }
    setSubmitError("");
    setSubmitting(true);
    try {
      const eventId = await createEvent({
        name: name.trim(),
        category: category.trim(),
        participantNames: trimmedParticipants,
        productNames: trimmedProducts,
        portionSizeValue,
        portionSizeUnit,
        guessingEnabled,
      });
      setCreatedEventId(eventId);
      setStep("success");
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Tastingin luonti epäonnistui."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "password") {
    return (
      <form onSubmit={handlePasswordSubmit} className="flex w-full max-w-sm flex-col gap-3">
        <label className="flex flex-col gap-1 text-left text-sm">
          Yhteinen salasana
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
          disabled={passwordChecking || password.length === 0}
          className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-foreground disabled:opacity-50"
        >
          {passwordChecking ? "Tarkistetaan..." : "Jatka"}
        </button>
        {passwordError && <p className="text-sm text-danger">{passwordError}</p>}
      </form>
    );
  }

  if (step === "success") {
    return (
      <div className="flex w-full max-w-md flex-col gap-3 rounded-xl border border-border bg-surface p-5 text-left">
        <p className="text-success font-medium">Tasting luotu onnistuneesti.</p>
        <p className="text-sm text-muted">Tapahtuman tunnus: {createdEventId}</p>
        <ul className="text-sm text-muted list-disc pl-5">
          <li>{participantCount} osallistujaa</li>
          <li>{productCount} tuotetta, {pairsPerParticipant} paria per osallistuja</li>
          <li>
            Jokaisen osallistujan kierrokset arvottiin ja tarkistettiin erikseen: jokainen
            teoreettinen pari löytyy tarkalleen kerran.
          </li>
        </ul>
        <p className="text-sm text-muted">
          Järjestäjän dashboard (tarjoilulista, kuittaukset) rakennetaan seuraavassa vaiheessa.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleCreate} className="flex w-full max-w-md flex-col gap-6 text-left">
      {activeEvent && activeEvent.status === "active" && (
        <div className="flex flex-col gap-2 rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm">
          <p>
            Käynnissä on jo tasting &quot;{activeEvent.name}&quot;, jota ei ole merkitty
            valmiiksi. Uuden aloittaminen siirtää sen historiaan ja aktiiviseksi tastingiksi
            tulee tämä uusi.
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={overrideConfirmed}
              onChange={(e) => setOverrideConfirmed(e.target.checked)}
            />
            Ymmärrän, aloita silti uusi
          </label>
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm">
        Tastingin nimi
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-accent"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Kategoria
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="esim. grillimakkarat"
          className="rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-accent"
        />
      </label>

      <NameListInput
        label="Osallistujat"
        values={participantNames}
        onChange={setParticipantNames}
        placeholder="Osallistuja"
        minItems={2}
      />

      <NameListInput
        label="Maisteltavat tuotteet"
        values={productNames}
        onChange={setProductNames}
        placeholder="Tuote"
        minItems={2}
      />

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Kerta-annoksen koko
          <input
            type="number"
            min={1}
            value={portionSizeValue}
            onChange={(e) => setPortionSizeValue(Number(e.target.value))}
            className="rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-accent"
          />
        </label>
        <label className="flex w-24 flex-col gap-1 text-sm">
          Yksikkö
          <select
            value={portionSizeUnit}
            onChange={(e) => setPortionSizeUnit(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-accent"
          >
            <option value="ml">ml</option>
            <option value="g">g</option>
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={guessingEnabled}
          onChange={(e) => setGuessingEnabled(e.target.checked)}
        />
        Arvausominaisuus päällä
      </label>

      <div className="rounded-lg border border-border bg-surface p-4 text-sm">
        <p className="mb-2 font-medium">Suunnittelutyökalu</p>
        <ul className="flex flex-col gap-1 text-muted">
          <li>Paria per osallistuja: {pairsPerParticipant || "–"}</li>
          <li>
            Kutakin tuotetta tarvitaan per osallistuja: {perProductPerParticipant || "–"} annosta
          </li>
          <li>
            Kutakin tuotetta tarvitaan yhteensä: {perProductTotal || "–"} {portionSizeUnit}
          </li>
        </ul>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-foreground disabled:opacity-50"
      >
        {submitting ? "Luodaan..." : "Luo tasting"}
      </button>
      {submitError && <p className="text-sm text-danger">{submitError}</p>}
    </form>
  );
}
