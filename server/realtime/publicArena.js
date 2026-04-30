// publicArena.js – Public arenan tilakone (per-kieli) ja siihen liittyvät
// socket-emit-helpperit. Yksi instanssi per kieli (fi/en/sv), aina käynnissä,
// oma 2 min kierros + 30 s tauko silmukassa.
//
// Käyttö:
//   const arena = createPublicArenaManager({ io, generateGoodGrid });
//   arena.startAll(['fi','en','sv']);
//   const pg = arena.get('fi');
//
// Riippuvuudet:
//   - io                 – Socket.IO server (broadcastia varten)
//   - generateGoodGrid   – (lang, hex) => { grid, validWords }; injektoitu
//                          jotta arenan testaus ei vaadi hex-grid-koodia
//
// Socket-handlerit (join_public, public_word_found, leave_public)
// elävät socketHandlers-moduulissa ja käyttävät tätä manager-objektia.

import { getScoreForWord } from "../game/score.js";
import { canTraceWord } from "../game/validate.js";
import { hasWordInBuf, FULL_WORDS_BUF } from "../words.js";
import { submitScore } from "../db.js";

export const PUBLIC_GAME_TIME = 120; // sekuntia
const COUNTDOWN_BEFORE_START = 5_000;
const NEXT_ROUND_PAUSE = 30; // sekuntia

function createPublicGame() {
  return {
    grid: null,
    validWords: new Set(),
    validWordsList: [],
    players: new Map(), // socketId -> { nickname, score, wordsFound: Set }
    state: "waiting", // 'waiting' | 'countdown' | 'playing'
    timeLeft: PUBLIC_GAME_TIME,
    timer: null,
    countdownTimer: null,
    nextRoundInterval: null,
    roundNumber: 0,
    nextRoundCountdown: 0,
  };
}

