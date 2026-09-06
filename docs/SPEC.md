# Sokkotasting — tekninen määrittely (v5.0, toteutuskelpoinen)

> **Tämän dokumentin status:** tämä on ainoa sitova määrittely. Se perustuu alkuperäiseen v4.0-dokumenttiin. Toiminnallisuus on säilytetty sellaisenaan; tekniset ratkaisut ja kaikki alkuperäisen dokumentin monitulkintaiset kohdat on ratkaistu.
>
> Merkintä **`[PÄÄTÖS]`** = kohta, jossa alkuperäinen jätti tulkinnanvaraa ja tässä on tehty valinta. Perustelu on aina mukana.
> Merkintä **`[KYSY]`** = kohta, jota **ei saa toteuttaa arvaamalla**. Kysy ennen koodausta.

---

## 1. Tavoite ja rajaus

Asynkroninen sokkotasting-sovellus rinnakkaisten maistelujen hallintaan ja automaattiseen tuloslaskentaan. Järjestäjä luo tapahtuman ja sen alle yhden tai useamman rinnakkaisen tastingin. Osallistujat arvioivat tuotepareja liukusäätimellä tietämättä tuotteiden nimiä. Sovellus laskee normalisoidut tulokset ja rankingit.

### Ei-tavoitteet (älä toteuta)

- Käyttäjärekisteröinti, sähköpostit, salasanan palautus
- Kuvien lataus tai tallennus
- Push-ilmoitukset, offline-tuki, PWA-asennus
- Monikielisyys — käyttöliittymä on **vain suomeksi**
- Maksut, tilaukset, analytiikka
- Mikä tahansa ominaisuus, jota tässä dokumentissa ei mainita

### Kustannusrajoite

Kaiken on toimittava Firebase **Spark-tasolla** (ei Cloud Functionsia, ei Cloud Storagea) ja Vercelin ilmaistasolla. Tämä on kova reunaehto, ei toive.

---

## 2. Arkkitehtuuri

### 2.1 Teknologiat

- **Next.js** (App Router) + **TypeScript** (strict) + **Tailwind CSS**
- **Firebase Firestore** (Spark), **firebase** (selain-SDK) ja **firebase-admin** (palvelin)
- **Vitest** yksikkötesteihin, **Playwright** loppusavutestiin
- **jose** istuntoevästeen allekirjoitukseen, **bcryptjs** salasanatiivisteisiin
- Deploy: **Vercel**

Käytä `create-next-app@latest`. Lue asennetut versiot `package.json`-tiedostosta ja noudata niiden API:a; älä oleta muistista mikä on nykyinen tapa (esim. `params`-objektin luonne Route Handlereissa on muuttunut versioiden välillä).

### 2.2 Luottamusraja — `[PÄÄTÖS]` tärkein arkkitehtuuripäätös

Alkuperäinen dokumentti sijoittaa Master-tunnuksen ja salasanatiivisteen Firestoren `config`-kokoelmaan. Jos selain lukisi tuon dokumentin ja vertaisi salasanaa, tiiviste olisi kenen tahansa ladattavissa ja kirjautuminen ohitettavissa selaimen konsolista. Sitä ei tehdä.

**Jako:**

| Toiminto | Missä | Miten |
| --- | --- | --- |
| Kaikki kirjoitukset Firestoreen | Next.js Route Handler (Node runtime) | `firebase-admin`, service account |
| Kirjautuminen ja salasanan tarkistus | Route Handler | `bcryptjs.compare` |
| Istunto | HttpOnly-eväste | `jose`-allekirjoitettu JWT |
| Reaaliaikainen luku (dashboard, kortit, ajastin) | Selain | Firestore-SDK + `onSnapshot` |

**Firestore-säännöt:**

```
- /config/**            : luku ja kirjoitus estetty kokonaan (Admin SDK ohittaa säännöt)
- /events/**            : luku sallittu, kirjoitus estetty
- /categories/**        : luku sallittu, kirjoitus estetty
```

Tämä on edelleen "herrasmiessopimus": tapahtumadata on lukukelpoista kenelle tahansa, joka tuntee projekti-ID:n. Se on hyväksyttyä. Se mitä **ei** hyväksytä on kirjoitusoikeus tai tunnusten vuotaminen.

**Seuraus, joka on helppo unohtaa:** koska `passwordHash` ei ole selaimen luettavissa, sitä ei myöskään saa palauttaa mistään API-vastauksesta. Tarkista tämä.

### 2.3 Istuntoeväste

Sisältö: `{ role: 'admin' | 'participant', eventId, participantId?, sessionId?, iat, exp }`. Voimassaolo 24 h. `httpOnly`, `sameSite: 'lax'`, `secure` tuotannossa.

`GET /api/me` palauttaa selaimelle purettu sisällön (ilman allekirjoitusta), jotta selain tietää oman `sessionId`-arvonsa tuplakirjautumisen valvontaa varten.

### 2.4 Route Handler -rajapinta

