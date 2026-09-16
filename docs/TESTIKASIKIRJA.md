# TESTIKASIKIRJA.md — manuaalinen hyväksymistestaus

> Tämä on ihmiselle tarkoitettu käsikirja, ei automaatiota. Käy läpi ennen tuotantoon siirtoa
> (`docs/CUTOVER.md`) tai kun haluat vahvistaa muutoksen toimivan oikeasti selaimessa. Käytä
> paikallista kehityspalvelinta emulaattoria vasten — älä koskaan tuotanto-Firestorea vasten.

## Valmistelu

```bash
firebase emulators:start --only firestore   # yksi terminaali, jää auki
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed:config -- testadmin testsalasana tapahtumasalasana
NEXT_PUBLIC_USE_FIRESTORE_EMULATOR=true npm run dev   # toinen terminaali
```

Avaa kaksi selainikkunaa (tai yksi normaali + yksi incognito, jotta evästeet eivät sekoitu):
yksi järjestäjälle (`/jarjesta`), yksi osallistujille (`/osallistu`, kirjaudu useaan kertaan eri
välilehdillä/incognito-ikkunoilla eri osallistujiksi).

## 1. Järjestäjän kirjautuminen ja tapahtuman luonti

- [ ] `/jarjesta` avautuu, näyttää kirjautumislomakkeen ("Tunnus", "Salasana").
- [ ] Väärä salasana → selkeä suomenkielinen virheilmoitus, ei kaadu.
- [ ] Oikeilla tunnuksilla (`testadmin`/`testsalasana`) kirjautuminen onnistuu.
- [ ] Tapahtuman luonti nimellä ja kategorialla onnistuu.
- [ ] Yritä luoda toinen tapahtuma ilman ylikirjoitusvahvistusta → painike pysyy pois käytöstä,
      selkeä teksti kertoo että käynnissä on jo tapahtuma.

## 2. Tastingin luonti — Round Robin

- [ ] Luo Round Robin -tasting 4 tuotteella, oletusarvot muuten.
- [ ] Kokeile luoda alle 3 tuotteella → estyy selkeällä virheellä.
- [ ] Kokeile tuotenimen toistoa (sama nimi kahdesti) → estyy.
- [ ] "Paria per osallistuja" -arvio näkyy oikein lomakkeella (4 tuotteelle: 6).
- [ ] Käynnistä tasting ("Käynnistä"-painike) → tila vaihtuu näkyvästi.

## 3. Tastingin luonti — Sveitsiläinen turnaus

- [ ] Vaihda logiikaksi "Sveitsiläinen turnaus" → tuotekenttien vähimmäismäärä kasvaa 8:aan.
- [ ] Luo 8 tuotteella, arvausominaisuus ja pronssiottelu päällä.
- [ ] Lomake näyttää sekä pudotuspeliottelujen määrän että varoituksen alkusarjan vaihtelevasta
      pituudesta (ei tarkkaa lukua etukäteen).
- [ ] Kokeile 64 tuotetta → varoitusteksti "jopa 127 maistelua per osallistuja" näkyy.
- [ ] Käynnistä tasting.

## 4. Kuudes tasting

- [ ] Luo tastingeja kunnes niitä on 5 → lomake katoaa/rajautuu, "Tastingit (5/5)" näkyy eikä
      kuudetta voi enää luoda.

## 5. Osallistujan kirjautuminen ja rinnakkaiset tastingit

- [ ] `/osallistu` avautuu, kirjaudu nimellä "Testaaja 1" ja tapahtumasalasanalla.
- [ ] Molemmat käynnistetyt tastingit (RR ja Swiss) näkyvät omina kortteinaan samaan aikaan.
- [ ] Kirjaudu toisella nimellä toisessa selainikkunassa ("Testaaja 2").
- [ ] Kirjaudu samalla nimellä ("Testaaja 1") kolmannessa ikkunassa → ensimmäinen istunto näyttää
      viestin "Kirjauduit sisään toisella laitteella..." ja palaa kirjautumisnäkymään.

## 6. Tarjoilu ja arviointi

- [ ] Järjestäjän hallintapaneelissa (`/jarjesta/dashboard`) valitse RR-tasting, "Kuittaa
      tarjoiltu" yhdelle osallistujalle → osallistujan näytölle ilmestyy arviointilomake.
- [ ] "Kuittaa kaikki odottavat" tarjoilee molemmille kerralla.
- [ ] Liukusäädin: siirrä ääripäähän (0 ja 50), varmista että molemmat pisteet näkyvät oikein
      lomakkeella reaaliajassa.
