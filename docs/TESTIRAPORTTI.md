# TESTIRAPORTTI.md — Vaihe H:n testausraportti

> Kirjoitettu Vaihe H:n päätteeksi. Kuvaa mitä on testattu, miten, mitä löytyi ja korjattiin,
> ja mitä jää tämän ympäristön ulkopuolelle — sekä ehdotukset niiden ulkoistamiseksi toiselle
> kielimallille. Ks. myös `docs/TESTIKASIKIRJA.md` (manuaalinen hyväksymistestaus) ja
> `docs/PROGRESS.md` (mitä tehtiin missäkin vaiheessa).

## 1. Yhteenveto

| Kerros | Määrä | Tulos |
|---|---|---|
| Yksikkötestit (Vitest, `npm run test`) | 189 testiä, 12 tiedostoa | ✅ kaikki vihreitä |
| Integraatiotestit (emulaattori, `npm run test:emulator`) | 4 testiä, 2 tiedostoa | ✅ kaikki vihreitä |
| Simulaatioskripti (`npm run simulate`) | RR + Swiss, useita N-arvoja | ✅ ei jumeja |
| Laajennettu skenaariosimulaatio (`npm run simulate:scenario`) | 25 tarkistusta, 5 rinnakkaista tastingia | ✅ kaikki läpi |
| Playwright-selaintestit (`npm run e2e`) | 2 speciä, oikea Chromium-selain | ✅ molemmat vihreitä |
| `npm run build` + selainbundlen salaisuustarkistus | — | ✅ ei vuotoja |

Kaikki komennot ajettu tässä istunnossa Firestore-**emulaattoria** vasten, ei koskaan
tuotanto-Firestorea vasten (CLAUDE.md). `npm run e2e` rakentaa erillisen tuotantokäännöksen
`.next-e2e`-hakemistoon (ks. § 4) — ei koske normaalia `npm run build`-yhdyskäytävätarkistusta.

## 2. Yksikkötestit (SPEC 15.1)

`npm run test` — 189/189 vihreää, kattaa SPEC 15.1:n koko listan:

- **Round Robin** (`roundRobin.test.ts`): N=3…12 parimäärä `N(N-1)/2`, jokainen pari tasan kerran,
  ei `itemA===itemB`, sama/eri siemen → sama/eri järjestys.
- **Swiss — alkusarja** (`swiss.test.ts`): parillinen/pariton N (8, 9, 15, 16, 33 mukana), vapaan
  pisteytys (25/ei `tasted`-kirjausta), kierros 2:n koritaittoparitus, `seedOrder`-permutaation
  eheys, katkaisusäännön äärellisyys **identtisillä arvioilla** (SPEC:n itsensä nimeämä
  "paljastaa ikuisen silmukan" -testi), `metPairs`-duplikaattisuoja.
- **Swiss — pudotuspelit** (`swissBracket.test.ts`): kaaviokoko 2:n potenssina, vapaataipaleiden
  määrä ja sijoitus, **sijoitukset 1 ja 2 eivät kohtaa ennen finaalia kaikilla N=8…64**,
  `finalRanking`-permutaation eheys, pronssiottelun vaikutus sijoihin 3–4.
- **Pisteytys** (`scoring.test.ts`): normalisoitu prosentti, `tastedPairs===0` ei tuota `NaN`:ia,
  poissuljetut pois ryhmäaggregaatista.
- **Arvaukset** (`guessing.test.ts`): oikeellisuus, ranking, tasapelisäännöt, loppuviestien sävyt.
- **Ajastin** (`timer.test.ts`): kaikki SPEC:n tilarajat (0.36…−0.1), negatiivinen aika ei lukitse.
- Lisäksi: `normalize.test.ts`, `categoryStats.test.ts`, `roundAggregation.test.ts`,
  `exportMarkdown.test.ts`, `prng.test.ts` — moduulit joita SPEC 15.1 ei nimeltä listaa mutta
  jotka ovat samalla tavalla puhtaita, Firebase-riippumattomia funktioita ja siksi testattu samalla
  test-first-periaatteella.

## 3. Integraatiotestit (SPEC 15.2)

