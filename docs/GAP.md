# GAP.md — nykytila vs. `docs/SPEC.md` (v5.0)

Käyty läpi: koko `src/`-puu (kaikki 12 tiedostoa), `scripts/set-password.mjs`, `package.json`,
`.env.local.example`, `CLAUDE.md`, `TILANNE.md` (huom: sijaitsee repon juuressa, ei `docs/`-kansiossa).

**Ympäristö:** Node v24.16.0 ✓, Java 25 (Temurin) ✓ (riittää Firestore-emulaattorille),
**Firebase CLI ei ole asennettu** (`firebase: command not found`) — tarvitaan Vaiheessa A.
Ei `firebase.json`, ei `firestore.rules`, ei `firestore.indexes.json`. Ei `app/api`-hakemistoa
eli Route Handlereita ei ole yhtään. Ei testikehystä (ei Vitestiä `package.json`-riippuvuuksissa).
`firebase-admin` on jo devDependency-listalla mutta sitä käyttää vain `scripts/set-password.mjs`.

---

## 2. Arkkitehtuuri

| SPECin vaatimus | Nykytila | Toimenpide |
| --- | --- | --- |
| 2.1: Vitest, Playwright, jose, bcryptjs riippuvuuksina | Ei yhtään näistä `package.json`:ssa | **Uusi** |
| 2.2: Kaikki kirjoitukset Route Handlerin + `firebase-admin`in kautta | `events.ts`, `participants.ts`, `scores.ts` kirjoittavat suoraan selain-SDK:lla (`firebase/firestore` clientistä) | **Korvaa** — koko datakerros uudelleenjohdotetaan Route Handlereiden taakse |
| 2.2: `firestore.rules` estää kaiken asiakaskirjoituksen, `/config` lukukin estetty | Ei `firestore.rules`-tiedostoa lainkaan; `config.ts` lukee `config/app`-dokumentin suoraan selaimesta salasanan vertailua varten | **Korvaa** — tämä on nykyisen mallin vakavin tietoturva-aukko: salasana on tällä hetkellä kirjaimellisesti selaimen verkkovälilehdeltä luettavissa JSON-muodossa |
| 2.2: `passwordHash` ei koskaan API-vastauksessa | N/A (ei API:a) | **Uusi** — muista tarkistaa kun Route Handlerit kirjoitetaan |
| 2.3: HttpOnly-eväste, `jose`-JWT, `GET /api/me` | Ei istuntoevästettä; istunto on `localStorage`-JSON (`session.ts`) jota selain itse ylläpitää | **Korvaa** |
| 2.4: Route Handler -rajapinta (auth, events, tastings, rounds, ensure-rounds) | Ei yhtään Route Handleria | **Uusi** kokonaisuudessaan |
| Zod-validointi jokaiselle handlerille | Ei Zodia asennettu, ei validointia missään (esim. `OrganizerCreateEvent.tsx` validoi vain UI:ssa) | **Uusi** |

## 3. Tietomalli