```
POST /api/auth/login            { mode:'admin'|'participant', username|nickname, password }
POST /api/auth/logout
GET  /api/me

POST /api/events                                    luo tapahtuman
PATCH /api/events/:eventId                          nimi, status ('archived')
POST /api/events/:eventId/participants/:pid/tastings  opt-in/opt-out (järjestäjä)

POST /api/tastings                                  luo tastingin tapahtuman alle
POST /api/tastings/:tid/start                       status -> 'in_progress'
POST /api/tastings/:tid/complete                    status -> 'completed' + all-time-tilastot
POST /api/tastings/:tid/serve                       { participantId, roundId } -> SERVED
POST /api/tastings/:tid/rounds/:roundId/submit      { scoreA, notes, guessAId?, guessBId? }
POST /api/tastings/:tid/ensure-rounds               { participantId } idempotentti kierrosten luonti
```

Kaikki käsittelijät: (1) lue eväste, (2) tarkista rooli, (3) tarkista että resurssi kuuluu evästeen `eventId`:hen, (4) validoi runko Zodilla, (5) suorita. Ei poikkeuksia.

---

## 3. Tietomalli

Polut ovat alkuperäisen mukaiset, kentät tarkennettuja. **Lisäys:** `participantState`-alikokoelma, jota ilman dynaamista turnauskaaviota ei voi toteuttaa.

```
config/appConfig
events/{eventId}
events/{eventId}/participants/{participantId}
events/{eventId}/tastings/{tastingId}
events/{eventId}/tastings/{tastingId}/participantState/{participantId}
events/{eventId}/tastings/{tastingId}/rounds/{roundId}
categories/{categoryId}
```

```typescript
interface AppConfig {
  adminUsername: string;
  adminPasswordHash: string;    // bcrypt
  eventPasswordHash: string;    // bcrypt, yhteinen osallistujasalasana
  updatedAt: number;
}

interface EventDoc {
  id: string;
  name: string;
  category: string;             // vapaa teksti, esim. "grillimakkarat"
  categoryId: string;           // slug, viittaa /categories/{categoryId}
  status: 'active' | 'archived';
  createdAt: number;
  closedAt?: number;
}

interface ParticipantDoc {
  id: string;
  name: string;                 // nimimerkki, uniikki tapahtuman sisällä
  nameKey: string;              // normalisoitu (trim + lowercase) uniikkiustarkistukseen
  activeSessionId: string;
  excludedTastingIds: string[]; // PÄÄTÖS: opt-OUT-lista, ei opt-in
  createdAt: number;
  lastActiveAt: number;
}

interface TastingItem {
  id: string;
  name: string;
  code: string;                 // "T1", "T2"... vain järjestäjän näkyvissä, ks. 5.3
}

interface TastingDoc {
  id: string;
  eventId: string;
  name: string;
  logic: 'ROUND_ROBIN' | 'SWISS_TOURNAMENT';
  items: TastingItem[];
  portionSize: string;          // vapaa teksti näyttöä varten, esim. "30 ml"
  portionAmount: number;        // esilaskuria varten
  portionUnit: 'ml' | 'g';
  hasGuessing: boolean;
  hasBronzeMatch: boolean;
  timeLimitMinutes: number | null;
  seedingRounds: number;        // vain SWISS, oletus 2
  status: 'pending' | 'in_progress' | 'completed';
  statsCommitted: boolean;      // idempotenssi all-time-tilastoille
  createdAt: number;
  completedAt?: number;
}

interface ParticipantTastingState {
  participantId: string;
  phase: 'SEEDING' | 'PLAYOFF' | 'BRONZE' | 'FINAL' | 'DONE';
  rngSeed: string;              // deterministinen arvonta ja tasapelien viimekätinen ratkaisu
  currentRoundIndex: number;
  seedingRoundNumber: number;
  cumulativePoints: Record<string, number>;   // itemId -> alkusarjapisteet (sis. bye-hyvitykset)
  tastedPoints: Record<string, number>;       // itemId -> oikeasti maistellut pisteet
  tastedPairs: Record<string, number>;        // itemId -> maisteltujen parien määrä
  metPairs: string[];                         // "itemA|itemB" aakkosjärjestyksessä, duplikaattien esto
  seedOrder?: string[];                       // itemId[] sijoituksen mukaan, kun alkusarja päättyy
  bracket?: BracketNode[];                    // pudotuspelipuu
  finalRanking?: string[];                    // itemId[] sijalta 1 alkaen
  updatedAt: number;
}

interface BracketNode {
  matchId: string;              // esim. "R16-3"
  roundName: 'R64'|'R32'|'R16'|'QF'|'SF'|'FINAL'|'BRONZE';
  slotA: string | null;         // itemId tai null (ei vielä ratkennut)
  slotB: string | null;
  winner: string | null;
  loser: string | null;
  isBye: boolean;
  nextMatchId: string | null;
  nextSlot: 'A' | 'B' | null;
}

interface RoundDoc {
  id: string;
  tastingId: string;
  participantId: string;
  roundIndex: number;           // 0-pohjainen, esittämisjärjestys
  itemAId: string;
  itemBId: string;
  status: 'WAITING_SERVICE' | 'SERVED' | 'SUBMITTED';
  servedAt: number | null;      // palvelinaika
  submittedAt: number | null;
  scoreA: number | null;        // 0..50; scoreB = 50 - scoreA
  notes: string;
  guessAId?: string | null;
  guessBId?: string | null;
  guessACorrect?: boolean;
  guessBCorrect?: boolean;
  phase: 'ROUND_ROBIN' | 'SEEDING' | 'PLAYOFF' | 'BRONZE' | 'FINAL';
  matchId?: string;             // SWISS: viittaa BracketNodeen
  seedingRoundNumber?: number;
}

interface CategoryDoc {
  id: string;                   // slug
  name: string;
  knownItems: string[];
  stats: Array<{
    itemName: string;
    totalPoints: number;
    totalPossiblePoints: number;
    normalizedPercentage: number;
    eventCount: number;
    participantCount: number;
  }>;
  updatedAt: number;
}
```

