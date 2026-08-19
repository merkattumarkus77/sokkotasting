# Projektin tila

Päivitetty: 2026-08-20

## Valmis

- **Vaihe 0** (koodipuoli): Next.js + TypeScript + Tailwind alustettu, night mode -teema,
  `src/lib/firebase.ts` Firebase-yhteyttä varten. Build/lint/typecheck vihreitä.
- **Vaihe 1**: Datamalli (`src/lib/types.ts`: config/events/participants/scores),
  etusivu Järjestä/Osallistu-valinnalla, salasanatarkistuksen perusteet (`src/lib/config.ts`).
- **Vaihe 2**: Järjestäjän tapahtuman luontilomake ja Round Robin -parsinta.
  - `src/lib/roundRobin.ts`: arpoo jokaiselle osallistujalle erikseen kaikki tuoteparit
    satunnaisessa järjestyksessä + satunnaisella A/B-jaolla, ja tarkistaa (`validateRounds`)
    että jokainen teoreettinen pari löytyy tarkalleen kerran — jos ei, arpoo uudelleen
    (`generateParticipantRounds`, enintään 50 yritystä). **Algoritmi on ajettu ja varmennettu**
    erillisellä testiskriptillä 1400 arvonnalla tuotemäärillä 2–10 (ks. commit-historia) —
    validointi läpäisi kaikki, A/B-jako tasapainossa. Puhdasta logiikkaa, ei riipu Firebasesta.
  - `src/lib/events.ts`: `createEvent()` kirjoittaa event- ja participant-dokumentit yhdellä
    Firestore-batchilla ja päivittää `config.activeEventId`. `getActiveEvent()` hakee nykyisen
    aktiivisen tapahtuman.
  - `/jarjesta`-sivu (`OrganizerCreateEvent`-komponentti): salasana → varoitus jos edellinen
    tasting on yhä aktiivinen (ei pakota jatkamaan, vaatii vahvistuksen) → lomake (nimi,
    kategoria, osallistujat/tuotteet dynaamisina listoina, annoskoko+yksikkö, arvausoptio) →
    live "Suunnittelutyökalu" (paria/osallistuja, tuotetarve) → tallennus → yhteenveto.
  - **Ei vielä testattu oikeaa Firestorea vasten** (ei ole vielä käyttäjän Firebase-projektia).
    Build/typecheck/lint vihreitä ja sivu renderöityy oikein, mutta koko lomake+tallennus-polku
    kannattaa käydä läpi selaimessa heti kun `.env.local` on täytetty ja `config/app` on olemassa.
- Ylläpitoskripti `scripts/set-password.mjs` salasanan asettamiseen/vaihtoon Firestoreen
  (`npm run set-password <salasana>`), ks. skriptin alkukommentti käyttöohjeesta.
- Git-repo alustettu paikallisesti (`git init`), useita commiteja tehty. **Ei vielä pushattu
  GitHubiin** — remotea ei ole vielä lisätty.
- Määrittely.md päivitetty versioon 2.2: lukittu yhden aktiivisen tastingin malli
  (ks. kohta 3.0) ja salasanan hallinta ylläpitoskriptillä (ks. kohta 2).

## Odottaa käyttäjää (ei voi tehdä puolestasi)

1. **Firebase-projekti + Firestore**: luo projekti [Firebase-konsolissa](https://console.firebase.google.com),
   lisää Web-sovellus, luo Firestore-tietokanta, täytä `.env.local` (pohja: `.env.local.example`).
2. **Palvelutilin avain**: Project settings → Service accounts → Generate new private key,
   tallenna `serviceAccountKey.json` projektin juureen (gitignoressa, ei committoida).
   Aja tämän jälkeen `npm run set-password <salasana>` kerran, jotta config/app-dokumentti syntyy.
3. **GitHub-repo**: luo tyhjä repo, anna osoite → lisätään remote ja pushataan.
4. **Vercel**: yhdistä GitHub-repo, lisää samat Firebase-env-muuttujat Vercelin
   Project Settings → Environment Variables -kohtaan.
5. Kun yllä olevat on tehty: käy selaimessa läpi `/jarjesta`-lomake alusta loppuun (luo
   testitasting) ja tarkista Firebase-konsolista, että `events`- ja `participants`-kokoelmiin
   syntyi odotetun muotoiset dokumentit.

## Seuraava askel

**Vaihe 3**: Osallistujan kirjautuminen ja näkymä — nimi+salasana-kirjautumislomake,
sessiotokenin luonti/tallennus (localStorage + Firestore `activeSessionId`, tuplakirjautumisen
esto), sekä "Odottaa maistiaisia" -tilanäkymä joka kuuntelee reaaliajassa järjestäjän
kuittausta. Ks. Määrittely.md kohdat 2 ja 3.4, sekä projektisuunnitelman "Vaihe 3". Osallistujan
tulee löytää oma `participants`-dokumenttinsa nimen perusteella aktiivisesta tapahtumasta
(`config.activeEventId`), ja resilienssivaatimuksen mukaan uudelleenkirjautuessa palata
täsmälleen `currentRoundIndex`-kierrokseen.

## Muuta huomioitavaa jatkoa varten

- App tukee vain yhtä aktiivista tastingia kerrallaan (`config.activeEventId`), ks. Määrittely.md 3.0.
- A/B-järjestys parin sisällä arvotaan 50/50 (ks. Määrittely.md 3.2).
- Ranking-% -kaava dokumentoitu Määrittely.md kohdassa 3.3.
- `Participant.sessionToken` on toistaiseksi aina tyhjä merkkijono (`""`) — Vaihe 3 ottaa sen
  käyttöön kirjautumisen yhteydessä.
- Firestore Security Rules (Määrittely.md kohta 4) ei ole vielä kirjoitettu — tehdään kun
  osallistujan/järjestäjän kirjoitusoikeuksien tarkka rajaus on selvillä (viimeistään Vaihe 3–4).
