Määrittelydokumentti: Sokkotasting-verkkosovellus (Versio 2.2 - Lukittu)
1. Yleiskatsaus ja Tavoite
Sovellus on työkalu sokkotasting-tapahtumien järjestämiseen ja läpiviemiseen. Sen ensisijainen tavoite on auttaa tastingin järjestäjää hallitsemaan maistelun kulkua (asynkronisesti ja sokkona) sekä tarjota osallistujille helppokäyttöinen arviointityökalu, joka laskee tulokset automaattisesti. Sovellus on mobiilioptimoitu, käyttää "night mode" -tyyliä (tumma tausta, vaalea teksti) ja on ehdottomasti ilmainen sekä rakentaa että käyttää.

2. Käyttäjäroolit ja Kirjautuminen
Sovelluksessa on kaksi roolia: Järjestäjä ja Osallistuja.

Kirjautuminen ja Salasana: Yksinkertainen, kaikille yhteinen salasana, joka tallennetaan Firestore-tietokantaan (config-dokumenttiin) ja tarkistetaan asiakaspuolella. Tietoturva on kevyt, mutta salasanan on oltava sen verran vahva, ettei murtautuminen ole triviaalia. Firebase-konfiguraation näkyvyys selaimessa hyväksytään riskinä.
Salasanan asettaminen ja vaihto: Sovelluksessa ei ole omaa käyttöliittymää salasanan asettamiseen. Sen sijaan repositorioon tehdään erillinen, ajettava ylläpitoskripti (Node.js + Firebase Admin SDK), joka kirjoittaa salasanan config-kokoelman dokumenttiin. Kun salasanaa halutaan vaihtaa, päivitetään arvo skriptiin (tai sille annettavaan parametriin/ympäristömuuttujaan) ja ajetaan skripti uudelleen. Skriptiä ei julkaista Verceliin, vaan se ajetaan paikallisesti tarvittaessa.
Tunnistautuminen ja Sessiot: Osallistujat kirjautuvat nimellä/nimimerkillä ja yhteisellä salasanalla. Estetäänkseen saman nimimerkin käyttö kahdella laitteella samaan aikaan, käytetään istuntotunnisteita (session token). Kirjautuessa luodaan satunnainen token, joka tallennetaan selaimen localStorageen ja Firestoreen activeSessionId -kenttään. Uusi kirjautuminen mitätöi vanhan tokenin. Sovellus tarkistaa säännöllisesti, että oma token vastaa tietokannan arvoa – jos ei, käyttäjä kirjataan ulos.
Resilienssi: Koska tasting etenee asynkronisesti ja mobiililaitteilla (akku voi loppua, netti katketa), sovelluksen tila on tallennettuna reaaliajassa Firestoreen. Jos osallistuja kirjautuu uudelleen samalla nimellä, hänen on voitava palata täsmälleen siihen kierrokseen, johon hän jäi.
3. Tapahtuman Kulku ja Logiikka
3.0. Yhtäaikaiset tastingit
Sovellus tukee kerrallaan korkeintaan yhtä aktiivista tastingia (koko sovellus on yhden pienen ryhmän yhteiskäytössä, ei monivuokralainen alusta). config-dokumentissa on kenttä (esim. activeEventId), joka osoittaa käynnissä olevaan events-kokoelman dokumenttiin. Kun osallistuja kirjautuu nimellä ja salasanalla, hän liittyy automaattisesti tähän aktiiviseen tapahtumaan valitsematta sitä erikseen. Kun järjestäjä painaa "Aloita uusi", aiempi tapahtuma (jos oli kesken) jää tietokantaan historiaksi (all-time-tilastoja varten) ja activeEventId päivittyy osoittamaan uuteen. Jos edellinen tapahtuma ei ollut vielä valmis, järjestäjälle näytetään varoitus ennen uuden aloittamista.

3.1. Tapahtuman Luonti (Järjestäjä)
Järjestäjä saapuu sovellukseen ja painaa "Aloita uusi" (tai jatkaa aiempaa). Hän syöttää seuraavat perustiedot:

Tastingin nimi
Kategoria (esim. "grillimakkarat" - mahdollistaa all-time -tilastojen yhdistämisen)
Osallistujien nimet
Maisteltavien tuotteiden nimet
Kerta-annoksen koko (ml/g)
Optio: Arvausominaisuus päälle/pois
Suunnittelutyökalu (Järjestäjälle):Sovellus laskee ja näyttää järjestäjälle etukäteen kombinaatioiden kokonaismäärän tuotteiden määrästä riippuen (esim. 4 tuotetta = 6 paria/osallistuja) sekä kuinka paljon kutakin tuotetta tarvitaan yhteensä (osallistujat x kierrokset x annoskoko).