**`[PÄÄTÖS]` opt-out eikä opt-in.** Alkuperäisessä oli `includedTastingIds`. Osallistuja voi liittyä kesken tapahtuman, jolloin opt-in-listaa ei olisi kenenkään täytettävä ja hän jäisi ulos kaikesta. Oletus = osallistuu kaikkeen; poissulkeminen on nimenomainen teko. Käyttöliittymässä tämä näkyy edelleen "osallistun / en osallistu" -valintana per tasting.

**Indeksit.** `rounds`-kysely `where participantId == X order by roundIndex` vaatii komposiitti-indeksin. Kirjoita kaikki tarvittavat `firestore.indexes.json`-tiedostoon; älä jätä niitä konsolin virheilmoituksen varaan.

---

## 4. Kirjautuminen ja sessiot

### 4.1 Järjestäjä

Master-tunnus + salasana → tarkistus `config/appConfig` vastaan Route Handlerissa. Pääsee sisään **aina**, myös kun aktiivista tapahtumaa ei ole. Jos aktiivinen tapahtuma puuttuu, dashboard näyttää esilaskurin ja "Luo tapahtuma" -toiminnon.

### 4.2 Osallistuja

Nimimerkki + yhteinen tapahtumasalasana. Kirjautuminen onnistuu **vain jos on olemassa tapahtuma `status: 'active'`**. Jos aktiivisia on useampi kuin yksi → järjestelmävirhe; estä useamman aktiivisen luonti jo luontivaiheessa.

Kirjautumislogiikka:

1. Etsi `participants` jossa `nameKey == normalize(nickname)`.
2. Ei löydy → luo uusi osallistujadokumentti.
3. Löytyy → generoi **uusi** `activeSessionId` ja kirjoita se dokumenttiin.
4. Aseta eväste, palauta `sessionId`.

Selain tilaa oman `participants/{id}`-dokumenttinsa `onSnapshot`illa. Jos `activeSessionId !== oma sessionId`, kirjaa ulos ja näytä: *"Nimimerkkisi otettiin käyttöön toisella laitteella."*

**`[PÄÄTÖS]` nimimerkki ei ole salasana.** Kuka tahansa tapahtumasalasanan tietävä voi kirjautua toisen nimimerkillä ja potkia hänet ulos. Tämä on tietoinen seuraus valitusta turvatasosta. Älä yritä korjata sitä.

### 4.3 Tapahtuman arkistointi

Järjestäjä painaa "Sulje tapahtuma". Ennen vahvistusta modaali: *"Osallistujat eivät voi enää kirjautua eivätkä viedä tuloksiaan. Varmista että kaikki ovat tallentaneet omat tuloksensa."* Vahvistuksen jälkeen `status: 'archived'`, `closedAt`. Osallistujien kirjautuminen estyy; voimassa olevat evästeet mitätöidään seuraavalla API-kutsulla.

---

## 5. Tastingin elinkaari

```
pending  --[järjestäjä: Käynnistä]-->  in_progress  --[järjestäjä: Päätä ja julkaise]-->  completed
```

- `pending`: tuotteet ja asetukset muokattavissa. Ei kierroksia.
- `in_progress`: asetukset lukossa. Kierrokset luodaan. Osallistujat arvioivat.
- `completed`: kaikki lukossa. Tulokset paljastuvat. All-time-tilastot päivitetään kerran (`statsCommitted`).

### 5.1 Kierrosten luonti — laiska ja idempotentti

`[PÄÄTÖS]` Kierroksia **ei** luoda kaikille kerralla `start`-hetkellä. Sen sijaan:

- Kun osallistuja avaa tastingin, jonka tila on `in_progress` ja jolla ei ole hänelle `participantState`-dokumenttia, selain kutsuu `POST /api/tastings/:tid/ensure-rounds`.
- Käsittelijä luo `participantState`n ja ensimmäiset kierrokset **transaktiossa**, ja on idempotentti: jos tila on jo olemassa, se ei tee mitään.

Syy: myöhässä saapuva osallistuja saa kierroksensa automaattisesti, eikä `start` muutu O(osallistujat × parit) -kokoiseksi kirjoitusryöpyksi, joka voi ylittää Spark-rajat.

- **ROUND_ROBIN:** kaikki `N(N-1)/2` kierrosta luodaan kerralla tälle osallistujalle.
- **SWISS_TOURNAMENT:** vain alkusarjan kierros 1 luodaan. Jokainen `submit` laukaisee seuraavan parituksen laskennan ja luo uudet kierrokset transaktiossa.