`npm run test:emulator` — 4/4 vihreää. SPEC 15.2:n kuusikohtainen lista on jaettu näiden neljän
testin ja § 5:n simulaatioskriptin/skenaarion kesken (Swiss-täysläpiajo N=9/16 kuuluu simulaatioon,
ei tänne, koska se on hitaampi ja kuuluu luonnostaan sinne):

- `ensure-rounds` kahdesti → ei kahta settiä kierroksia (idempotenssi).
- `submit` kahdesti → toinen kutsu palauttaa `ROUND_ALREADY_SUBMITTED` (409-ekvivalentti).
- `complete` kahdesti → all-time-tilastot eivät kaksinkertaistu.
- Toinen kirjautuminen samalla nimimerkillä mitätöi ensimmäisen sessiotokenin.

Osallistujan tulospyyntö-403-ennen-julkaisua ja Swiss N=9/16-läpiajo on katettu
`scripts/simulate.ts`:n ja `scripts/simulate-scenario.ts`:n kautta (§ 5) sekä Playwright-testien
tulossivun kautta (§ 6) — ei duplikoitu erillisenä Vitest-integraatiotestinä, koska ne jo ajavat
saman polun oikeasti läpi.

## 4. Löydös: Next.js dev-palvelin ei kestänyt Playwright-testien rinnakkaiskuormaa

Ensimmäiset Playwright-ajot `next dev`iä vasten kaatuivat satunnaisesti
`InvariantError: Expected clientReferenceManifest to be defined` -virheeseen, kun kolme
selainkontekstia (järjestäjä + kaksi osallistujaa) pyysivät montaa vielä-kääntämätöntä reittiä
lähes yhtä aikaa. Tämä ei ole sovelluksen bugi vaan `next dev`in on-demand-kääntimen tunnettu
rajoitus tällaisen rinnakkaiskuorman alla. **Korjaus:** `playwright.config.ts` rakentaa erillisen
tuotantokäännöksen (`npx next build && npx next start`) omaan `E2E_DIST_DIR`-hakemistoonsa
(`.next-e2e`, `.gitignore`ssa) sen sijaan että käyttäisi `next dev`iä — `NEXT_PUBLIC_*`-muuttujat
upotetaan käännösaikaan, joten emulaattorilippu asetetaan jo build-vaiheessa. Tämän jälkeen
molemmat testit ovat olleet vakaita useilla peräkkäisillä ajoilla.

## 5. Simulaatiotestaus (SPEC 15.3 + laajennettu skenaario)

### 5.1 `npm run simulate` — perusalgoritmi ilman käyttöliittymää

Ajettu useilla N-arvoilla molemmille logiikoille aiemmissa vaiheissa (E) algoritmin
valmistuttua, SPEC 15.3:n vaatimalla tavalla ("aja tämä jokaisella N=8…20 ennen kuin ilmoitat
turnauslogiikan valmiiksi") — kaksi todellista jumi-bugia löytyi ja korjattiin silloin (ks.
`docs/PROGRESS.md`, Vaihe E: bracket-päivitys jäi soveltamatta osalle kierroksista; toinen
osallistuja löysi ensimmäisen osallistujan jo luoman ottelun `matchId`:n perusteella ja jätti
väärin luomatta omansa). Uudelleenajettu tässä vaiheessa N=8:lla kahdella osallistujalla
osana § 5.3:n tutkintaa — päättyi siististi.

### 5.2 `npm run simulate:scenario` — laajennettu monitasting-skenaario (uusi tässä vaiheessa)

Tämä on suoraan vastaus käyttäjän Vaihe H -pyyntöön: "useampia tastingejä samaan aikaan, osa
niistä round robin ja osa sveitsiläisellä turnauskaaviolla". `scripts/simulate-scenario.ts` luo
**yhden tapahtuman ja viisi rinnakkaista tastingia**:

1. `RR-pieni` — Round Robin, 4 tuotetta, arvaus päällä.
2. `Swiss-pieni` — Swiss, 8 tuotetta, arvaus + pronssiottelu päällä.
3. `RR-toinen-samaan-kategoriaan` — Round Robin, 3 tuotetta, jakaa tuotenimen ("Atria")
   ensimmäisen kanssa — testaa all-time-tilastojen nimien yhdistämistä.