3.2. Round Robin -parsintalogiikka ja tarkistus
Jokainen osallistuja maistaa kaikki mahdolliset tuoteparit (Round Robin).
Sovellus arpoo maistelujärjestyksen erikseen jokaiselle osallistujalle estääkseen vertaispaineen.
Tarkistusmekanismi: Koodissa on oltava sisäinen validointi, joka tarkistaa arpomisen jälkeen, että jokainen teoreettinen pari löytyy tarkalleen kerran jokaisen osallistujan listalta. Mikäli tarkistus epäonnistuu, arvonta suoritetaan uudelleen ennen tietokantaan tallentamista.
A/B-järjestys parin sisällä: Kummasta tuotteesta tulee kierroksella "A" ja kummasta "B" arvotaan myös satunnaisesti (50/50 per pari), jotta liukusäätimen oletusjako ei suosi systemaattisesti samaa tuotetta.
Maistelu etenee asynkronisesti.
3.3. Järjestäjän näkymä ja hallinta
Järjestäjän dashboard näyttää reaaliajassa tilanteen:

Tarjoilulista ja kuittaus: Sovellus näyttää seuraavan tarjoilun per osallistuja: "Osallistuja Matti: Kierros 2/6. Tarjoile A = Tuote X, B = Tuote Y." Järjestäjä painaa "Kuittaa tarjoiltu".
Tilan seuranta: Järjestäjä näkee tilat: "Odottaa maistiaisia", "Maistamassa", "Odottaa seuraavaa kierrosta".
Väliaikaiset tulokset: Järjestäjä ei näe pisteitä tai muistiinpanoja reaaliajassa, mutta näkee tuotteiden välisen prosentuaalisen rankingin. Laskennassa otetaan huomioon vain täysin valmiiksi kuitatut kierrokset (eli kierrokset, joissa osallistuja on jo hyväksynyt arvionsa). Rankingluku lasketaan tuotteelle: (tuotteen saamat pisteet yhteensä kaikista tähän mennessä valmiista pareista) / (kyseisen tuotteen mahdollinen enimmäispistemäärä valmiista pareista, ts. valmiiden parien lkm x 50) x 100%.
Arvaustilasto: Jos arvaus on päällä, järjestäjä näkee reaaliajassa, miten arvaukset ovat osuneet tähän mennessä.
3.4. Osallistujan näkymä ja arviointi
Kun osallistuja on kirjautunut ja järjestäjä on kuitannut tarjoilun:

Näkyvissä on "Tuote A" ja "Tuote B" (ei oikeita nimiä).
Pisteytys: Osallistuja jakaa 50 pistettä parin kesken isolla liukusäätimellä (slider). Kun A saa arvon (esim. 35), B saa automaattisesti loput (15). Tämä takaa summan 50 ja on nopea käyttää.
Muistiinpanot: Vapaaehtoinen tekstikenttä.
Arvaus (jos päällä): Alasvetovalikot A:lle ja B:lle. Ei saa valita samaa tuotetta molemmille. Valikossa näkyy pienellä lukuna, kuinka monta kertaa kyseistä tuotetta on jo arvattu kyseisen osallistujan omalla historialla.
Kun lomake on täytetty ja hyväksytty, osallistuja siirtyy odottamaan seuraavaa kierrosta.
3.5. Tulokset, All-time -tilastot ja Vienti
Kun kaikki osallistujat ovat suorittaneet kaikki kierrokset, tasting päätyy.

Tulokset: Osallistuja näkee omat tuloksensa rinnakkain ryhmän kokonaistulosten kanssa prosenttilukuina. Oikeat tuotteiden nimet paljastetaan.
All-time -tilastot: Erillinen näkymä, joka listaa kaikki aiemmat saman kategorian tastingit ja niiden lopputulokset. Eri tuotteita ei summata keskenään, vaan ne näytetään tapahtumakohtaisesti.
Tietojen vienti: Käytetään Markdown- ja puhtaana tekstinä. Järjestäjä vie koko paketin (sijoitukset, prosentit, kaikkien pisteet ja muistiinpanot). Osallistuja voi valita checkboxeilla, haluaako viedä omat pisteet, omat muistiinpanot ja/tai kokonaistulokset.
4. Tekninen Arkkitehtuuri ja Työkalut
Koodaus- ja julkaisuketju: VSCode -> GitHub -> Vercel.
Kielet ja Frameworkit: Next.js (React, App Router), TypeScript, Tailwind CSS.
Tietokanta ja Reaaliaikaisuus: Firebase (Firestore). Ilmainen tieri riittää.
Tietoturva (Firebase Security Rules): Säännöt pidetään yksinkertaisina: kaikille lukuoikeus, kirjoitusoikeus rajoitettu vain tarvittaviin kokoelmiin. Salaista tokenia ei vaadita tietokantatasolla.
5. Kehityksen Nykytila
Määrittelyvaihe on päättynyt ja dokumentti on lukittu. Mitään teknistä ei ole vielä tehty. Työkaluja (VSCode, GitHub, Vercel, Firebase) ei ole vielä alustettu. Projektisuunnitelma (Dokumentti 2) ohjaa seuraavaa vaihetta.