### 5.2 Tarjoilun kuittaus — `[PÄÄTÖS — vahvistettu]`

Koska Round Robinissa järjestys on satunnaistettu per osallistuja ja Swississä parit eroavat kokonaan, **kuittaus on aina osallistujakohtainen**. Lisäksi tarvitaan joukkotoiminto (alla).

**Osallistujalla saa olla kerrallaan enintään yksi `SERVED`-tilainen kierros per tasting.** Seuraavaa ei voi tarjoilla ennen kuin edellinen on `SUBMITTED`. Muuten ajastin olisi merkityksetön.

Järjestäjän tarjoilulista, ryhmiteltynä tastingeittain:

| Osallistuja | Seuraava pari | Toiminto |
| --- | --- | --- |
| Anna | A: **T3** *Atria* · B: **T7** *Snellman* — 30 ml | `[Kuittaa tarjoilluksi]` |
| Ville | *odottaa arviointia (2:14)* | — |

Lisäksi painike **"Kuittaa kaikki odottavat"**, joka tarjoilee kaikille joilla on `WAITING_SERVICE` valmiina. Tämä on käytännössä pakollinen, kun osallistujia on 10+.

`servedAt` kirjoitetaan **palvelinaikaleimalla** (`FieldValue.serverTimestamp()`), ei selaimen kellosta.

### 5.3 Tuotekoodit — `[PÄÄTÖS — vahvistettu]`

Jokainen tuote saa tastingin luonnissa juoksevan koodin `T1`, `T2`, … tuotteiden syöttöjärjestyksessä. Koodi on pysyvä ja tallennetaan `TastingItem.code`-kenttään.

**Koodi ja oikea nimi näkyvät vain järjestäjälle**, ja vain tarjoilulistalla, tuotelistalla ja järjestäjän tulosnäkymässä. Ne ovat järjestäjän apuväline lasien ja pullojen merkitsemiseen.

**Osallistuja ei näe koodia missään** — ei arviointilomakkeella, ei kortilla, ei ajastimessa. Hänelle tuotteet ovat "Tuote A" ja "Tuote B" siihen asti, kunnes tasting julkaistaan ja nimet paljastetaan.

Tämä on toteutuksessa helppo vuotaa vahingossa: koodi ei saa päätyä osallistujan API-vastauksiin eikä `RoundDoc`ista johdettuihin selainpuolen näkymiin. Kirjoita tälle testi osaksi lukua 15.2 — osallistujan kierrosvastaus ei saa sisältää `code`- eikä `name`-kenttää ennen julkaisua.

---

## 6. Maistelulogiikat

### 6.1 Round Robin

- Sallittu `3 ≤ N ≤ 12`. Pareja per osallistuja: `N(N-1)/2`.
- Muodosta kaikki järjestämättömät parit, sekoita järjestys osallistujakohtaisella siemenellä, arvo jokaiselle parille kumpi on A ja kumpi B.
- **Validaattori** ajetaan aina ennen kirjoitusta ja se heittää poikkeuksen jos: parimäärä ≠ `N(N-1)/2`, sama järjestämätön pari esiintyy kahdesti, tai `itemAId === itemBId`.
- Tasapeli 25–25 **on sallittu** Round Robinissa.

### 6.2 Sveitsiläinen turnauskaavio

`8 ≤ N ≤ 64`, myös parittomat. **Jokaisella osallistujalla on oma, hänen omista arvioistaan etenevä kaavionsa** `[PÄÄTÖS — vahvistettu]`. Kahden osallistujan kaaviot voivat siis erota täysin toisistaan jo toisesta kierroksesta alkaen, eikä kukaan "putoa" ryhmän äänestyksen takia. Kaavio lasketaan uudelleen jokaisen `submit`-kutsun yhteydessä.

Tasapeli 25–25 **on estetty** koko turnausmuodossa (liukusäädin ei pysähdy 25:een, ja palvelin hylkää arvon).

#### Vaihe A — alkusarja (seeding)

**Kierros 1.** Sekoita tuotteet, muodosta vierekkäiset parit. Jos `N` on pariton, yksi tuote arvotaan **vapaalle**.

`[PÄÄTÖS]` Vapaan käsittely, kaksi erillistä kirjanpitoa:

- `cumulativePoints` — turnauksen sisäinen sijoituspistesaldo. Vapaa antaa **25 pistettä** (neutraali).
- `tastedPoints` / `tastedPairs` — vain oikeasti maistellut parit. Vapaa **ei kirjaudu** tänne.

Näin vapaa ei vääristä normalisoitua prosenttia (luku 7) mutta pitää sijoituslaskennan vertailukelpoisena. Sama tuote ei saa vapaata kahdesti, jos se on vältettävissä.

**Kierros 2.** Jaa tuotteet kahteen koriin: kierroksen 1 voittajat ja häviäjät (vapaan saanut menee voittajakoriin). Järjestä kori `cumulativePoints` laskevaan järjestykseen ja parita **paras vs. korin heikoin**, toiseksi paras vs. toiseksi heikoin (taittoparitus). Tämä tuottaa alkuperäisen esimerkin: 50p vs 26p ja 24p vs 0p.