4. `Swiss-jaa-kesken` — Swiss, 9 tuotetta (pariton, pakottaa vapaataipaleet), jätetään
   tarkoituksella kesken.
5. `Ei-koskaan-aloitettu` — Round Robin, 3 tuotetta, ei koskaan käynnistetä.

Kuusi tastingia luotaessa kuudes hylätään `MAX_TASTINGS_PER_EVENT`-rajan (5) mukaisesti.
Seitsemän osallistujaa kirjautuu, yksi suljetaan pois `Swiss-pienestä`. Kaikki neljä
käynnistettyä tastingia pelataan **lomittain samanaikaisesti** (kierros vuorotellen jokaisessa),
sekä bulk-tarjoiluominaisuutta (`markAllPendingServed`) että yksittäistarjoilua käyttäen.
Kaikki 25 tarkistusta läpäisty:

- Kuudennen tastingin luonnin hylkäys (raja 5).
- Jokainen kelpoinen osallistuja suoritti jokaisen pelattavan tastingin loppuun.
- Poissuljettu osallistuja pysyi poissuljettuna (`participantState === null`).
- Julkaisu onnistui, myös tahallinen kaksoisjulkaisu (idempotenssi, ei tuplaviestejä).
- Tulosten laskenta toimi julkaisun jälkeen, poissuljettu puuttui Swiss-pienen
  osallistujapisteistä.
- **All-time-kategoria (`categories/makkarat`) yhdistää kolmen julkaistun tastingin 14 uniikkia
  tuotetta yhteen dokumenttiin** — "Atria" esiintyy vain kerran `eventCount:2`:lla, ei kahtena
  erillisenä rivinä. Swiss-pienen 8 tuotetta (esim. "Olut 1") päätyivät samaan kategoriaan kuin
  RR-tastingien tuotteet.
- Tapahtumanlaajuinen arvausranking (`computeEventGuessingRanking`) ei tyhjä, laskee yli kahden
  julkaistun arvaus-tastingin.
- Arkistointi sekamuotoisella tasting-joukolla: `Ei-koskaan-aloitettu` kierrätyi
  `completed`/`statsCommitted:true`:ksi (SPEC 14), `Swiss-jaa-kesken` pysyi oikein
  `in_progress`-tilassa (arkistointi kierrättää vain `pending`-tastingit, ei aidosti kesken
  olevia), tapahtuma itse `archived`.

**Kehitysvaiheen oma bugi (ei tuotebugia):** ensimmäinen versio skriptistä antoi jokaiselle
tastingille kuvitteellisen `category`-kentän, jota `CreateTastingInput`:ssa ei ole — kategoria
kuuluu vain tapahtumalle (SPEC 3), ei tastingille. Korjattu poistamalla kenttä ja korvaamalla
väärä väite ("`categories/oluet` pitäisi olla olemassa") oikealla (`knownItems.length===14`).

### 5.3 Löydös: 8 tuotteen Swiss-tasting tarvitsee ~29–30 kierrosta, ei vain N−1

Playwright-testejä kehitettäessä `Swiss`-tasting (8 tuotetta, oletus 2 alkusarjakierrosta) ei
näyttänyt valmistuvan odotetussa ajassa selaimessa. Tutkittiin `npm run simulate`illa suoraan
kirjastotasolla (ei selainta, ei HTTP:tä) — **sama ilmiö toistui identtisesti**: molemmat
osallistujat tarvitsivat 29–30 kierrosta ennen `DONE`-tilaa.

Syy löytyi `lib/rounds.ts::maxSeedingRounds`ista: `tasting.seedingRounds + 4` — oletuksella
`seedingRounds=2` tämä on **6 alkusarja-"kierrosta"**, mutta jokainen niistä on itse asiassa
korillinen rinnakkaisia paritustapahtumia (jopa `floor(N/2)=4` paria 8 tuotteella), jotka yksi
osallistuja kokee **peräkkäisinä** yksittäisinä maisteluina, koska hän voi maistaa vain yhden
parin kerrallaan. 6 alkusarjakorillista × ~4 paria/kori ≈ 22–24 peräkkäistä kierrosta, plus
pudotuspelien kiinteät `N−1=7` (8 tuotetta, ei pronssiottelua) = ~29–31. Tämä täsmää tarkasti
havaittuun lukuun eikä ole ikuinen silmukka — algoritmi päättyy aina äärellisessä ajassa
(SPEC 15.1:n oma "identtiset arviot" -testi kattaa juuri tämän eikä ole koskaan epäonnistunut).