| SPECin vaatimus | Nykytila | Toimenpide |
| --- | --- | --- |
| `config/appConfig`: `adminUsername`, `adminPasswordHash`, `eventPasswordHash` (bcrypt) | `config/app`: `{ password: string }` selväkielisenä, ei erillistä admin-tunnusta — `OrganizerDashboard.tsx` ja `OrganizerCreateEvent.tsx` käyttävät samaa `checkPassword()`-funktiota kuin osallistujat | **Korvaa** |
| `events/{eventId}` + alikokoelma `participants/{participantId}` | `events/{id}` tasomainen dokumentti, jossa `productNames: string[]` ja `participantNames: string[]` suoraan kentissä; `participants` on **oma juurikokoelma** (ei alikokoelma), yhdistetty `eventId`-kentällä + kyselyllä | **Korvaa** rakenne (juurikokoelma → alikokoelma) |
| `events/{eventId}/tastings/{tastingId}` — useita rinnakkaisia tastingeja per tapahtuma | Ei `tastings`-käsitettä lainkaan; tuotteet ja asetukset (`portionSizeValue`, `guessingEnabled`, `pairsPerParticipant`) ovat suoraan `EventDoc`issa, eli **yksi event = yksi tasting** | **Korvaa** — ydinmuutos, vaikuttaa kaikkeen alempaan |
| `TastingItem { id, name, code }` — tuotekoodit T1, T2... | `productNames: string[]`, viitataan pelkällä array-indeksillä kaikkialla (`productAIndex`/`productBIndex`) | **Korvaa** — indeksiviittaus korvataan id/code-malliin |
| `ParticipantDoc`: `nameKey` (normalisoitu uniikkius), `activeSessionId`, `excludedTastingIds` | `Participant`: `name` (ei normalisoitua avainta — `findParticipantByName` tekee tarkan `==`-haun, "Matti" ≠ "matti"), `sessionToken`, ei poissulkemismekanismia | **Laajenna/korvaa** |
| `participantState`-alikokoelma per tasting (`phase`, `cumulativePoints`, `tastedPoints`, `tastedPairs`, `metPairs`, `seedOrder`, `bracket`, `finalRanking`) | Ei vastinetta. Lähin asia on `Participant.rounds: Round[]` + `currentRoundIndex` | **Uusi** kokonaan — Swiss ei ole mahdollinen ilman tätä |
| `rounds` omana alikokoelmana `tastings/{tid}/rounds/{roundId}`, `RoundDoc` kentät `status: WAITING_SERVICE\|SERVED\|SUBMITTED`, `servedAt`/`submittedAt` palvelinaikaleimoina | `Round` on **taulukkoalkio** `Participant.rounds`-kentässä: `{ index, productAIndex, productBIndex, served: boolean, completed: boolean }`. `markCurrentRoundServed()` ja `submitScore()` lukevat/kirjoittavat **koko taulukon** uudelleen joka kerta. Ei palvelinaikaleimoja — `submittedAt: Date.now()` selaimen kellosta | **Korvaa** — tämä on prompti-tekstissä nimetty sudenkuoppa #1, ja olen samaa mieltä: taulukkomalli on toimiva vain Round Robinille eikä skaalaa Swissiin, dynaamiseen tarjoilulistaan eikä palvelinpuolen transaktioihin |
| `CategoryDoc` all-time-tilastoja varten | `TastingEvent.category: string` on vapaa tekstikenttä, ei omaa `categories`-kokoelmaa | **Uusi** |
| Komposiitti-indeksit `firestore.indexes.json`:iin | Ei tiedostoa; nykyiset kyselyt (`where eventId == X, where name == Y` jne.) eivät vaadi komposiitti-indeksiä koska ne ovat yksittäisiä `where`-ehtoja per kysely, mutta `rounds`-alikokoelman `where participantId == X order by roundIndex` (uusi malli) vaatii | **Uusi** |

## 4. Kirjautuminen ja sessiot

| SPECin vaatimus | Nykytila | Toimenpide |
| --- | --- | --- |
| 4.1: Erillinen Master-tunnus järjestäjälle, pääsee sisään aina (myös ilman aktiivista tapahtumaa) | `OrganizerDashboard.tsx` ja `OrganizerCreateEvent.tsx` käyttävät **samaa yhteistä salasanaa** kuin osallistujat (`checkPassword()`); ei erillistä admin-identiteettiä | **Korvaa** |
| 4.2: Yksi aktiivinen tapahtuma (`status: 'active'`) kerrallaan, estetty jo luontivaiheessa | **Säilytetty periaate**, mutta toteutettu `config.activeEventId`-osoittimella + UI-varoituksella (`OrganizerCreateEvent`: "Käynnissä on jo tasting... Ymmärrän, aloita silti uusi") joka **vaihtaa** aktiivista tapahtumaa, ei estä useaa `active`-tilaista dokumenttia rakenteellisesti | **Laajenna** — periaate säilyy (SPEC 4.2 vahvistaa tämän), mekanismi pitää siirtää palvelinpuolen transaktioon joka myös sulkee (`status: 'archived'`) edellisen |
| Kirjautumislogiikka: `nameKey`-haku, uusi osallistuja luodaan jos ei löydy, `activeSessionId` uudistetaan | `findParticipantByName()` vaatii, että osallistuja **on jo olemassa** (luotu tapahtuman luonnissa etukäteen nimilistasta) — ei "luo jos ei löydy" -haaraa. Ei nimen normalisointia | **Korvaa** |
| Eväste + `onSnapshot` samalla `activeSessionId`:llä, ulos kun ei täsmää | Sama periaate on jo toteutettu `sessionToken`+`localStorage`+`onSnapshot`-mallilla `ParticipantSession.tsx`:ssä | **Säilytä logiikka, korvaa kuljetusmekanismi** (localStorage-token → HttpOnly-eväste + Firestore-luku pysyy) |
| 4.3: Tapahtuman arkistointi + vahvistusmodaali, evästeiden mitätöinti | Ei arkistointitoimintoa, ei modaalia. Vanha tapahtuma jää `status: "active"`/`"finished"` (huom: `EventStatus` on `"active" \| "finished"`, SPEC:ssä `'active' \| 'archived'` — nimieroa) | **Uusi** |