**Kierrokset 3+.** Aja niin kauan kuin `cumulativePoints`-arvoissa on sidoksia:

1. Ryhmittele tuotteet identtisen pistesaldon mukaan.
2. Parita jokaisen sidosryhmän sisällä taittoparituksella.
3. Pariton jäännös yhdistetään lähimpään pistesaldoon ryhmän ulkopuolelta; jos sekään ei onnistu, vapaa.
4. **Älä koskaan muodosta paria, joka on jo `metPairs`-listalla.** Jos sidosryhmän kaikki mahdolliset parit on käyty, jätä ryhmä ratkaisematta ja siirry katkaisusääntöön.

**Katkaisu.** Enintään `maxSeedingRounds = seedingRounds + 4` kierrosta. Tämän jälkeen jäljellä olevat sidokset ratkaistaan järjestyksessä: (1) keskinäinen kohtaaminen, jos sellainen on, (2) `tastedPoints` yhteensä, (3) `rngSeed`-pohjainen deterministinen arvonta. **Sijoituksen 1…N on aina oltava täysin järjestetty** kun alkusarja päättyy. Tämä on kova invariantti; ilman katkaisua algoritmi jumittuu kun kaksi tuotetta ei voi enää kohdata.

Tulos: `seedOrder` — tuotteet sijoitusjärjestyksessä 1…N.

#### Vaihe B — pudotuspelit

- Kaaviokoko `B = 2^ceil(log2(N))`.
- Vapaataipaleet: `B - N` kappaletta, annetaan **parhaille sijoituksille** 1…(B−N).
- Paritus tennissiemennyksellä, rekursiivisesti: `seedPositions(2) = [1,2]`, `seedPositions(2k)` muodostetaan siten että jokainen sijoitus `s` saa parikseen `2k+1-s` ja puolikkaat lomitetaan. Kahden parhaan on kohdattava aikaisintaan finaalissa — kirjoita tälle testi, älä luota siihen että paritus "näyttää oikealta".
- Vapaataipaleen ottelu merkitään `isBye: true`, voittaja etenee automaattisesti, **kierrosdokumenttia ei luoda** (ei mitään maisteltavaa).
- Muut ottelut luodaan `RoundDoc`eina `WAITING_SERVICE`-tilaan sitä mukaa kuin ne ratkeavat.
- Pudotuspeliottelujen pisteet lisätään **sekä** `cumulativePoints`iin **että** `tastedPoints`iin.
- Pronssiottelu vain jos `hasBronzeMatch === true`; välierien häviäjät.

#### Vaihe C — lopullinen sijoitus 1…N

1. Sija 1 = finaalin voittaja, sija 2 = häviäjä.
2. Sijat 3–4: pronssiottelusta jos pelattu, muuten välierähäviäjät `cumulativePoints` mukaan.
3. Loput: ryhmittele sen mukaan, **millä kierroksella tuote putosi** (myöhemmin pudonnut on parempi). Ryhmän sisällä järjestys: `cumulativePoints` laskevasti → keskinäinen kohtaaminen → `rngSeed`.
4. Tuloksena `finalRanking`, pituus tasan `N`, ei duplikaatteja. Testaa tämä.

#### Kokorajoituksen varoitus

`N = 64` tarkoittaa alkusarjassa 2 × 32 = 64 paria ja pudotuspeleissä 63 ottelua eli **127 maistelua per osallistuja**. Se on käytännössä mahdotonta. Esilaskurin on näytettävä tämä punaisella ja tastingin luontilomakkeen on varoitettava, kun kokonaiskesto ylittää 3 tuntia. Rajaa ei silti poisteta — se on määrittelyssä.

---

## 7. Pisteytys

Liukusäädin: 0…50 kokonaislukuina. `scoreA` tallennetaan, `scoreB = 50 - scoreA` lasketaan. 25 = tasapeli (estetty SWISSissä).

```
Tulos (%) = ( tastedPoints[item] / (tastedPairs[item] × 50) ) × 100
```

- `50.0 %` = neutraali
- Jos `tastedPairs[item] === 0` → näytä "—", **älä** jaa nollalla
- Pyöristys näytössä yhteen desimaaliin; laskennassa täysi tarkkuus

**Tasot:**

| Taso | Aineisto |
| --- | --- |
| Osallistujakohtainen | yhden osallistujan `tastedPoints` / `tastedPairs` |
| Ryhmä (tasting) | kaikkien osallistujien summat, poissuljetut eivät mukana |
| All-time (kategoria) | `categories/{id}.stats`, kumuloituu tastingeista |

Ryhmärankingin tasapelit: prosentti → voitettujen parien määrä → tuotteen nimi aakkosjärjestyksessä. Ranking on aina deterministinen.

---

## 8. Arvausominaisuus

Valinnainen per tasting (`hasGuessing`).