**Tämä ei ole bugi**, mutta on aito, aiemmin dokumentoimaton löydös: 8 tuotteen Swiss-tasting on
huomattavasti pidempi istunto kuin `N−1=7`-lukema antaisi ymmärtää — järjestäjän luontilomake
näyttää tämän jo oikein arvioituna kestona (`swissMaxSeedingPairs`-laskelma
`OrganizerCreateEvent.tsx`:ssä), mutta on syytä nostaa esiin erikseen tässä raportissa, koska se
selittää miksi `e2e/multi-tasting.spec.ts` tarvitsi ison kierrosbudjetin (400 passia) eikä
tarkoita mitään toiminnallista puutetta. **Suositus jatkoa varten:** jos 8 tuotteen Swiss-tasting
tuntuu käyttäjätestauksessa liian pitkältä, harkitse organisaattorin UI:hin selkeämpää varoitusta
("tämä logiikka voi tarkoittaa yli 25 maistelua per osallistuja jo minimikoolla") — SPEC:iä ei
muuteta tässä, tämä on vain havainto kirjattavaksi jatkokehitykseen.

## 6. Playwright-selaintestit (SPEC 15.4 + laajennus)

`npm run e2e` — ajettu oikeasti (ei vain kirjoitettu), Chromium ladattu ja käytetty. Kahden testin
suite, molemmat käyttävät kolmea samanaikaista selainkontekstia (järjestäjä + kaksi osallistujaa):

- **`e2e/smoke.spec.ts`** — SPEC 15.4:n vaatima savutesti sanasta sanaan: järjestäjä kirjautuu →
  luo tapahtuman ja Round Robin -tastingin N=4 → kaksi osallistujaa kirjautuu → järjestäjä
  tarjoilee → osallistujat arvioivat kaikki 6 paria → järjestäjä julkaisee → molemmat osallistujat
  näkevät tulokset selaimessa oikeasti. ✅ n. 35–40 s ajoaika.
