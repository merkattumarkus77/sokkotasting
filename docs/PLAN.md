# PLAN.md — vaiheistettu migraatio kohti `docs/SPEC.md`:ää

Perustuu `docs/GAP.md`-analyysiin. Työ tehdään haarassa **`v2`** (luodaan Vaihe A:n alussa).
`main` pysyy koskemattomana ja tuotannossa koko ajan. Jokainen vaihe päättyy:
`npm run typecheck && npm run lint && npm run test && npm run build` → commit → `docs/TILANNE.md`-päivitys → lyhyt yhteenveto.

**Käyttäjän päätökset (ks. `docs/GAP.md` luku 16), sitovia tälle toteutukselle:**

- Rinnakkaisia tastingeja enintään **5** per tapahtuma. Osallistujan kortit pinoutuvat allekkain
  (mobiilioptimoitu), järjestäjän tarjoilulista/dashboard suunnitellaan työpöytänäytölle.
- Muistiinpanokenttä vapaaehtoinen, **max 500 merkkiä** (lomake + Zod).
- Osallistujia enintään **20** per tapahtuma, tyypillisesti 4–8 — asettelu optimoidaan 4–8:lle,
  tuetaan 20:aan asti skrollaten.
- All-time-tilastot: vain vertailusarake tulosnäkymässä, ei erillistä selausnäkymää.
- `seedingRounds` säädettävissä järjestäjän lomakkeella **välillä 2–4** (oletus 2).

---

## Vaihe A — Turvaverkko

**Tavoite:** keinot havaita rikkoutuminen ennen kuin mitään olemassa olevaa muutetaan.