- Arviointilomakkeella kaksi alasvetovalikkoa: "Tuote A on…" ja "Tuote B on…". Vaihtoehdot ovat tastingin tuotteiden nimet.
- Samaa tuotetta ei voi valita molempiin. Arvaaminen on vapaaehtoista; toisen voi jättää tyhjäksi.
- **`[PÄÄTÖS]` "aiempi arvaushistorialaskuri":** jokaisen vaihtoehdon perässä näkyy, montako kertaa osallistuja on jo arvannut kyseistä tuotetta tässä tastingissa, esim. `Atria (arvattu 3×)`. Näin arvaukset voi jakaa järkevästi ilman ulkoisia muistiinpanoja.
- Arvaukset **eivät vaikuta** maistelupisteisiin eivätkä rankingiin.

**Pisteytys:** oikea arvaus = 1 piste, siis enintään 2 per kierros. Oikeellisuus (`guessACorrect`, `guessBCorrect`) lasketaan palvelimella `submit`-hetkellä ja tallennetaan — älä laske sitä uudestaan tulosnäkymässä.

**Ranking:** oikeat arvaukset yhteensä → osumatarkkuus (`oikeat / arvatut`) → nimi aakkosjärjestyksessä. Oma rivi korostettuna. Jos arvaus on käytössä useammassa rinnakkaisessa tastingissa, näytetään **sekä tastingkohtainen että tapahtuman yhteisranking**.

**Loppuviestit** — sävy on tässä osa vaatimusta, ei koriste:

| Tilanne | Viesti |
| --- | --- |
| Voittaja | Onnittelu voitosta ja makuaistista |
| Yli keskiarvon | Kehu tarkkuudesta |
| Keskiarvo tai alle | Lämmin, kannustava — **ei ivaa, ei "parempi onni ensi kerralla" -sävyä** |

Kirjoita viestit suomeksi vakiotekstitiedostoon. Jos alle keskiarvon jäi vain yksi arvaus oikein, viestin pitää silti tuntua hyvältä lukea.

---

## 9. Ajastin

Käynnistyy `servedAt`-palvelinaikaleimasta. Jäljellä oleva aika = `servedAt + timeLimitMinutes×60000 - nyt`.

`p` = jäljellä oleva osuus kokonaisajasta:

| `p` | Ulkoasu | Ääni |
| --- | --- | --- |
| 100 – 35 % | vihreä | — |
| 35 – 25 % | oranssi | — |
| 25 – 15 % | punainen | — |
| 15 – 5 % | punainen + syke | — |
| 5 – 0 % | syke | rauhallinen piippaus |
| alle 0 | fonttikoko kasvaa, kortin tausta hälyttävä | vaativampi, **ei herätyskellomainen** |

**Kova vaatimus: lomake ei lukitu missään vaiheessa.** Kello menee miinukselle ja laskee eteenpäin. Pisteet saa tallentaa vaikka viisi minuuttia myöhässä.

**Kellosiirtymä.** Selaimen kello voi olla väärässä. Hae palvelinaika kerran istunnon alussa (`GET /api/me` palauttaa `serverTime`), laske erotus ja korjaa kaikki ajastimet sillä. Ilman tätä ajastin näyttää eri aikaa eri puhelimissa.

**Taustalla.** `setInterval` hidastuu taustavälilehdessä. Laske jäljellä oleva aika aina `Date.now()`-erotuksesta, älä vähentämällä laskurista. Palaa oikeaan aikaan `visibilitychange`-tapahtumassa.

**Web Audio API.** Selaimet estävät automaattisen äänen. Jos yhdessäkin aktiivisessa tastingissa on kierrosaika, pyydä lupa: näytä painike *"Salli äänimerkit"*, joka luo `AudioContext`in käyttäjän eleestä. Jos lupaa ei anneta, **ajastetut tastingit näkyvät lukittuina** informatiivisella tekstillä, mutta ajastamattomat toimivat normaalisti. Piippaus generoidaan oskillaattorilla; ei äänitiedostoja.

---

## 10. Esilaskuri

Itsenäinen näkymä järjestäjälle, käytettävissä **ennen** tastingin luontia ja ilman aktiivista tapahtumaa. Pelkkää laskentaa, ei kirjoituksia.

**Syötteet:** tuotteiden määrä `N`, logiikka, osallistujamäärä, kierrosaika (min), kerta-annos (määrä + yksikkö), pronssiottelu päällä/pois.

**Tulosteet:**

| Logiikka | Pareja per osallistuja | Esiintymiset per tuote |
| --- | --- | --- |
| Round Robin | `N(N-1)/2` | tasan `N-1` |
| Swiss | `alkusarjaparit + (B-1) + pronssi` | min / tyypillinen / **max** |

Swississä esiintymismäärä vaihtelee, koska tuote putoaa eri vaiheissa. Näytä kaikki kolme, ja **käytä maksimia raaka-ainelaskennassa** — kaupassa ei auta keskiarvo.

```
Kokonaiskesto      = pareja per osallistuja × kierrosaika
Raaka-aine/tuote   = osallistujat × esiintymiset × kerta-annos
```

Näytä myös kokonaismenekki yksikössään ja varoitus, jos kesto ylittää 3 h.

---

## 11. Käyttöliittymä

### 11.1 Yleistä