## 5. Tastingin elinkaari

| SPECin vaatimus | Nykytila | Toimenpide |
| --- | --- | --- |
| `pending → in_progress → completed` -tilakone tastingille | Ei tilakonetta tastingille (koska tastingia ei ole omana käsitteenä); `TastingEvent.status` on tapahtumatason `active/finished` | **Uusi** |
| 5.1: Laiska, idempotentti kierrosten luonti (`ensure-rounds`, transaktio) | Kaikki osallistujien kaikki kierrokset arvotaan **kerralla** `createEvent()`-kutsussa tapahtuman luonnin yhteydessä, yhdellä batchilla ilman transaktiovarmistusta per-osallistuja-idempotenssista | **Korvaa** Round Robinin osalta (siirrä `ensure-rounds`-malliin), **Uusi** Swissille |
| 5.2: Tarjoilun kuittaus per osallistuja, palvelinaikaleima, "Kuittaa kaikki odottavat" | Per-osallistuja-kuittaus **on** jo toteutettu (`markCurrentRoundServed`, oikea suunta), mutta: (a) selaimen kirjoitus eikä Route Handler, (b) ei palvelinaikaleimaa, (c) ei joukkotoimintoa "Kuittaa kaikki odottavat", (d) toteutettu koko taulukon uudelleenkirjoituksella | **Laajenna/korvaa** — idea säilyy, toteutustapa vaihtuu alikokoelmaksi + admin SDK:ksi |
| 5.3: Tuotekoodit T1, T2..., piilossa osallistujalta, näkyy vain järjestäjälle tarjoilulistalla/tulosnäkymässä | Ei koodeja. Sen sijaan `EvaluationForm.tsx` ja `OrganizerDashboard.tsx` käyttävät **molemmat oikeita tuotenimiä** kaikkialla — myös osallistujan arvausvalikoissa (mikä SPEC 5.3:n mukaan on oikein arvauksille) mutta koko `EventDoc` on muutenkin selaimen vapaasti luettavissa, joten osallistuja **näkisi tuotenimet konsolista** vaikka lomake ei niitä renderöisikään | **Uusi** koodit; **korjaa** vuoto-mahdollisuus siirtämällä paljastamattomat tiedot palvelimen taakse ennen `completed`-tilaa |

## 6. Maistelulogiikat

| SPECin vaatimus | Nykytila | Toimenpide |
| --- | --- | --- |
| 6.1 Round Robin, `3 ≤ N ≤ 12`, validaattori, tasapeli sallittu | `roundRobin.ts`: toteutus on algoritmisesti SPECin mukainen (kaikki parit, siemenkohtainen sekoitus, validointi + uudelleenyritys max 50). **Ei rajaa `3 ≤ N ≤ 12`** — `generateParticipantRounds` sallii `N ≥ 2` rajattomasti ylöspäin. Ei ole Firebase-riippuvuuksia (jo puhdas funktio, hyvä). Ei testejä (varmennus tehtiin kertakäyttöisellä skriptillä, ei Vitestillä) | **Säilytä ydinalgoritmi**, **laajenna** N-rajan validoinnilla, **uusi**: Vitest-testit (15.1) |
| 6.2 Sveitsiläinen turnauskaavio, katkaisusääntö, tennissiemennys | Ei toteutusta lainkaan | **Uusi** kokonaan — SPECin monimutkaisin luku |

## 7. Pisteytys

| SPECin vaatimus | Nykytila | Toimenpide |
| --- | --- | --- |
| `scoreA` 0–50 kokonaislukuna, `scoreB = 50 - scoreA`, tasapeli 25 sallittu RR:ssä / estetty Swississä | Toteutettu identtisesti Round Robinille (`pointsA`/`pointsB` `EvaluationForm.tsx`+`scores.ts`) | **Säilytä** logiikka Round Robinin osalta, **laajenna** Swiss-estolla kun Swiss tulee |
| Normalisoitu prosentti `(tastedPoints / (tastedPairs × 50)) × 100`, tasot: osallistuja / ryhmä / all-time | Ei laskentaa lainkaan — `scores`-dokumentit tallentuvat mutta mitään ei lasketa niistä | **Uusi** — mainittu TILANNE.md:ssä "Vaihe 5" -suunnitelmana, joka ei ole vielä alkanut |
| Ryhmärankingin tasapelisääntö (%→voitetut parit→nimi aakkosjärjestyksessä) | Ei toteutusta | **Uusi** |