- [ ] Muistiinpanokenttä: kirjoita yli 500 merkkiä → katkeaa 500 merkkiin.
- [ ] Arvausosio (jos päällä): valitse sama tuote molemmille → estävä virheilmoitus.
- [ ] Lähetä arviointi → seuraava kierros tarjolle tai "Odottaa tarjoilua" -tila näkyy.
- [ ] Swiss-tastingissa: yritä asettaa liukusäädin tasan keskelle (25/25) → sovellus siirtää sen
      automaattisesti pois tasapelistä (26/24).

## 7. Poissulkeminen

- [ ] Merkitse yksi osallistuja "Ei osallistu tähän tastingiin" -valinnalla hallintapaneelissa.
- [ ] Kyseisen osallistujan näytöllä tastingkortti näyttää "Et osallistu" eikä tarjoa arviointia.

## 8. Ajastin (jos kierrosaika asetettu)

- [ ] Luo tasting kierrosajalla (esim. 1 min).
- [ ] Osallistujan ensimmäinen kortti pyytää äänimerkkilupaa ennen kuin arviointi avautuu.
- [ ] Salli äänimerkit → ajastin käynnistyy, laskuri näkyy.
- [ ] Anna ajan mennä nollaan → lomake ei lukkiudu, arviointi onnistuu silti (SPEC: negatiivinen
      aika ei koskaan estä lähettämistä).
- [ ] Kuuntele äänimerkit itse (kaiuttimet päällä) — arvioi kuuluvatko ne selkeästi.

## 9. Julkaisu ja tulokset

- [ ] Kun tasting on täysin pelattu, hallintapaneeli näyttää ennakkotulokset ("Tulokset
      (ennakko)") jo ennen julkaisua.
- [ ] Osallistuja EI näe tuloksia ennen julkaisua (tastingkortti näyttää "Kaikki N kierrosta
      suoritettu." eikä tuloksia).
- [ ] Julkaise ("Päätä tasting ja julkaise" → "Vahvista julkaisu").
- [ ] Kaikki osallistujat näkevät tulokset (ryhmän sijoitus, omat pisteet, muistiinpanot,
      arvauskisa jos päällä).
- [ ] Kokeile "Kopioi leikepöydälle" ja "Lataa .md-tiedostona" — tarkista tiedoston/leikepöydän
      sisältö on järkevää suomenkielistä Markdownia.

## 10. All-time-tilastot

- [ ] Julkaise toinen tasting samaan kategoriaan, jossa on sama tuotenimi kuin ensimmäisessä
      (esim. sama valmistaja/tuote eri kirjainkoolla tai ylimääräisillä välilyönneillä).
- [ ] Vahvista tulosnäkymässä (tai suoraan Firestore-emulaattorin UI:sta, `http://127.0.0.1:4000`)
      että tuote yhdistyy yhdeksi riviksi eikä kahdeksi.

## 11. Tapahtuman sulkeminen

- [ ] Jätä yksi tasting `pending`-tilaan (ei koskaan käynnistetty).
- [ ] Sulje tapahtuma ("Sulje tapahtuma" → vahvistus, varoitusteksti näkyy).
- [ ] Vahvista että käynnistämätön tasting kirjautuu valmiiksi (ei vaadi julkaisua enää).
- [ ] Yritä kirjautua osallistujaksi suljettuun tapahtumaan → estyy, tai jos jo kirjautuneena,
      seuraava toiminto palauttaa selkeän virheen istunnon mitätöitymisestä.

## 12. Yleinen läpikäynti eri näytöillä

- [ ] Kavenna selainikkuna kapeaksi (~375px, esim. selaimen devtoolsin laiteemulaatio) — kaikki
      lomakkeet ja tulostaulukot pysyvät käytettävinä, mikään ei leikkaudu piiloon.
- [ ] Suurenna selaimen tekstikokoa (Ctrl/Cmd + useita kertoja) — asettelu ei riko itseään.
- [ ] Käy koko osallistujan polku läpi näppäimistöllä (Tab-järjestys looginen, painikkeet
      aktivoituvat Enterillä/Spacella).

---

Kun kaikki yllä olevat on käyty läpi ja merkitty, sovellus on hyväksyttävissä käyttöön.
Kirjaa mahdolliset löydökset `docs/PROGRESS.md`:hen ennen `docs/CUTOVER.md`:n suorittamista.