- Pysyvä tumma teema. Paletti: tausta `slate-900`, pinnat `slate-800`, korostus `amber-500`, positiivinen `emerald-500`, hälytys `rose-500`.
- **Mobiililähtöinen.** Suunnittele ensin 375 px leveydelle. Osallistujat käyttävät puhelinta toisessa kädessä, makkara toisessa.
- Kosketuskohteet vähintään 44 px. Liukusäädin on suurin elementti näytöllä.
- Kaikki teksti suomeksi. Ei englanninkielisiä nappeja.

### 11.2 Näkymät

**Etusivu** — kaksi kirjautumislomaketta: järjestäjä ja osallistuja.

**Järjestäjän dashboard**
- Esilaskuri (aina saatavilla)
- Tapahtuman luonti: nimi, kategoria automaattitäydennyksellä `/categories`-kokoelmasta
- Tastingin luonti: nimi, logiikka, tuotelista (automaattitäydennys `knownItems`ista), kerta-annos, kierrosaika, arvaus, pronssiottelu
- Osallistujalista + poissulkeminen per tasting
- Reaaliaikainen tarjoilulista (luku 5.2)
- Etenemä per osallistuja: `7/12 valmiina`
- Prosenttiranking (näkyy järjestäjälle jo ennen julkaisua)
- `[Päätä tasting ja julkaise]`, `[Sulje tapahtuma]`

**Osallistujan päänäkymä** — kortti per rinnakkainen tasting, tilat:
`Odottaa käynnistystä` · `Odottaa tarjoilua` · `Maistele nyt` (ajastin) · `Valmis, odottaa tuloksia` · `Tulokset valmiina` · `Et osallistu` · `Lukittu (äänilupa puuttuu)`

**Arviointilomake** — Tuote A vs Tuote B, liukusäädin, muistiinpanokenttä, arvausvalikot, ajastin. Ei tuotteiden nimiä missään.

**Tulosnäkymä** — omat prosentit vs. ryhmän, oikeiden nimien paljastus, arvauskisan tulokset, all-time-vertailu, vientipainike.

### 11.3 Tulosten paljastaminen

Osallistuja näkee tulokset **vasta kun `status === 'completed'`**. Jos hän valmistuu ensin: *"Olet valmis! Tulokset paljastuvat, kun järjestäjä päättää tastingin."*

Tämä on tietoturvavaatimus, ei vain UI-tila: `completed`-tilaa edeltävät Firestore-säännöt eivät estä lukemista, joten **tulosten laskenta ja paljastus on tehtävä palvelimella** (`/api/tastings/:tid/results` palauttaa 403 ennen julkaisua). Muuten motivoitunut osallistuja lukee muiden pisteet selaimen konsolista.

---

## 12. Vienti

Markdown / pelkkä teksti leikepöydälle **ja** `.md`-tiedostona.

- **Järjestäjä:** kaikki — tuotteiden oikeat nimet, ryhmäranking, osallistujakohtaiset pisteet, muistiinpanot, arvauskisa.
- **Osallistuja:** valintaruudut *omat pisteet* / *omat muistiinpanot* / *ryhmän tulokset*.

Otsikkotasot, taulukot, siisti tyhjätila. Kopioitavissa suoraan WhatsAppiin ilman siivousta.

---

## 13. All-time-tilastot

Kun tasting siirtyy `completed`-tilaan **ja** `statsCommitted === false`:

1. Etsi tai luo `categories/{slug(event.category)}`.
2. Lisää tuotenimet `knownItems`iin (unioni, ei duplikaatteja).
3. Jokaiselle tuotteelle: `totalPoints += ryhmän tastedPoints`, `totalPossiblePoints += ryhmän tastedPairs × 50`, `eventCount += 1`, `participantCount += osallistujat`.
4. Laske `normalizedPercentage` uudelleen.
5. Aseta `statsCommitted: true`.

Kaikki **yhdessä transaktiossa**. Jos julkaisunappia painetaan kahdesti tai verkko katkeaa kesken, tilastot eivät saa kaksinkertaistua. Kirjoita tälle testi.

Tuotteiden yhdistäminen tapahtuu **normalisoidulla nimellä** (trim + lowercase). "Atria " ja "atria" ovat sama tuote.

---

## 14. Reunatapaukset

| Tilanne | Käsittely |
| --- | --- |
| Osallistuja liittyy kesken tastingin | `ensure-rounds` luo hänen kierroksensa; ryhmätilastot laskevat vain maistellut parit |
| Osallistuja ei koskaan valmistu | Järjestäjä voi silti julkaista; keskeneräiset kierrokset jätetään pois laskennasta |
| Kaksi laitetta samalla nimimerkillä | Vanhempi ulos, luku 4.2 |
| Verkko katkeaa kesken arvioinnin | Lomakkeen tila `sessionStorage`en; palautus paluun yhteydessä |
| Sama arvaus molempiin (A ja B) | Estetty käyttöliittymässä ja palvelimella |
| `submit` samalle kierrokselle kahdesti | Transaktio tarkistaa `status !== 'SUBMITTED'`, muuten 409 |
| Swiss, `N < 8` tai `> 64` | Estetty luontilomakkeella ja palvelimella |
| Kaikki poissuljettu tastingista | Järjestäjä voi silti käynnistää; näkymä kertoo ettei osallistujia ole |
| Tasting `pending`, tapahtuma arkistoidaan | `pending`-tastingit merkitään `completed`, ei tilastoja |