export function createPublicArenaManager({ io, generateGoodGrid }) {
  // Tilavarat per kieli
  const games = {};
  // socketId -> lang (jotta tiedetään minkä arenan disconnect/emoji koskee)
  const playerLang = new Map();

  function ensureLang(lang) {
    if (!games[lang]) games[lang] = createPublicGame();
    return games[lang];
  }

  function get(lang) {
    return games[lang] || ensureLang(lang || "fi");
  }

  function roomName(lang) {
    return `public_game_${lang}`;
  }

  // Lähetä päivitetty pistetilanne kierroksen ajan
  function broadcastScores(lang) {
    const pg = get(lang);
    const scores = Array.from(pg.players.entries())
      .map(([, p]) => ({
        nickname: p.nickname,
        score: p.score,
        wordsFound: p.wordsFound.size,
      }))
      .sort((a, b) => b.score - a.score);
    io.to(roomName(lang)).emit("public_score_update", { scores });
  }

  function startRound(lang = "fi") {
    const pg = get(lang);
    const room = roomName(lang);

    if (pg.nextRoundInterval) {
      clearInterval(pg.nextRoundInterval);
      pg.nextRoundInterval = null;
    }

    const { grid, validWords } = generateGoodGrid(lang, true); // hex-grid arenalle
    pg.grid = grid;
    pg.validWords = validWords;
    pg.validWordsList = [...validWords];
    pg.state = "countdown";
    pg.timeLeft = PUBLIC_GAME_TIME;
    pg.roundNumber++;

    for (const [, p] of pg.players) {
      p.score = 0;
      p.wordsFound = new Set();
    }

    io.to(room).emit("public_countdown", {
      grid,
      validWords: pg.validWordsList,
      roundNumber: pg.roundNumber,
      hex: true,
    });

    pg.countdownTimer = setTimeout(() => {
      pg.state = "playing";
      io.to(room).emit("public_game_start");

      pg.timer = setInterval(() => {
        pg.timeLeft--;
        io.to(room).emit("public_timer_tick", { remaining: pg.timeLeft });

        if (pg.timeLeft <= 0) {
          clearInterval(pg.timer);
          pg.timer = null;
          endRound(lang);
        }
      }, 1000);
    }, COUNTDOWN_BEFORE_START);
  }

  async function endRound(lang = "fi") {
    const pg = get(lang);
    const room = roomName(lang);
    pg.state = "waiting";

    const rankings = Array.from(pg.players.entries())
      .map(([, p]) => ({
        nickname: p.nickname,
        score: p.score,
        wordsFound: p.wordsFound.size,
        percentage: pg.validWords.size > 0
          ? Math.round((p.wordsFound.size / pg.validWords.size) * 100) : 0,
      }))
      .sort((a, b) => b.score - a.score);

    const allFoundWords = new Set();
    for (const [, p] of pg.players) {
      for (const w of p.wordsFound) allFoundWords.add(w);
    }

    // Tallenna pistetulokset hall of fameen
    for (const r of rankings) {
      if (r.score > 0) {
        await submitScore({
          nickname: r.nickname,
          score: r.score,
          wordsFound: r.wordsFound,
          wordsTotal: pg.validWords.size,
          gameMode: "normal",
          gameTime: PUBLIC_GAME_TIME,
          isMulti: true,
          lang,
        });
      }
    }

    io.to(room).emit("public_game_over", {
      rankings,
      validWords: pg.validWordsList,
      allFoundWords: [...allFoundWords],
    });

    pg.nextRoundCountdown = NEXT_ROUND_PAUSE;
    let countdown = NEXT_ROUND_PAUSE;
    pg.nextRoundInterval = setInterval(() => {
      countdown--;
      pg.nextRoundCountdown = countdown;
      io.to(room).emit("public_next_round_countdown", { seconds: countdown });
      if (countdown <= 0) {
        clearInterval(pg.nextRoundInterval);
        pg.nextRoundInterval = null;
        startRound(lang);
      }
    }, 1000);
  }

  function startAll(langs) {
    for (const lang of langs) {
      ensureLang(lang);
      startRound(lang);
    }
  }

  // ---- Socket-actionit (kutsutaan socketHandlers-moduulista) ----

  // Pelaaja liittyy arenaan
  function addPlayer(socket, { nickname, lang }) {
    const pg = get(lang);
    const room = roomName(lang);
    if (pg.players.size >= 64) {
      const msg = lang === "en"
        ? "Arena is full (max 64)"
        : lang === "sv"
          ? "Arenan är full (max 64)"
          : "Areena on täynnä (max 64)";
      socket.emit("error", { message: msg });
      return false;
    }

    socket.join(room);
    playerLang.set(socket.id, lang);
    pg.players.set(socket.id, {
      nickname,
      score: 0,
      wordsFound: new Set(),
    });

    if (pg.state === "playing") {
      socket.emit("public_join_midgame", {
        grid: pg.grid,
        validWords: pg.validWordsList,
        timeLeft: pg.timeLeft,
        roundNumber: pg.roundNumber,
        hex: true,
      });
    } else if (pg.state === "countdown") {
      socket.emit("public_countdown", {
        grid: pg.grid,
        validWords: pg.validWordsList,
        roundNumber: pg.roundNumber,
        hex: true,
      });
    } else {
      socket.emit("public_waiting", {
        playerCount: pg.players.size,
        nextRoundCountdown: pg.nextRoundCountdown || 0,
      });
    }

    broadcastScores(lang);
    io.to(room).emit("public_player_count", { count: pg.players.size });
    return true;
  }

  // Pelaaja löysi sanan
  function handleWord(socket, word) {
    const lang = playerLang.get(socket.id) || "fi";
    const pg = get(lang);
    if (pg.state !== "playing") return;
    const player = pg.players.get(socket.id);
    if (!player) return;

    const normalized = (word || "").toLowerCase().trim();
    if (normalized.length < 3) return;

    if (!pg.validWords.has(normalized)) {
      // Pitkät suomenkieliset sanat (>8 kirj.) tarkistetaan koko sanastosta + reitti gridissä
      if (
        lang === "fi"
        && normalized.length > 8
        && hasWordInBuf(FULL_WORDS_BUF, normalized)
        && canTraceWord(pg.grid, normalized, true)
      ) {
        pg.validWords.add(normalized);
        pg.validWordsList.push(normalized);
      } else {
        socket.emit("public_word_result", {
          valid: false,
          message: lang === "en" ? "Not valid" : "Ei kelpaa",
        });
        return;
      }
    }

    if (player.wordsFound.has(normalized)) {
      socket.emit("public_word_result", {
        valid: false,
        message: lang === "en" ? "Already found" : "Jo löydetty",
      });
      return;
    }

    const points = getScoreForWord(normalized);
    player.score += points;
    player.wordsFound.add(normalized);

    socket.emit("public_word_result", {
      valid: true,
      message: `+${points}p`,
      points,
      wordsFound: player.wordsFound.size,
    });

    broadcastScores(lang);
  }

  // Pelaaja poistuu arenasta tai disconnectaa
  function removePlayer(socket) {
    const lang = playerLang.get(socket.id);
    if (!lang) return null;
    const pg = get(lang);
    const room = roomName(lang);
    socket.leave(room);
    pg.players.delete(socket.id);
    playerLang.delete(socket.id);
    io.to(room).emit("public_player_count", { count: pg.players.size });
    return lang;
  }

  // Apuri emoji-reactionia varten – palauttaa { lang, nickname } tai null
  function getPlayerForEmoji(socketId) {
    const lang = playerLang.get(socketId);
    if (!lang) return null;
    const p = get(lang).players.get(socketId);
    if (!p) return null;
    return { lang, nickname: p.nickname, room: roomName(lang) };
  }

  // Pelaajien yhteismäärä yli kaikkien kielten (alkuvalikon näyttöä varten)
  function totalPlayerCount() {
    let total = 0;
    for (const lang of Object.keys(games)) {
      total += games[lang].players.size;
    }
    return total;
  }

  return {
    // Public game state access
    get,
    games, // suora pääsy (tarvitaan game.js-reitissä /api/arena-count alle)
    startAll,
    startRound,
    endRound,

    // Socket-actionit
    addPlayer,
    handleWord,
    removePlayer,
    getPlayerForEmoji,
    totalPlayerCount,
  };
}