## 8. Arvausominaisuus

| SPECin vaatimus | Nykytila | Toimenpide |
| --- | --- | --- |
| Kaksi alasvetoa oikeilla nimillä, duplikaatin esto, vapaaehtoisuus | Toteutettu lähes sanatarkasti `EvaluationForm.tsx`:ssä | **Säilytä** UI-logiikka |
| "Arvattu N×" -laskuri per vaihtoehto | `getGuessCounts()` toteuttaa juuri tämän | **Säilytä** — SPEC 8 mainitsee tämän nimenomaisesti |
| Arvauksen oikeellisuus lasketaan **palvelimella** `submit`-hetkellä ja tallennetaan (`guessACorrect`/`guessBCorrect`) | Arvaus tallennetaan (`guessAIndex`/`guessBIndex`) mutta **oikeellisuutta ei lasketa eikä tallenneta lainkaan** — ei myöskään rankingia tai loppuviestejä | **Laajenna/uusi** — siirtyy Route Handleriin, lisätään laskenta+tallennus+ranking+viestit |
| Arvauskisan ranking + loppuviestit (sävytetty suomeksi) | Ei toteutusta | **Uusi** |

## 9. Ajastin

| SPECin vaatimus | Nykytila | Toimenpide |
| --- | --- | --- |
| Koko luku: tilat, kellosiirtymäkorjaus, taustavälilehti, Web Audio, lukitut tastingit ilman äänilupaa | Ei mitään — `timeLimitMinutes`-käsitettä ei ole edes tietomallissa | **Uusi** kokonaan |

## 10. Esilaskuri

| SPECin vaatimus | Nykytila | Toimenpide |
| --- | --- | --- |
| Itsenäinen näkymä, käytettävissä ilman aktiivista tapahtumaa, RR+Swiss-laskenta, 3h-varoitus | `OrganizerCreateEvent.tsx`:ssä on **suppea** "Suunnittelutyökalu" (paria/osallistuja, annostarve) sisäänrakennettuna lomakkeeseen — ei itsenäinen näkymä, ei Swiss-laskentaa, ei kestovaroitusta | **Laajenna** olemassa olevaa laskentapohjaa, mutta rakenna omaksi itsenäiseksi näkymäksi |

## 11. Käyttöliittymä

| SPECin vaatimus | Nykytila | Toimenpide |
| --- | --- | --- |
| Tumma teema, tarkka väripaletti (slate-900/800, amber-500, emerald-500, rose-500) | Tailwind-teema on jo tumma (`globals.css`, ei luettu tarkkaan tässä ajossa, mutta TILANNE.md vahvistaa "night mode -teema" Vaihe 0:sta); värit tarkistettava täsmäävätkö SPECin paletin | **Tarkista/laajenna** |
| Mobiililähtöinen, 375px, 44px kosketuskohteet | Komponentit käyttävät kohtuullisen suuria nappeja/paddingia, ei erikseen todennettu 375px:lle | **Tarkista** |
| Etusivu: kaksi kirjautumislomaketta suoraan | Nykyinen etusivu (`page.tsx`) on **valikko** (linkit `/jarjesta` ja `/osallistu`), ei suoraan lomakkeet | **Laajenna/korvaa** riippuen tulkinnasta — pieni ero, ei arkkitehtuurinen |
| Järjestäjän dashboard: esilaskuri aina saatavilla, tastingin luonti tapahtuman *sisällä*, poissulkeminen per tasting, etenemä "7/12 valmiina", prosenttiranking ennen julkaisua | Nykyinen `/jarjesta` = tapahtuman (=tastingin) luontilomake, `/jarjesta/dashboard` = tarjoilulista. Ei erillistä esilaskurinäkymää, ei poissulkemista, ei etenemälukua, ei rankingia | **Korvaa/laajenna** vaiheessa D |
| Osallistujan päänäkymä: kortti per rinnakkainen tasting, 7 tilaa | `ParticipantSession.tsx` näyttää yhden tilan yhdelle (ainoalle) tastingille kolmella tilalla ("Odottaa maistiaisia" / arviointilomake / valmis) | **Korvaa** vaiheessa D |
| Tulosnäkymä: prosentit, nimien paljastus, arvauskisa, all-time, vientinappi | Ei olemassa | **Uusi** |
| 11.3: Tulokset 403 ennen julkaisua palvelimella | N/A, ei API:a | **Uusi** |

