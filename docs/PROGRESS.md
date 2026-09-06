# PROGRESS.md — v2-migraation eteneminen

> Tämä tiedosto seuraa v2-migraation (ks. `docs/PLAN.md`) etenemistä vaihe kerrallaan.
> Repon juuressa oleva `TILANNE.md` kuvaa vanhan (pre-v2) toteutuksen historian eikä päivity enää —
> ks. sen sijaan `docs/GAP.md` nykytilan ja SPECin erosta.

## Vaihe A — Turvaverkko ✅

**Tehty:**

- Vitest asennettu ja `npm run test` ajaa sen (`vitest run`). `@types/node` nostettu `^20` →
  `^24` Vitest 5:n peer-dependency-vaatimuksen vuoksi (Node itsessään on jo v24.16.0 tällä koneella,
  joten tämä on vain tyyppimäärittelyjen linjausta ajonaikaiseen versioon, ei toiminnallinen muutos).
- `lib/prng.ts`: deterministinen mulberry32-PRNG (`createRng(seed)`), tarvitaan koska
  `lib/roundRobin.ts` käytti aiemmin suoraan `Math.random()`:ia eikä siksi ollut testattavissa
  eikä toistettavissa tallennetusta siemenestä (SPEC 6.1 vaatii: sama siemen → sama järjestys).
- `lib/roundRobin.ts`: `generateParticipantRounds`/`generateRoundsForParticipants` ottavat nyt
  pakollisen `seed`-parametrin. Algoritmi itsessään (kaikki parit, siemenkohtainen sekoitus,
  validointi + max 50 uusintayritystä) säilytetty muuttumattomana. `lib/events.ts` päivitetty
  kutsumaan uutta signatuuria (`() => crypto.randomUUID()` per osallistuja — säilyttää saman
  efektiivisen satunnaisuuden kuin ennen, koska siemen on silti tuore joka kutsulla).
  **Ei vielä** lisätty SPEC 6.1:n `3 ≤ N ≤ 12` -rajan pakotusta itse algoritmiin — se kuuluu
  tastingin luonnin validointikerrokseen (Vaihe C/D:n Zod-skeema + lomake), ei puhtaaseen
  parinmuodostusfunktioon. Kirjattu `docs/GAP.md`:hen.
- `src/lib/roundRobin.test.ts` + `src/lib/prng.test.ts`: SPEC 15.1:n Round Robin -testit
  (N=3…12 parimäärä ja pariykseys, ei itemA===itemB, sama/eri siemen → sama/eri järjestys) sekä
  `validateRounds`-negatiivitestit (puuttuva pari, tuplapari, itsepari). 40 testiä, kaikki vihreitä.
- `firebase.json`, `firestore.rules`, `firestore.indexes.json` (tyhjä) lisätty. Säännöt vastaavat
  SPEC 2.2:n taulukkoa (`/config` täysin estetty, `/events` ja `/categories` luku sallittu kirjoitus
  estetty, kaikki muu estetty) — **ei otettu käyttöön tuotannossa**, vain emulaattoria varten.
  Emulaattori käynnistyy onnistuneesti (`firebase-tools` asennettu devDependencyksi, testattu
  manuaalisesti `firebase emulators:start --only firestore`).
- `lib/firebaseAdmin.ts`: uusi, palvelinpuolen Firestore-yhteys admin SDK:lla. Tunnistaa
  `FIRESTORE_EMULATOR_HOST`-ympäristömuuttujan (emulaattori) ja käyttää muuten
  `serviceAccountKey.json`-tiedostoa (tuotanto). Ei vielä käytössä missään — perusta Vaihe C:n
  Route Handlereille.
- `lib/firebase.ts`: `NEXT_PUBLIC_USE_FIRESTORE_EMULATOR=true` kytkee selaimen Firestore-SDK:n
  paikalliseen emulaattoriin (`connectFirestoreEmulator`). Dokumentoitu `.env.local.example`:ssa.
  Oletusarvo (muuttuja puuttuu/false) säilyttää nykyisen käytöksen tuotanto-Firestorea vasten,
  eli olemassa oleva `.env.local`-kehitysympäristö ei rikkoudu.
- Puuttuvat `package.json`-skriptit lisätty CLAUDE.md:n listan mukaisiksi: `typecheck` (toimiva),
  `test:emulator`/`simulate`/`seed:demo`/`e2e` (TODO-stubit, palauttavat virhekoodin kunnes
  vastaava vaihe C/D/E/H toteuttaa sisällön), `seed:config` (alias nykyiselle
  `set-password`-skriptille — bcrypt+kaksi tunnusta -laajennus tulee Vaiheessa C).
- `docs/SPEC.md` (uudelleennimetty `docs/02-SPEC.md`:stä käyttäjän vahvistuksella), `docs/GAP.md`,
  `docs/PLAN.md` kirjoitettu ennen Vaihe A:n aloitusta.

**Ei tehty / jätetty auki:**

- `3 ≤ N ≤ 12` -rajan pakotus Round Robinille — Vaihe D (lomake) / Vaihe C (Zod).
- `npm run test:emulator`, `npm run simulate`, `npm run seed:demo`, `npm run e2e` ovat TODO-stubeja,
  eivät vielä toteuta mitään.
- `SESSION_SECRET`-ympäristömuuttuja Vaihe C:n istuntoevästettä varten puuttuu vielä
  `.env.local.example`:sta — CLAUDE.md:n pysähdy-ehto, käsitellään Vaihe C:n alussa.
- SPEC 2.2:n lukutaulukon tulkinta `/tastings`- ja `/rounds`-poluille (reaaliaikaisuus vs.
  taulukon kirjaimellinen "vain /events ja /categories") — avoin, käsitellään Vaihe C:ssä.

**Tarkistettu:** `npm run typecheck` ✓, `npm run lint` ✓ (0 varoitusta/virhettä), `npm run test` ✓
(40/40), `npm run build` ✓. Selaimen tuotantobundlesta (`.next/static/chunks/*.js`) tarkistettu
grepillä ettei `firebase-admin`, `serviceAccountKey` tai `FIREBASE_SERVICE_ACCOUNT_PATH` esiinny —
ei löytynyt.