---

## 15. Testausvaatimukset

Käyttöliittymän manuaalinen testaus tehdään vasta lopuksi. Siihen asti todentaminen tapahtuu testeillä — ne eivät ole lisä, ne ovat ainoa keino jolla toteutus voi tietää olevansa oikein.

### 15.1 Yksikkötestit (Vitest) — pakolliset

**Round Robin**
- `N = 3…12`: parimäärä tasan `N(N-1)/2`
- jokainen järjestämätön pari esiintyy tasan kerran
- ei `itemA === itemB`
- eri siemenillä eri järjestys, samalla siemenellä sama

**Swiss — alkusarja**
- parillinen ja pariton `N` (testaa vähintään 8, 9, 15, 16, 33)
- pariton: tasan yksi vapaa per kierros, vapaa antaa 25 `cumulative`-pistettä eikä mitään `tasted`-kirjanpitoon
- kierros 2 paritus on taittoparitus koreittain
- `seedOrder` on aina täysi permutaatio 1…N, ei duplikaatteja
- katkaisusääntö päättyy äärellisessä ajassa myös kun kaikki arviot ovat identtisiä (**tämä testi paljastaa ikuisen silmukan**)
- `metPairs` estää duplikaattiparit

**Swiss — pudotuspelit**
- kaaviokoko on oikea kahden potenssi
- vapaataipaleiden määrä = `B - N`, ne menevät parhaille sijoituksille
- **sijoitukset 1 ja 2 eivät voi kohdata ennen finaalia** — testaa kaikilla `N = 8…64`
- `finalRanking` on täysi permutaatio, pituus `N`
- pronssiottelu päällä/pois muuttaa sijat 3–4 oikein

**Pisteytys**
- normalisoitu prosentti tunnetuilla arvoilla
- `tastedPairs === 0` ei kaada eikä tuota `NaN`
- ryhmäaggregointi jättää poissuljetut pois

**Arvaukset**
- oikeellisuus lasketaan oikein, ranking ja tasapelisäännöt

**Ajastin**
- tilarajat `p` = 0.36, 0.35, 0.26, 0.25, 0.16, 0.15, 0.06, 0.05, 0.0, −0.1
- negatiivinen aika ei lukitse lomaketta

### 15.2 Integraatiotestit (Firestore-emulaattori)

- `ensure-rounds` kahdesti → kierroksia ei tule kahta settiä
- `submit` kahdesti → toinen palauttaa 409
- Swiss-täysi läpiajo simuloidulla osallistujalla `N = 9` ja `N = 16`: alkusarjasta finaaliin, ilman jumeja
- `complete` kahdesti → all-time-tilastot eivät kaksinkertaistu
- toinen kirjautuminen samalla nimimerkillä mitätöi ensimmäisen sessiotokenin
- osallistujan tulospyyntö ennen julkaisua → 403

### 15.3 Simulaatioskripti

`npm run simulate -- --logic=SWISS_TOURNAMENT --items=15 --participants=8`

Ajaa täyden tastingin emulaattoria vasten satunnaisilla arvioilla ja tulostaa lopputulokset. Tällä havaitaan jumit ja mahdottomat paritukset ilman käyttöliittymää. **Aja tämä jokaisella `N = 8…20` ennen kuin ilmoitat turnauslogiikan valmiiksi.**

### 15.4 Loppusavutesti (Playwright)

Yksi ajo emulaattoria vasten: järjestäjä kirjautuu → luo tapahtuman ja Round Robin -tastingin (`N = 4`) → kaksi osallistujaa kirjautuu → järjestäjä tarjoilee → osallistujat arvioivat kaikki parit → järjestäjä julkaisee → osallistujat näkevät tulokset. Tämä on toteutuksen viimeinen tehtävä.

---

## 16. Avoimet kysymykset — `[KYSY]`

Näihin ei ole vastausta dokumentissa. Älä arvaa; kysy ennen kuin ne tulevat eteen.

1. **Rinnakkaisten tastingien määrän yläraja.** Onko 3, 5, rajaton? Vaikuttaa dashboardin asetteluun.
2. **Muistiinpanokentän pakollisuus ja pituusraja.** Vapaaehtoinen? Merkkiraja?
3. **Osallistujien enimmäismäärä.** Vaikuttaa siihen, kannattaako tarjoilulista sivuttaa.
4. **All-time-tilastojen selailu.** Tarvitaanko oma näkymä kategorian historiaan, vai riittääkö vertailusarake tulosnäkymässä?
5. **`seedingRounds`-asetus.** Onko järjestäjän säädettävissä luontilomakkeella vai kiinteä 2?

Ratkaistut (älä kysy näitä uudelleen): sveitsiläisen kaavion osallistujakohtaisuus (6.2), tarjoilun kuittauksen tarkkuus (5.2), tuotekoodit (5.3).