## 12. Vienti

| SPECin vaatimus | Nykytila | Toimenpide |
| --- | --- | --- |
| Markdown-vienti leikepöydälle + `.md`-tiedostona, järjestäjä/osallistuja-versiot | Ei toteutusta | **Uusi** |

## 13. All-time-tilastot

| SPECin vaatimus | Nykytila | Toimenpide |
| --- | --- | --- |
| `categories/{slug}` kumulatiiviset tilastot, `statsCommitted`-idempotenssi, transaktio | Ei toteutusta | **Uusi** |

---

## Testaus ja työkalut (CLAUDE.md / SPEC 15)

| Vaatimus | Nykytila | Toimenpide |
| --- | --- | --- |
| Vitest yksikkötestit | Ei yhtään testiä repossa, ei Vitest-riippuvuutta | **Uusi** |
| Firestore-emulaattori (`firebase.json`) | Ei tiedostoa, Firebase CLI ei asennettu tähän koneeseen | **Uusi** — CLI:n asennus tarvitaan ennen Vaihe A:n valmistumista |
| `npm run test:emulator`, `simulate`, `seed:config`, `seed:demo`, `e2e` -skriptit | Vain `dev`, `build`, `start`, `lint`, `set-password` olemassa | **Uusi** |
| Playwright | Aiemmat "Playwright"-testit (TILANNE.md Vaihe 3/4) ajettiin **käsin kertaluontoisesti tuotanto-Firestorea vasten**, eivät ole repossa pysyvinä testeinä eivätkä aja CI:ssä | **Korvaa** kokonaan emulaattoripohjaisilla, repoon commitoiduilla testeillä (Vaihe H) |

---

## Yhteenveto: säilytettävä ydin

Näiden ei tarvitse muuttua rakenteellisesti, vain kiinnittyä uuteen datakerrokseen:

- `roundRobin.ts`:n arvonta-algoritmi (siemen per osallistuja + validointi + 50 uusintayritystä)
- `EvaluationForm.tsx`:n liukusäädin/duplikaattiarvauksen esto/`getGuessCounts()`-idea
- `ParticipantSession.tsx`:n ja `OrganizerDashboard.tsx`:n tilakonerakenne ja `onSnapshot`-reaaliaikaisuus
- Tumma Tailwind-teema, Next 15.5.23, `.eslintrc.json`-legacy-lint
- `scripts/set-password.mjs` laajennettuna bcrypt+kaksi tunnusta -malliin, uudelleennimettynä `seed:config`

---

## 16. Avoimet kysymykset — vastattu käyttäjän toimesta

1. Rinnakkaisten tastingien yläraja: **5**. Osallistujan näkymä on mobiilioptimoitu (kortit
   rivittyvät allekkain luonnostaan), järjestäjän näkymä on työpöytäoptimoitu — asettelu voi siis
   erota näkymien välillä.
2. Muistiinpanokenttä: vapaaehtoinen, **500 merkin** yläraja (validoi lomakkeessa + Zodilla).
3. Osallistujien enimmäismäärä: **20**, yleisin käyttö **4–8** — optimoi asettelu tälle välille,
   mutta tue 20:aan asti skrollaamalla.
4. All-time-tilastojen selailu: **vertailusarake tulosnäkymässä**, ei erillistä selausnäkymää.
5. `seedingRounds`: **säädettävissä välillä 2–4** järjestäjän luontilomakkeella (Swiss-tastingeille).
6. Määrittelytiedosto nimetty uudelleen `docs/SPEC.md`:ksi (oli `docs/02-SPEC.md`). Ei numerointia
   muihin `docs/`-dokumentteihin.

Näitä ei kirjata `docs/SPEC.md`-tiedostoon (ei muokata sitä), vaan ne ovat sitovia päätöksiä tälle
toteutukselle — pidä ne mielessä Vaiheissa D (esilaskuri/luontilomake), E (Swiss) ja G (all-time).