- **`e2e/multi-tasting.spec.ts`** — käyttäjän eksplisiittinen lisäpyyntö: yksi tapahtuma, **yksi
  Round Robin- ja yksi Swiss-tasting rinnakkain**. Vahvistaa selaimessa asioita joita
  `simulate-scenario.ts` ei voi (se ei aja selainta): molemmat tasting-kortit näkyvät
  osallistujan näytöllä samaan aikaan, RR:n valmistuminen ei häiritse yhä kesken olevaa Swissiä,
  RR:n julkaisu näyttää tulokset vain RR-kortissa (Swiss pysyy "kaikki kierrokset suoritettu,
  ei vielä julkaistu" -tilassa), ja lopuksi myös Swissin julkaisu toimii itsenäisesti. ✅ n.
  2,5–3 min ajoaika (§ 5.3:n selittämä pitkä Swiss-istunto).

### Testiharjoitteluvaiheessa löytyneet ja korjatut testiskriptin bugit (ei tuotebugeja)

Nämä olivat kaikki `e2e/helpers.ts`:n omia virheitä, löytyivät ja korjattiin ennen kuin testit
saatiin vihreiksi — listattu koska ne olisivat voineet naamioitua tuotebugeiksi:

1. Tapahtuman nimikenttä vaihtaa tekstiä ("Tapahtuman nimi" → "Uuden tapahtuman nimi") kun
   edellisestä testiajosta jäi aktiivinen tapahtuma auki (emulaattori säilyy koko
   `npm run e2e`-ajon yli) — case-sensitive regex ei tunnistanut tätä, ja ylikirjoitusvahvistus
   (`Ymmärrän, korvaa käynnissä oleva tapahtuma`) puuttui kokonaan. Korjattu.
2. Hallintapaneelin tasting-valitsin (`<select>`) latautuu asynkronisesti erillisen hakupyynnön
   kautta — pelkkä `isVisible()`-tarkistus kilpaili tämän kanssa ja saattoi ohittaa valinnan
   kokonaan, jolloin testi ohjasi väärää tastingia. Korjattu odottamalla elementin ilmestymistä.
3. `ResultsView` toistaa otsikkotekstin ("Ryhmän tulokset", "Omat pisteet") sekä osiona että
   vientivalintaruudun tekstinä — pelkkä `getByText` osui kahteen elementtiin
   (Playwrightin "strict mode violation"). Korjattu rajaamalla otsikon omaan CSS-luokkaan.
4. Hallintapaneelin "Kuittaa kaikki odottavat" -painike ja osallistujan "Hyväksy"-painike voivat
   irrota DOM:sta kesken klikkauksen, kun taustapollaus piirtää näkymän uudelleen — ilman
   aikakatkaisua Playwright saattoi jäädä yrittämään uudelleen koko testin ajan. Korjattu lyhyellä
   `timeout`-arvolla + `catch`illa niin että seuraava kierros yrittää uudelleen tuoreella
   elementillä.

## 7. `npm run build` ja selainbundlen tarkistus

`npm run build` (oikea tuotantoasetuksin, ei emulaattorilippua) ✅. Tarkistettu grepillä ettei
`.next/static/`-hakemistossa esiinny `SESSION_SECRET`, `FIREBASE_SERVICE_ACCOUNT` tai
`serviceAccountKey` — ei osumia (CLAUDE.md § "Salaisuudet vain palvelinpuolella").

## 8. Mitä TÄSTÄ ympäristöstä ei voi testata

Tämä on Windows-työasema komentorivillä, ei ihmiskäyttäjä eikä oikeita fyysisiä laitteita. Seuraavat
jäävät tämän istunnon ulkopuolelle riippumatta työkaluista:

1. **Aito visuaalinen/käytettävyysarvio** — värikontrasti, typografian luettavuus, painikkeiden
   kosketuskohteen koko, yleinen "tuntuuko tämä hyvältä" -arvio. Playwright todentaa toiminnan,
   ei ulkoasun laatua.
2. **Oikea mobiilinäyttö ja kosketuseleet** — Playwright voi simuloida 375px-viewportin, mutta ei
   korvaa oikeaa puhelinta/tablettia: todellinen kosketuksen tarkkuus, selaimen omat
   käyttöliittymäelementit (osoiterivi vie tilaa), zoomaus, autofill-käyttäytyminen.
3. **iOS Safari ja Web Audio -käytös** — SPEC 9:n äänimerkit nojaavat `AudioContext`iin, jonka
   autoplay-politiikka ja käyttäytyminen taustalla/lukitulla näytöllä vaihtelevat erityisesti
   iOS Safarissa. Tässä ympäristössä on vain Chromium.
4. **Äänen todellinen kuuluvuus/oikeellisuus** — piippausten äänenvoimakkuus, sävelkorkeuden
   sopivuus, kuuluuko ääni häiritsevän kovaa/hiljaista oikeassa tilassa.
5. **Todellinen monen laitteen samanaikainen kuormitus** SPEC 3:n MAX_PARTICIPANTS_PER_EVENT=20
   rajalla — Firestore Spark -tason kirjoitusrajat/nopeusrajoitukset todellisen 20 osallistujan
   samanaikaisen käytön alla (tämä istunto testasi enintään 2 samanaikaista selainkontekstia).
6. **Kopiointi leikepöydälle ja tiedostolataus oikeassa selaimessa** — `navigator.clipboard` ja
   `<a download>` vaativat käyttäjän myöntämän kontekstin/gesturen jota automaatio ei aina
   todenna samalla tavalla kuin oikea käyttäjä; toiminnallisuus on koodikatselmoitu muttei
   selaimessa klikattu tässä istunnossa.
7. **Kieliasun/sävyn hienosäätö** — suomenkielisten virheilmoitusten ja ohjetekstien luonnollisuus,
   sävyn sopivuus (esim. arvauskisan loppuviestit) vaatii äidinkielisen lukijan arvion, ei vain
   sen tarkistamisen että teksti täsmää testissä odotettuun merkkijonoon.

## 9. Ehdotetut promptit toiselle kielimallille (Claude tai Gemini, Pro-tilaus)

Kopioi alla oleva prompti sellaisenaan (täytä `<...>`-kohdat), liitä mukaan kuvakaappaus tai linkki
käynnissä olevaan sovellukseen kun mahdollista.

**A) Visuaalinen/käytettävyysarvio (kuvakaappauksilla):**
> Olen rakentanut suomenkielisen sokkotasting-verkkosovelluksen (Next.js). Liitän kuvakaappauksia
> järjestäjän ja osallistujan näkymistä (kirjautuminen, tastingin luonti, arviointilomake liukusäätimellä,
> tulosnäkymä). Arvioi käytettävyyttä ja visuaalista selkeyttä: onko liukusäädin selkeä maallikolle,
> onko painikkeiden hierarkia looginen, onko virheilmoitusten sijoittelu selkeä, toimiiko asettelu jos
> teksti pitenee (pitkät tuotenimet, monta osallistujaa listassa)? En pyydä koodimuutoksia, vain
> konkreettisia parannusehdotuksia perusteluineen.

