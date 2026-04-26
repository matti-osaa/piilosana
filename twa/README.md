# Piilosana TWA — Google Play -julkaisu

## Vaatimukset

- Node.js 14+
- JDK 17 (Bubblewrap asentaa automaattisesti)

## Vaihe 1: Asenna Bubblewrap

```bash
npm install -g @bubblewrap/cli
```

## Vaihe 2: Alusta projekti

```bash
cd twa
bubblewrap init --manifest https://piilosana.com/manifest.json
```

Bubblewrap kysyy seuraavat tiedot (suositusarvot alla):

| Kenttä | Arvo |
|--------|------|
| Domain | piilosana.com |
| App name | Piilosana — Sanapeli |
| Short name | Piilosana |
| Package ID | com.piilosana.app |
| App version name | 1.0.0 |
| App version code | 1 |
| Display mode | standalone |
| Status bar color | #0a0a1a |
| Navigation bar color | #0a0a1a |
| Signing key alias | piilosana |
| Key store password | (valitse oma salasana, muista tallentaa!) |

## Vaihe 3: Buildaa

```bash
bubblewrap build
```

Tämä tuottaa `app-release-signed.aab` -tiedoston, jonka lataat Google Play Consoleen.

## Vaihe 4: Digital Asset Links

Buildin jälkeen Bubblewrap tulostaa SHA-256 fingerprint -arvon.
Päivitä se tiedostoon `assetlinks.json` ja pushaa palvelimelle.

Tiedosto pitää olla saatavilla osoitteessa:
`https://piilosana.com/.well-known/assetlinks.json`

## Vaihe 5: Lataa Play Consoleen

1. Avaa Google Play Console
2. Luo uusi sovellus
3. Mene: Testaus → Suljettu testaus → Luo uusi testi
4. Lataa `app-release-signed.aab`
5. Lisää testaajat (12+ Gmail-osoitetta)
6. Julkaise suljettu testi