1. `git checkout -b v2`.
2. Asenna Vitest (`vitest`, `@vitest/ui` ei tarvita), lisää `npm run test` -skripti.
3. Siirrä/kirjoita `lib/roundRobin.ts`:lle SPEC 15.1:n testit: N=3…12 parimäärä, jokainen pari kerran,
   ei `itemA===itemB`, eri/sama siemen → eri/sama järjestys. Nykyinen algoritmi ei käytä eksplisiittistä
   siementä (`Math.random()` suoraan) — **tämä on ristiriita SPEC 6.1:n kanssa**, joka edellyttää
   deterministisyyttä samalla siemenellä. Ratkaisu: lisää `rngSeed`-parametri ja siemennetty PRNG
   (esim. pieni mulberry32-toteutus `lib/`iin — ei ulkoista riippuvuutta, "ei kirjastoa joka säästää
   kymmenen riviä" -sääntö).
4. Asenna Firebase CLI (`npm i -D firebase-tools` tai globaali — kysy käyttäjältä kumpi, ks. avoimet
   kysymykset chatissa) koska sitä ei ole koneella. Kirjoita `firebase.json` (`firestore` emulaattori,
   portit oletusarvoin), `firestore.indexes.json` (tyhjä aluksi).
5. `NEXT_PUBLIC_USE_FIRESTORE_EMULATOR`-tuki `lib/firebase.ts`:ään (`connectFirestoreEmulator`) ja
   vastaava kytkin `firebase-admin`-alustukseen (uusi `lib/firebaseAdmin.ts`, käyttää emulaattoria kun
   `FIRESTORE_EMULATOR_HOST` on asetettu — admin-SDK tukee tätä automaattisesti ympäristömuuttujalla,
   ei vaadi erillistä lippua).
6. Kirjoita `firestore.rules` SPEC 2.2:n mukaisesti (config: ei mitään, events/categories: luku sallittu
   kirjoitus estetty, kaikki muu estetty) mutta **älä ota käyttöön tuotannossa** — vain paikallinen
   tiedosto + emulaattorin käyttöön.
7. Puuttuvat `package.json`-skriptit CLAUDE.md:n mukaisiksi: `typecheck`, `test:emulator`, `simulate`,
   `seed:config` (alias `set-password`:lle), `seed:demo`, `e2e`. Moni näistä on aluksi runko/TODO
   kunnes vastaava vaihe toteuttaa sisällön — merkitse TODO-kommentein ja kirjaa `docs/PROGRESS.md`:hen.

**Valmis kun:** `npm run test` ajaa Round Robin -testit vihreinä (myös uudella siemenparametrilla),
`firebase emulators:start --only firestore` käynnistyy.

**Riski:** siemenparametrin lisääminen muuttaa `generateParticipantRounds`-signatuuria — kaikki
kutsupaikat (`events.ts` nykyisin, myöhemmin uusi tastings-luonti) pitää päivittää samassa vaiheessa.

---

## Vaihe B — Tietomalli

**Tavoite:** `lib/types.ts` ja datakerroksen moduulit vastaamaan SPEC 3:a. UI saa hajota väliaikaisesti.

1. Kirjoita uusi `lib/types.ts` SPEC 3:n rajapintojen mukaan: `AppConfig`, `EventDoc`, `ParticipantDoc`,
   `TastingItem`, `TastingDoc`, `ParticipantTastingState`, `BracketNode`, `RoundDoc`, `CategoryDoc`.
2. Poista vanhat `TastingEvent`, `Round` (taulukkoalkiona), `Participant.rounds`, `Score`-tyypit.
3. Kirjoita datakerroksen moduulit uudelleen **puhtaina Firestore-polku-apufunktioina** (ei vielä
   Route Handlereita — ne tulevat Vaiheessa C). Tässä vaiheessa nämä funktiot voivat väliaikaisesti
   käyttää joko admin- tai client-SDK:ta sisäisesti; lopullinen sijoitus (Route Handler -only) ratkeaa
   Vaiheessa C. Tavoite tässä on vain **oikea tietorakenne**, ei vielä oikea luottamusraja.
   - `lib/events.ts`: `events/{id}` + alikokoelma `participants/{id}` (`nameKey`, `activeSessionId`,
     `excludedTastingIds: []`).
   - Uusi `lib/tastings.ts`: `events/{id}/tastings/{tid}` CRUD, `TastingItem`-koodien generointi
     (`T1, T2, ...` syöttöjärjestyksessä).
   - Uusi `lib/participantState.ts`: `participantState/{pid}` skeeman mukaiset oletusarvot.
   - Uusi `lib/rounds.ts`: `rounds/{roundId}` alikokoelma, korvaa `markCurrentRoundServed`/`submitScore`
     -logiikan yksittäisinä dokumentti-operaatioina taulukon sijaan.
   - `lib/roundRobin.ts`: säilyy pääosin, mutta tuottaa nyt `RoundDoc`-yhteensopivia `{itemAId, itemBId}`
     -pareja `TastingItem.id`:llä indeksin sijaan.
4. Poista `lib/config.ts`:n selainpuolen `checkPassword()` — se korvataan Vaiheessa C palvelinpuolisella
   bcrypt-vertailulla. Jätä `lib/config.ts` toistaiseksi vain tyyppimäärittelyksi tai poista kokonaan
   jos ei enää tarvita.
5. Kesken jäävät käännösvirheet komponenteissa (`OrganizerCreateEvent`, `EvaluationForm`, jne.) ovat
   odotettuja tässä vaiheessa — CLAUDE.md:n "vaihe valmis vasta kun build ✓" -sääntö koskee silti
   lopputulosta, joten jos `build` ei mene läpi tämän vaiheen lopussa faktisesti UI:n takia, se pitää
   joko korjata minimissään (stub-komponentit) tai — suositus — **yhdistää Vaihe B ja C yhdeksi
   commit-sarjaksi niin että build pysyy vihreänä koko ajan välivaiheiden commiteissa**, ja vasta
   D-vaiheen lopuksi vaaditaan täysi vihreä `build`. Tarkenna tämä käyttäjän kanssa jos CLAUDE.md:n
   "vaihe valmis vasta kun build ✓" tulkitaan tiukasti jokaiselle A–H-vaiheelle erikseen.

**Valmis kun:** uudet tyypit ja datakerroksen funktiot ovat olemassa ja yksikkötestattavissa (`roundRobin`
yhä vihreä). **Päätös (käyttäjä, 2026-09-06):** Vaiheet B, C ja D ajetaan yhtenä committisarjana —
`typecheck`/`lint`/`test`/`build`-porttia ei vaadita B:n eikä C:n päätteeksi erikseen, koska
tietomallin vaihto rikkoo nykyisen UI:n väistämättä ennen kuin se on johdotettu uudelleen (D).
Jokainen commit on silti oma looginen askel Git-historiassa; täysi vihreä build vaaditaan vasta
Vaihe D:n lopussa, ja `docs/PROGRESS.md` päivitetään yhtenä B+C+D-kokonaisuutena tuolloin.

**Riski:** matala teknisesti, mutta tässä on suurin houkutus jättää `rounds`-taulukko paikalleen
"väliaikaisesti" — CLAUDE.md:n sudenkuoppa #1. Ei tehdä niin.

---

## Vaihe C — Palvelinkerros ja autentikointi

**Tavoite:** kaikki kirjoitukset Route Handlerien taakse, oikea luottamusraja.

1. `bcryptjs`, `jose`, `zod` asennukseen.
2. `lib/firebaseAdmin.ts`: `firebase-admin`-alustus service accountilla (tuotanto) tai emulaattorilla
   (testit), singleton-mallilla kuten nykyinen `lib/firebase.ts`.
3. Istuntoeväste: `lib/session-cookie.ts` (nimi vapaa) — `jose`-allekirjoitettu JWT, `httpOnly`,
   `sameSite: lax`, `secure` tuotannossa, 24h TTL. **Vaatii `SESSION_SECRET`-ympäristömuuttujan, jota
   ei ole `.env.local.example`-tiedostossa** — tämä on CLAUDE.md:n pysähdy-ja-kysy-ehto
   ("vaatisi salaisuuden, jota ei ole .env.example-tiedostossa"), ks. chat-vastauksen kysymykset.
4. Route Handlerit SPEC 2.4:n listan mukaan `app/api/**/route.ts`. Jokainen: lue eväste → tarkista
   rooli → tarkista resurssin `eventId`-omistus → Zod-validointi → suorita admin SDK:lla.
5. `POST /api/events`, `POST /api/tastings`, `POST /api/tastings/:tid/start` (transaktio, luo
   ensimmäiset kierrokset RR:lle kokonaan / Swissille vain kierros 1), `POST /api/tastings/:tid/serve`,
   `POST /api/tastings/:tid/rounds/:roundId/submit` (transaktio, tarkistaa `status !== SUBMITTED`,
   409 jos jo lähetetty), `POST /api/tastings/:tid/ensure-rounds` (idempotentti), `PATCH /api/events/:id`.
6. Poista selaimen suorat Firestore-kirjoitukset: `events.ts`, `participants.ts` (kirjoitusfunktiot),
   `scores.ts` menettävät suorat `writeBatch`/`updateDoc`-kutsunsa — ne korvataan `fetch()`-kutsuilla
   Route Handlereihin. Selaimelle jää vain `onSnapshot`-luku suoraan Firestore-SDK:lla `/events` ja
   `/categories` -poluista (SPEC 2.2), muu luku (`/tastings`, `/rounds`, oma `participantState`) SPEC:n
   mukaan sallittu koska ne ovat tapahtuman alla — **tarkista tämä SPEC 2.2:n taulukosta uudelleen
   toteutushetkellä**, koska taulukko mainitsee eksplisiittisesti vain `/events` ja `/categories`; jos
   `/tastings`- ja `/rounds`-lukuoikeutta ei ole tarkoitus antaa suoraan, reaaliaikaisuus (dashboard,
   kortit, ajastin) pitää toteuttaa pollauksella tai laajemmalla luku-säännöllä. **Tämä on tulkinnanvarainen
   kohta — ks. chat-vastauksen kysymykset**, koska SPEC 11.2 nimenomaan edellyttää reaaliaikaista
   dashboardia ja ajastinta, mikä käytännössä vaatii jonkin `onSnapshot`-kelpoisen lukupolun tastingeille.
7. `firestore.rules` otetaan käyttöön **vain emulaattorissa** tässä vaiheessa (`firebase emulators:start`).

**Valmis kun:** SPEC 15.2:n integraatiotestit menevät läpi emulaattoria vasten (ensure-rounds
idempotenssi, submit-409, tulokset-403 ennen julkaisua, tuplakirjautumisen mitätöinti) ja
`firestore.rules` estää asiakaskirjoituksen emulaattorissa ilman sovelluksen rikkoutumista.

**Riski:** korkea. Tämä on koko migraation arkkitehtoninen ydin ja suurin pinta-ala kerralla.
Suosittelen pilkkomista kahteen committiin siitä huolimatta että CLAUDE.md sanoo "yksi vaihe
kerrallaan" — ehdotan tulkintaa, että C jaetaan **C1: auth+eväste** ja **C2: loput Route Handlerit**,
kumpikin oma commit, mutta molemmat saman "vaiheen" alla ennen Vaihe D:n aloitusta. Vahvista tämä
tulkinta käyttäjältä jos tiukkaa yksi-commit-per-vaihe-sääntöä pitää noudattaa kirjaimellisesti.

---

## Vaihe D — Rinnakkaiset tastingit käyttöliittymään

1. Järjestäjä: `/jarjesta`-sivu jaetaan tapahtuman hallintaan (nimi, kategoria, arkistointi) ja
   tastingien listaan sen alla; jokainen tasting oma luontilomake (nimi, logiikka, tuotteet
   automaattikoodeineen, kerta-annos, kierrosaika, arvaus, pronssiottelu — Swiss-kentät UI:ssa
   piilossa/disabloitu kunnes Vaihe E tuo logiikan).
2. Tuotekoodit näkyviin järjestäjän tarjoilulistalla ja tuotelistalla (`T1 Atria` -muoto).
3. Osallistujien poissulkeminen per tasting (`excludedTastingIds`-checkboxit). Osallistujalista
   tukee enintään 20 osallistujaa (asettelu optimoidaan 4–8:lle, skrollataan sen yli).
4. "Kuittaa kaikki odottavat" -joukkotoiminto `OrganizerDashboard.tsx`:ään. Järjestäjän näkymä
   suunnitellaan työpöytänäytölle (leveämpi asettelu, ei mobiilikorttipino).
5. Tapahtuman alle enintään 5 rinnakkaista tastingia (validoi lomakkeessa + Zodilla Vaiheessa C).
6. Osallistuja: korttinäkymä per rinnakkainen tasting SPEC 11.2:n 7 tilalla, kortit pinoutuvat
   allekkain mobiilinäytöllä (enintään 5 korttia), korvaa `ParticipantSession.tsx`:n nykyisen
   yhden-tastingin oletuksen.
6. `EvaluationForm.tsx`:n rakenne (liukusäädin, muistiinpanot, arvausvalikot) johdotetaan uudelleen
   `RoundDoc`/`fetch()`-pohjaiseksi, UI säilyy pääosin.

**Valmis kun:** `build`/`lint`/`typecheck`/`test` vihreitä ja manuaalinen pistokoe emulaattoria
vasten (ei vielä Playwright) osoittaa RR-polun toimivan päästä päähän uudella rakenteella.

---

## Vaihe E — Sveitsiläinen turnauskaavio

**Testit ensin**, kuten CLAUDE.md ja SPEC 15.1 vaativat.

1. `lib/swiss.ts` (uusi, puhdas funktio, ei Firebase-riippuvuutta): alkusarjan pariutus
   (kierros 1 satunnainen, kierros 2 taittoparitus koreittain, kierrokset 3+ sidosryhmittäin),
   katkaisusääntö (`maxSeedingRounds = seedingRounds + 4`, sitten keskinäinen kohtaaminen →
   `tastedPoints` → `rngSeed`-arvonta). `seedingRounds` on järjestäjän lomakkeella säädettävissä
   välillä 2–4 (oletus 2) — validoi raja sekä lomakkeessa että Zodilla Vaiheessa C/D.
2. Testi identtisillä arvioilla (kaikki 25–25 — huom: SPEC sanoo tasapeli on *estetty* Swississä,
   joten testin pitää simuloida "kaikki arvioivat samoin" esim. aina samat voittajat, ei kirjaimellista
   tasapelipistettä — tarkenna testitapaus tarkasti SPEC 6.2:n katkaisusäännön mukaan). Tämä on
   CLAUDE.md:n sudenkuoppa #2: jos testi jumittuu, korjaa paritus, älä nosta kierrosrajaa.
3. `lib/swissBracket.ts`: kaaviokoko `2^ceil(log2(N))`, vapaataipaleet parhaille sijoituksille,
   tennissiemennys rekursiivisesti, testaa erikseen "sijat 1 ja 2 eivät kohtaa ennen finaalia" kaikilla
   `N = 8…64`.
4. Lopullinen sijoitus (Vaihe C SPEC 6.2): finaali, pronssi, pudonneiden ryhmittely kierroksen mukaan.
5. Kytke `ensure-rounds`/`submit`-Route Handlerit laukaisemaan Swiss-uudelleenlaskennan.
6. Esilaskuri (luku 10) laajennetaan Swiss-matematiikalla (min/tyypillinen/max esiintymät per tuote).
7. `npm run simulate` toteutetaan tässä vaiheessa täydessä laajuudessaan (skripti ajaa täyden
   tastingin emulaattoria vasten satunnaisilla arvioilla) ja ajetaan `N = 8…20`.

**Valmis kun:** SPEC 15.1:n turnaustestit vihreinä ja `npm run simulate` ei jumita millään
`N = 8…20`.

**Riski:** korkein koko migraatiossa — algoritminen monimutkaisuus (katkaisusääntö, tennissiemennys,
per-osallistuja-kaaviot) yhdistettynä siihen että virhe ei näy tyyppivirheenä vaan ikuisena silmukkana
tai vääränä sijoituksena ajonaikaisesti.

---

## Vaihe F — Ajastin ja äänet

1. `lib/timer.ts`: `p`-osuuden laskenta `servedAt`+`timeLimitMinutes`:stä, tilarajat 100–35/35–25/
   25–15/15–5/5–0/alle 0 %. Puhdas funktio, testit rajapisteille (0.36, 0.35, ..., -0.1).
2. Kellosiirtymäkorjaus: `GET /api/me` palauttaa `serverTime`, selain laskee erotuksen kerran istunnon
   alussa.
3. `visibilitychange`-korjaus (`Date.now()`-erotus, ei `setInterval`-laskuri).
4. Web Audio -lupapainike + oskillaattoripiippaus, lukitut tastingit ilman lupaa.
5. Lomake ei koskaan lukitu — negatiivinen aika sallittu, testaa tämä erikseen.

---

## Vaihe G — Tulokset, arvauskisa ja vienti

1. `lib/scoring.ts`: normalisoitu prosentti (7 §), nollajako suojattu, ryhmäranking tasapelisäännöllä.
2. `lib/guessing.ts`: oikeellisuuden laskenta submit-hetkellä, arvauskisan ranking + loppuviestit
   (vakiotekstitiedosto suomeksi, SPEC 8:n sävytaulukon mukaan).
3. `GET /api/tastings/:tid/results` — 403 ennen `completed`, muuten täydet tulokset.
4. Tulosnäkymät (osallistuja/järjestäjä) SPEC 11.2/11.3 mukaan. All-time-vertailu näkyy
   tulosnäkymässä vertailusarakkeena (ei erillistä all-time-selausnäkymää).
5. `lib/stats.ts` + `POST /api/tastings/:tid/complete`: all-time-tilastot transaktiossa,
   `statsCommitted`-suojaus, nimen normalisointi (trim+lowercase) unionissa.
6. `lib/export.ts`: Markdown-generointi, leikepöytä + `.md`-lataus, järjestäjä/osallistuja-versiot.
7. Tapahtuman arkistointi + vahvistusmodaali (4.3).

---

## Vaihe H — Viimeistely ja luovutus

1. Playwright-savutesti (15.4) emulaattoria vasten, korvaa TILANNE.md:ssä kuvatut kertaluontoiset
   tuotanto-ajot pysyvällä, repoon commitoidulla testillä.
2. `docs/TESTIKASIKIRJA.md`: manuaalinen hyväksymistestaus.
3. `docs/CUTOVER.md`: tuotannon vanhojen kokoelmien (`events`, `participants`, `scores` — vanhassa
   muodossa) tyhjennys, `seed:config`-ajo (adminUsername + molemmat bcrypt-tiivisteet), sääntöjen
   deploy, `v2 → main`. Kirjoitetaan mutta ei suoriteta.
4. `README.md` päivitys.

---

## Yhteenveto riskijärjestyksessä

1. **Vaihe E (Swiss)** — algoritminen riski, ikuiset silmukat, sijoituslogiikka.
2. **Vaihe C (palvelinkerros)** — arkkitehtoninen laajuus, luottamusrajan siirto, suurin regressioriski
   olemassa olevalle toimivalle polulle.
3. **Vaihe B (tietomalli)** — ei algoritmisesti vaikea, mutta virhe tässä (esim. väärä id-viittaus
   indeksin sijaan) leviää kaikkeen ylempään hiljaisesti ilman tyyppivirhettä jos `any` hiipii mukaan
   (ei sallittu, mutta juuri siksi tässä on houkutus).
4. Vaiheet D, F, G, H — pääosin UI/koostamistyötä valmiiden palasten päälle, matalampi riski.