**B) Mobiilikäyttö oikealla puhelimella:**
> Avaa <julkinen testi-URL, jos sellainen julkaistaan> puhelimesi selaimessa (Safari jos iPhone,
> Chrome jos Android). Kirjaudu osallistujaksi nimellä "<testinimi>" ja yhteisellä salasanalla
> "<salasana>". Kokeile koko osallistujan polkua: kirjautuminen, liukusäätimen käyttö sormella,
> äänimerkkien salliminen ja kuuluminen (jos ajastin päällä), tulosten selaaminen. Raportoi mikä
> tuntui kömpelöltä tai ei toiminut, erityisesti liukusäätimen tarkkuus ja ajastimen äänimerkit.

**C) Kieliasun tarkistus:**
> Liitän tähän kaikki suomenkieliset käyttöliittymätekstit ja virheilmoitukset tästä
> sokkotasting-sovelluksesta [liitä `grep`-poiminta kaikista JSX-tekstisisällöistä ja
> `error:`-merkkijonoista `src/`-hakemistosta]. Tarkista kieliopin oikeellisuus, sävyn
> yhdenmukaisuus ja luonnollisuus. Kiinnitä erityistä huomiota arvauskisan loppuviesteihin — niiden
niiden pitää olla kannustavia eikä koskaan ivallisia tai väheksyviä.

**D) Kuormitustesti-suunnitelma Firebase Spark -rajoille:**
> Tässä on Firestoren Spark-tason ilmaisrajat [liitä linkki/taulukko] ja tämä sovelluksen
> tietomalli [liitä `docs/SPEC.md`in luku 3]. Sovellus sallii enintään 20 osallistujaa ja 5
> rinnakkaista tastingia per tapahtuma, osallistujat pollaavat tilaansa 3–4 sekunnin välein.
> Arvioi: voiko 20 osallistujaa + 5 rinnakkaista tastingia ylittää Sparkin päivittäisen
> luku/kirjoitusrajan yhden illan tapahtumassa, ja jos, missä kohtaa raja tulisi todennäköisimmin
> vastaan?

## 10. Yhteenveto: onko tuotanto valmis?

Kaikki automatisoitu testaus (yksikkö-, integraatio-, simulaatio- ja selaintestit) on vihreää, ja
tämän vaiheen laajennettu skenaariotestaus vahvisti nimenomaan käyttäjän pyytämän tapauksen:
useampi rinnakkainen tasting, RR ja Swiss sekaisin, poissulkemisia, samanaikaista etenemistä.
Yksi aito, hyödyllinen löydös (§ 5.3) kirjattiin muttei vaatinut koodikorjausta — se on odotettu
käytös, ei bugi. Ennen tuotantoon siirtoa jäljellä on `docs/TESTIKASIKIRJA.md`:n manuaalinen
läpikäynti oikealla ihmisellä ja § 8:n listaamat asiat, jotka vaativat ihmisarviota tai oikeita
laitteita.