Projektisuunnitelma: Sokkotasting-verkkosovellus
Tämä suunnitelma jakaa projektin kuuteen (6) loogiseen vaiheeseen. Jokainen vaihe on itsenäinen kokonaisuus, joka testataan ennen seuraavaan siirtymistä. Koodarin tulee aina työnnetty (git push) koodi GitHubiin vaiheen valmistuttua.

Vaihe 0: Työkalujen alustus ja yhteys

Firestoren luonti, GitHub-repositorion luonti, Next.js-projektin luonti VSCodessa.
Firebase-kirjaston asennus ja firebase.ts -konfiguraatiotiedoston luonti.
Perus-"Night Mode" -tyylien (Tailwind) käyttöönotto.
Tavoite: Tyhjä Next.js-sovellus näkyy Vercelissä omalla URL-osoitteellaan ja yhteydenotto Firebasen on testattu.
Vaihe 1: Tietomallit ja Etusivu

Firestore-tietokannan rakenteen luonti (kokoelmat: events, participants, scores, config).
Sovelluksen etusivun rakentaminen: Valinta "Järjestä" tai "Osallistu".
Salasanan tarkistuslogiikan perusteet (luetaan config-kokoelmasta).
Tavoite: Käyttäjä pääsee etusivulle, näkee modernin tumman käyttöliittymän, ja sovellus osaa hakea salasanan tietokannasta.
Vaihe 2: Järjestäjän työkalut (Tapahtuman luonti ja Round Robin)

Lomake uuden tastingin luomiseen (nimi, kategoria, tuotteet, osallistujat, annoskoko, arvausoptio).
Round Robin -logiikan koodaaminen: Algoritmi, joka arpoo jokaiselle osallistujalle kaikki kombinaatiot satunnaisessa järjestyksessä.
Tarkistusmekanismi: Koodi tarkistaa, että jokainen pari on mukana tarkalleen kerran. Jos ei, arvonta tehdään uudelleen.
Tapahtuman tallentaminen tietokantaan.
Tavoite: Järjestäjä pystyy luomaan tastingin, ja tietokantaan syntyy oikea määrä tarkistettuja, tyhjiä arviointikierroksia jokaiselle osallistujalle.
Vaihe 3: Osallistujan kirjautuminen ja näkymä

Kirjautumislomake (Nimi + Salasana).
Sessiotokenin luonti ja tallennus (localStorage & Firestore), tuplakirjautumisen esto.
"Odottaa maistiaisia" -tilanäkymä (sovellus kuuntelee reaaliajassa järjestäjän kuittausta).
Tavoite: Osallistuja voi kirjautua sisään, näkee "odottaa"-ruudun, ja sessio kestää sivun uudelleenlatauksen yli.
Vaihe 4: Arviointikierros (Interaktioiden ydin)

Järjestäjän dashboard: Näkymä "Kuittaa tarjoiltu" -nappi osallistujakohtaisesti.
Osallistajan arviointilomake: Liukusäädin (A:n pisteet, B laskeutuu automaattisesti), muistiinpanokenttä, arvausalasvetovalikot (joissa laskurit aiemmista arvauksista).
"Hyväksy" -napin logiikka: Tallentaa pisteet ja siirtää osallistujan tilaan "Odottaa seuraavaa".
Tavoite: Tärkeysjärjestys ja tarjoilu/maistelu -sykli pyörii alusta loppuun saakka kahden laitteen välillä reaaliajassa.
Vaihe 5: Tulokset, Tilastot ja Vienti

Laskentalogiikka: Osallistujien pistemäärien yhdistäminen prosentuaalisiksi lopputuloksiksi.
Osallistujan tulosnäkymä (omat vs. ryhmän tulokset, paljastetut nimet).
Järjestäjän tulosnäkymä (kokonaisuus).
All-time -tilastonäkymä (kategorian mukaan filtteröinti).
Markdown- ja tekstimuotoinen vienti (osallistujan valittavissa checkboxein, järjestäjälle täysi paketti).
Tavoite: Sovellus on täysin valmis, tulokset näkyvät oikein, ja ne voi kopioida talteen.