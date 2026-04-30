# App.jsx-jakosuunnitelma

App.jsx on tällä hetkellä **5524 riviä**, josta `Piilosana`-funktio yksinään
**3143 riviä**. Funktiossa on **127 useState-kutsua** ja **27 useEffectiä**.
Tämä on klassinen "god component" -antipattern: kaikki sovelluksen tila ja
käyttäytyminen yhdessä funktiossa.

## Tilanne 100-rivin jaksoissa

```
Lines          state  effect  cb    JSX   funcs
2382-2581       42      7      9     0     32   <- setup: state, hooks
2582-2781       54      3      3     0     23   <- lisää statea
2782-2981       31      4      5     0     44   <- audio, animaatiot
2982-3181        0      6      2     0     38   <- game logic
3182-3381        0      3      3     0     33   <- handlers
3382-3581        0      2      4     0     44   <- score, achievements
3582-3781        0      3      3     0     30   <- enemmän logiikkaa
3782-3981        0      0      0     0     14   <- pieni välitila
3982-4181        1      0     11     1     27   <- menu callbackit
4182-4381        0      0      0     9      9   <- menu UI
4382-4581        0      0      0    16      3   <- daily UI
4582-4781        0      0      0    25      9   <- popupit
4782-4981        0      0      0    48      0   <- lobby
4982-5181        0      0      0    18     36   <- game grid + HUD funktiot
5182-5381        0      0      0    26     16   <- ending overlay
5382-5524        0      0      0    18      4   <- viimeiset palaset
```

## Strategia: hook-pohjainen jako

Jaetaan tila ja efektit **custom-hookeihin** ja containerit **screen-komponentteihin**.
Tämä noudattaa samaa pattern:ia kuin jo olemassa oleva `useDailyPercentile`.

### Vaihe 1: Hookit (turvallinen, ei UI-muutoksia)

Jokainen hook ottaa minimi-propsit ja palauttaa `{ state, actions }`-paketin.
Tämä mahdollistaa testauksen `renderHook`:lla.

**`hooks/useAudioSystem.js`** — n. 200 riviä siirtyy
- Imports: useSounds, useMusic
- State: musicTrack, sound, music, mute toggles
- Effects: localStorage sync, music start/stop
- Returns: `{ playClick, playSuccess, playFail, toggleSound, toggleMusic, ... }`

**`hooks/useGameSession.js`** — n. 300 riviä
- State: grid, validWords, foundWords, score, timeLeft, gameMode, gameStatus
- Effects: timer tick (solo), scramble animation, ending detect
- Actions: `submitWord`, `endGame`, `resetGame`
- Returns the whole game state

**`hooks/useMultiplayer.js`** — n. 400 riviä
- State: socket, roomCode, players, scores, lobbyState
- Effects: socket setup, listener wires (join_public, public_word_found,
  room_update, game_started, game_over, server_draining)
- Actions: `joinPublic`, `leavePublic`, `createRoom`, `joinRoom`, `startGame`
- Returns connection + actions

**`hooks/useDailyChallenge.js`** — n. 200 riviä
- State: dateStr, dailyResult, streak, percentile
- Effects: load from localStorage + server, update on play
- Actions: `recordResult`, `submitDailyScore`
- Returns daily state

**`hooks/useAuthSession.js`** — n. 150 riviä
- State: nickname, password (in-mem session), authMode, authError
- Actions: `login`, `register`, `logout`, `forgotPassword`
- Effects: persist to localStorage
- Returns: `{ user, login, ... }`

**`hooks/useAchievements.js`** — n. 200 riviä
- State: unlocked dictionary
- Effects: detect new achievements after game, sync to server
- Action: `markUnlocked`

Yhteensä n. **1450 riviä** siirtyy hookeihin. App.jsx kutistuu n. 4000 → 2700 riviin
ilman yhdenkään pixelin muutosta UI:ssa.

### Vaihe 2: Screen-komponentit

Kun hookit ovat erillään, JSX:n voi jakaa container-komponentteihin.

**`screens/MenuScreen.jsx`** — n. 400 riviä
- Käyttää: `useDailyChallenge`, `useAuthSession`, `useMultiplayer`
- Sisältää: AuthPanel, DailyHeroCard, DayBoxRow, MultiplayerHero, MenuButton-rivi
- Jo olemassa olevat sub-komponentit liitetään tähän

**`screens/LobbyScreen.jsx`** — n. 200 riviä
- Käyttää: `useMultiplayer`
- Sisältää: MultiplayerLobby (jo komponentti)

**`screens/GameScreen.jsx`** — n. 700 riviä
- Käyttää: `useGameSession`, `useAudioSystem`, hex/grid render-logiikka
- Tämä on raskain — sisältää grid-renderöinnin, valinnan tracking, animaatiot
- Voi vielä jakaa: `<HexGrid>`, `<GameHUD>`, `<EndingOverlay>`

**`screens/ResultsScreen.jsx`** — jo olemassa, vain wire up

App.jsx jää **n. 200 riviä** routing-logiikaa: nykyisen `mode`-statein perusteella
valitsee oikean screen-komponentin ja välittää hookkien tilat.

## Lopullinen tavoitetila

```
App.jsx                    ~200    routing
hooks/
  useAudioSystem.js        ~250
  useGameSession.js        ~350
  useMultiplayer.js        ~450
  useDailyChallenge.js     ~250
  useAuthSession.js        ~200
  useAchievements.js       ~250
screens/
  MenuScreen.jsx           ~400
  LobbyScreen.jsx          ~200
  GameScreen.jsx           ~700
  HexGrid.jsx              ~300
  GameHUD.jsx              ~200
```

## Suoritusjärjestys (per istunto)

Yksi hook per istunto, build + smoke per vaihe:

1. **`useAudioSystem`** ensin — yksinkertaisin, vähiten riippuvuuksia muuhun tilaan
2. **`useDailyChallenge`** — keskitetty data, puhdas API
3. **`useAuthSession`** — pieni, tilaltaan eristetty
4. **`useAchievements`** — riippuu vähän muusta
5. **`useGameSession`** — kriittinen, isompi
6. **`useMultiplayer`** — vaatii Socket.IO-events, suurin riski
7. Sitten container-komponentit yksi kerrallaan

Joka vaiheen jälkeen: `npm test` + manuaalinen smoke (peli läpi soolona ja
arenassa). Pushaa per vaihe, ei yhdellä isolla paketilla.

## Riskit

- **127 useState on iso ketju**: lähes jokainen tila vaikuttaa muihin. Hookit
  joudutaan ehkä jakamaan reaktioiden mukaan, eivätkä ne ole täysin
  itsenäisiä. Saattaa vaatia "shell"-pattern jossa App.jsx omistaa minimaalisen
  yhteisen tilan ja välittää sen hookeille.
- **Multiplayer + game session keskustelevat**: socket events päivittävät
  game state -tilaa. Vältetään kahteen suuntaan virtaava data käyttämällä
  callbackeja tai jaettua context-objektia.
- **Animation/timer state on tahmeaa**: useEffect-cleanup tärkeä, jotta
  mounted-flagit eivät vuoda.

## Vaihtoehto: lykätä tämä

Jos uusia features on kiireellisempiä kuin koodikuntoa, App.jsx voi pyöriä
vielä kuukausia — se ei kaadu, vain hidastaa kehitystä uusien feature:ien
kohdalla. Server-puoli on nyt niin hyvällä mallilla että uudet feature:t
on usein backend-painotteisia ja App.jsx:ää ei tarvitse koskea.
