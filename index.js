import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { gunzipSync } from 'zlib';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Resend } from 'resend';
import { OAuth2Client } from 'google-auth-library';
import { getScoreForWord, getScoreForWordLength } from "./server/game/score.js";
import { TrieNode, buildTrie } from "./server/game/trie.js";
import { hexNeighbors } from "./server/game/hex.js";
import { GRID_SIZE, HEX_ROWS, HEX_COLS, randLetter as randLetterPure, makeGrid as makeGridPure } from "./server/game/grid.js";
import { findWords, findWordsHex, canTraceWord } from "./server/game/validate.js";
import { initDb, saveDb, getDb, submitScore, submitDailyScore, getHallOfFame, getAllHallOfFame, getDailyLeaderboard, HOF_CATEGORIES } from "./server/db.js";
import { LANGS, getLang, isLangValid, FULL_WORDS_BUF, hasWordInBuf, bufHasPrefix } from "./server/words.js";
import { attachScoresRoutes } from "./server/routes/scores.js";
import { attachGameRoutes } from "./server/routes/game.js";
import { attachAuthRoutes } from "./server/routes/auth.js";
import { attachAccountRoutes } from "./server/routes/account.js";

// Adapters: pure modules ottavat letterWeights-objektin, mutta index.js:n
// sisäiset kutsut käyttävät lang-koodia. getLang() ei vielä ole määritelty
// tässä kohtaa, joten käärimme adapterit funktioiksi jotka käyttävät sitä
// ajonaikaisesti.
function randLetter(lang = 'fi') {
  return randLetterPure(getLang(lang).letterWeights);
}
function makeGrid(lang = 'fi', rows = GRID_SIZE, cols) {
  return makeGridPure(getLang(lang).letterWeights, rows, cols);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// App version — changes on every deploy (server restart)
const APP_VERSION = Date.now().toString(36);
console.log(`App version: ${APP_VERSION}`);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Serve static frontend (built by Vite into /dist)
app.use(express.static(join(__dirname, 'dist')));

const PORT = process.env.PORT || 3001;

// ============================================================================
// DATABASE (Hall of Fame) - using sql.js (pure JS, no native binaries)
// ============================================================================

// Use persistent volume path if available (e.g. Railway Volume at /data),
// fall back to local dir for development

// ============================================================================
// WORD LIST + TRIE (for server-side grid generation & validation)
// ============================================================================


function findLongWordsOnGrid(grid, buf, hex, minLen = 11, maxLen = 15) {
  if (!buf) return new Set();
  const rows = grid.length, cols = grid[0].length, found = new Set();
  function getNeighbors(r, c) {
    if (hex) return hexNeighbors(r, c, rows, cols);
    const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
    return dirs.map(([dr,dc]) => ({r:r+dr,c:c+dc})).filter(n => n.r>=0 && n.r<rows && n.c>=0 && n.c<cols);
  }
  function dfs(r, c, path, vis) {
    const np = path + grid[r][c];
    if (!bufHasPrefix(buf, np)) return;
    if (np.length >= minLen && hasWordInBuf(buf, np)) found.add(np);
    if (np.length >= maxLen) return;
    vis.add(r * cols + c);
    for (const n of getNeighbors(r, c)) {
      if (!vis.has(n.r * cols + n.c)) dfs(n.r, n.c, np, vis);
    }
    vis.delete(r * cols + c);
  }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      dfs(r, c, '', new Set());
  return found;
}

function generateGoodGrid(lang = 'fi', hex = false) {
  const trie = getLang(lang).trie;
  const wordFinder = hex ? findWordsHex : findWords;
  const threshold = hex ? 25 : 15;
  let bestGrid = null, bestWords = new Set();
  for (let i = 0; i < 30; i++) {
    const g = hex ? makeGrid(lang, HEX_ROWS, HEX_COLS) : makeGrid(lang, GRID_SIZE);
    const w = wordFinder(g, trie);
    if (w.size > bestWords.size) { bestGrid = g; bestWords = w; }
    if (w.size >= threshold) break;
  }
  // Find long words (11-15 chars) using full word list buffer
  if (lang === 'fi' && bestGrid && FULL_WORDS_BUF) {
    const longWords = findLongWordsOnGrid(bestGrid, FULL_WORDS_BUF, hex);
    for (const w of longWords) bestWords.add(w);
  }
  return { grid: bestGrid, validWords: bestWords };
}

// ============================================================================
// ALWAYS-ON PUBLIC GAME
// ============================================================================

const PUBLIC_GAME_TIME = 120; // 2 minutes

// Per-language public arenas
function createPublicGame() {
  return {
    grid: null,
    validWords: new Set(),
    validWordsList: [],
    players: new Map(), // socketId -> { nickname, score, wordsFound: Set }
    state: 'waiting', // 'waiting' | 'countdown' | 'playing'
    timeLeft: PUBLIC_GAME_TIME,
    timer: null,
    countdownTimer: null,
    nextRoundInterval: null,
    roundNumber: 0,
    nextRoundCountdown: 0,
  };
}
const publicGames = { fi: createPublicGame(), en: createPublicGame(), sv: createPublicGame() };
// Keep backward compat reference
const publicGame = publicGames.fi;

function getPublicGame(lang) { return publicGames[lang] || publicGames.fi; }
function publicRoomName(lang) { return `public_game_${lang}`; }

function startPublicRound(lang = 'fi') {
  const pg = getPublicGame(lang);
  const room = publicRoomName(lang);
  if (pg.nextRoundInterval) {
    clearInterval(pg.nextRoundInterval);
    pg.nextRoundInterval = null;
  }
  const { grid, validWords } = generateGoodGrid(lang, true); // hex grid for arena
  pg.grid = grid;
  pg.validWords = validWords;
  pg.validWordsList = [...validWords];
  pg.state = 'countdown';
  pg.timeLeft = PUBLIC_GAME_TIME;
  pg.roundNumber++;

  for (const [, p] of pg.players) {
    p.score = 0;
    p.wordsFound = new Set();
  }

  io.to(room).emit('public_countdown', {
    grid,
    validWords: pg.validWordsList,
    roundNumber: pg.roundNumber,
    hex: true,
  });

  pg.countdownTimer = setTimeout(() => {
    pg.state = 'playing';
    io.to(room).emit('public_game_start');

    pg.timer = setInterval(() => {
      pg.timeLeft--;
      io.to(room).emit('public_timer_tick', { remaining: pg.timeLeft });

      if (pg.timeLeft <= 0) {
        clearInterval(pg.timer);
        pg.timer = null;
        endPublicRound(lang);
      }
    }, 1000);
  }, 5000);
}

async function endPublicRound(lang = 'fi') {
  const pg = getPublicGame(lang);
  const room = publicRoomName(lang);
  pg.state = 'waiting';

  const rankings = Array.from(pg.players.entries())
    .map(([sid, p]) => ({
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

  for (const r of rankings) {
    if (r.score > 0) {
      await submitScore({
        nickname: r.nickname,
        score: r.score,
        wordsFound: r.wordsFound,
        wordsTotal: pg.validWords.size,
        gameMode: 'normal',
        gameTime: PUBLIC_GAME_TIME,
        isMulti: true,
        lang,
      });
    }
  }

  io.to(room).emit('public_game_over', {
    rankings,
    validWords: pg.validWordsList,
    allFoundWords: [...allFoundWords],
  });

  pg.nextRoundCountdown = 30;
  let nextRoundCountdown = 30;
  pg.nextRoundInterval = setInterval(() => {
    nextRoundCountdown--;
    pg.nextRoundCountdown = nextRoundCountdown;
    io.to(room).emit('public_next_round_countdown', { seconds: nextRoundCountdown });
    if (nextRoundCountdown <= 0) {
      clearInterval(pg.nextRoundInterval);
      pg.nextRoundInterval = null;
      startPublicRound(lang);
    }
  }, 1000);
}

function publicScoreUpdate(lang = 'fi') {
  const pg = getPublicGame(lang);
  const room = publicRoomName(lang);
  const scores = Array.from(pg.players.entries())
    .map(([, p]) => ({ nickname: p.nickname, score: p.score, wordsFound: p.wordsFound.size }))
    .sort((a, b) => b.score - a.score);
  io.to(room).emit('public_score_update', { scores });
}

// Track which public arena each socket is in
const playerPublicLang = new Map(); // socketId -> lang

// ============================================================================
// DATA STRUCTURES
// ============================================================================

const rooms = new Map(); // roomCode -> room
const playerRooms = new Map(); // socketId -> roomCode

// ============================================================================
// LETTER GENERATION (for battle mode)
// ============================================================================

// ============================================================================
// BATTLE MODE: Grid path validation
// ============================================================================

// Apply gravity: letters fall down, empty cells filled from top
function applyGravity(grid, removedCells, lang = 'fi') {
  const sz = grid.length;
  const newGrid = grid.map(row => [...row]);

  // Mark removed cells as null
  for (const { r, c } of removedCells) {
    newGrid[r][c] = null;
  }

  // For each column, drop letters down
  for (let c = 0; c < sz; c++) {
    // Collect non-null letters from bottom to top
    const letters = [];
    for (let r = sz - 1; r >= 0; r--) {
      if (newGrid[r][c] !== null) letters.push(newGrid[r][c]);
    }
    // Fill column from bottom: existing letters first, then new random ones
    for (let r = sz - 1; r >= 0; r--) {
      const idx = sz - 1 - r;
      if (idx < letters.length) {
        newGrid[r][c] = letters[idx];
      } else {
        newGrid[r][c] = randLetter(lang);
      }
    }
  }

  return newGrid;
}

// Find the path of a word on the grid (returns array of {r,c} or null)
function findWordPath(grid, word) {
  const sz = grid.length;
  const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];

  function dfs(r, c, idx, visited, path) {
    if (idx === word.length) return path;
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < sz && nc >= 0 && nc < sz && !visited.has(nr * sz + nc)) {
        if (grid[nr][nc] === word[idx]) {
          visited.add(nr * sz + nc);
          path.push({ r: nr, c: nc });
          const result = dfs(nr, nc, idx + 1, visited, path);
          if (result) return result;
          path.pop();
          visited.delete(nr * sz + nc);
        }
      }
    }
    return null;
  }

  for (let r = 0; r < sz; r++) {
    for (let c = 0; c < sz; c++) {
      if (grid[r][c] === word[0]) {
        const visited = new Set([r * sz + c]);
        const result = dfs(r, c, 1, visited, [{ r, c }]);
        if (result) return result;
      }
    }
  }
  return null;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function formatPlayers(room) {
  return Array.from(room.players.entries()).map(([pid, p]) => ({
    playerId: pid,
    nickname: p.nickname,
    isHost: p.isHost
  }));
}

function formatScores(room) {
  return Array.from(room.scores.entries())
    .map(([pid, s]) => ({
      playerId: pid,
      nickname: s.nickname,
      score: s.score,
      wordsFound: s.wordsFound.size
    }))
    .sort((a, b) => b.score - a.score);
}

// Returns list of public rooms available to join
function getPublicRooms() {
  const list = [];
  for (const [code, room] of rooms) {
    if (room.gameState === 'waiting') {
      list.push({
        roomCode: code,
        hostNickname: room.players.get(room.hostId)?.nickname || '?',
        playerCount: room.players.size,
        maxPlayers: 8,
        lang: room.lang || 'fi',
      });
    }
  }
  return list;
}

// Broadcast updated room list to all connected sockets
function broadcastRoomList() {
  io.emit('room_list', { rooms: getPublicRooms() });
}

// ============================================================================
// SOCKET.IO EVENT HANDLERS
// ============================================================================

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Send app version — client detects changes after reconnect
  socket.emit('app_version', { version: APP_VERSION });

  // Send room list on connect
  socket.emit('room_list', { rooms: getPublicRooms() });

  // ---- JOIN PUBLIC GAME (ARENA) ----
  socket.on('join_public', ({ nickname, lang }) => {
    const gameLang = LANGS[lang] ? lang : 'fi';
    if (!nickname || nickname.length > 12) {
      socket.emit('error', { message: gameLang === 'en' ? 'Invalid nickname' : gameLang === 'sv' ? 'Ogiltigt smeknamn' : 'Virheellinen nimimerkki' });
      return;
    }
    const pg = getPublicGame(gameLang);
    const room = publicRoomName(gameLang);
    if (pg.players.size >= 64) {
      socket.emit('error', { message: gameLang === 'en' ? 'Arena is full (max 64)' : gameLang === 'sv' ? 'Arenan är full (max 64)' : 'Areena on täynnä (max 64)' });
      return;
    }

    socket.join(room);
    playerPublicLang.set(socket.id, gameLang);
    pg.players.set(socket.id, {
      nickname,
      score: 0,
      wordsFound: new Set(),
    });

    if (pg.state === 'playing') {
      socket.emit('public_join_midgame', {
        grid: pg.grid,
        validWords: pg.validWordsList,
        timeLeft: pg.timeLeft,
        roundNumber: pg.roundNumber,
        hex: true,
      });
    } else if (pg.state === 'countdown') {
      socket.emit('public_countdown', {
        grid: pg.grid,
        validWords: pg.validWordsList,
        roundNumber: pg.roundNumber,
        hex: true,
      });
    } else {
      socket.emit('public_waiting', { playerCount: pg.players.size, nextRoundCountdown: pg.nextRoundCountdown || 0 });
    }

    publicScoreUpdate(gameLang);
    io.to(room).emit('public_player_count', { count: pg.players.size });

    console.log(`${nickname} joined Arena (${publicGame.players.size} players)`);
  });

  // ---- PUBLIC GAME: WORD FOUND ----
  socket.on('public_word_found', ({ word }) => {
    const gameLang = playerPublicLang.get(socket.id) || 'fi';
    const pg = getPublicGame(gameLang);
    if (pg.state !== 'playing') return;
    const player = pg.players.get(socket.id);
    if (!player) return;

    const normalized = word.toLowerCase().trim();
    if (normalized.length < 3) return;
    if (!pg.validWords.has(normalized)) {
      // Check full word list for long words + verify grid traceability
      if (gameLang === 'fi' && normalized.length > 8 && hasWordInBuf(FULL_WORDS_BUF, normalized) && canTraceWord(pg.grid, normalized, true)) {
        // Valid long word - add to validWords so it's counted
        pg.validWords.add(normalized);
        pg.validWordsList.push(normalized);
      } else {
        socket.emit('public_word_result', { valid: false, message: gameLang === 'en' ? 'Not valid' : 'Ei kelpaa' });
        return;
      }
    }
    if (player.wordsFound.has(normalized)) {
      socket.emit('public_word_result', { valid: false, message: gameLang === 'en' ? 'Already found' : 'Jo löydetty' });
      return;
    }

    const points = getScoreForWord(normalized);
    player.score += points;
    player.wordsFound.add(normalized);

    socket.emit('public_word_result', {
      valid: true,
      message: `+${points}p`,
      points,
      wordsFound: player.wordsFound.size,
    });

    publicScoreUpdate(gameLang);
  });

  // ---- LEAVE PUBLIC GAME ----
  socket.on('leave_public', () => {
    const gameLang = playerPublicLang.get(socket.id) || 'fi';
    const pg = getPublicGame(gameLang);
    const room = publicRoomName(gameLang);
    socket.leave(room);
    pg.players.delete(socket.id);
    playerPublicLang.delete(socket.id);
    io.to(room).emit('public_player_count', { count: pg.players.size });
    console.log(`Player left Arena/${gameLang} (${pg.players.size} remaining)`);
  });

  // ---- EMOJI REACTIONS ----
  const ALLOWED_EMOJIS = ['😀','😎','🤔','😮','🔥','💪','🎯','👀','😭','🤣','😱','🥳','👏','❤️','💀','🫡'];
  const emojiCooldowns = new Map();
  socket.on('emoji_reaction', ({ emoji }) => {
    if (!ALLOWED_EMOJIS.includes(emoji)) return;
    // Rate limit: 1 emoji per 2 seconds per player
    const now = Date.now();
    const last = emojiCooldowns.get(socket.id) || 0;
    if (now - last < 2000) return;
    emojiCooldowns.set(socket.id, now);

    // Find player nickname and room
    const pubLang = playerPublicLang.get(socket.id);
    if (pubLang) {
      const pg = getPublicGame(pubLang);
      const p = pg.players.get(socket.id);
      if (p) {
        io.to(publicRoomName(pubLang)).emit('emoji_feed', { nickname: p.nickname, emoji });
      }
      return;
    }
    // Check custom rooms
    const playerRoom = playerRooms.get(socket.id);
    if (playerRoom && rooms.has(playerRoom)) {
      const room = rooms.get(playerRoom);
      const p = room.players.get(socket.id);
      if (p) {
        io.to(playerRoom).emit('emoji_feed', { nickname: p.nickname, emoji });
      }
    }
  });

  // ---- LIST ROOMS ----
  socket.on('list_rooms', () => {
    socket.emit('room_list', { rooms: getPublicRooms() });
  });

  // ---- CREATE ROOM ----
  socket.on('create_room', ({ nickname, lang }) => {
    const gameLang = LANGS[lang] ? lang : 'fi';
    let roomCode;
    do {
      roomCode = generateRoomCode();
    } while (rooms.has(roomCode));

    const room = {
      roomCode,
      hostId: socket.id,
      players: new Map(),
      grid: null,
      validWords: [],
      gameState: 'waiting',
      gameMode: 'classic',
      timer: null,
      countdownTimer: null,
      timeLeft: 120,
      scores: new Map(),
      battleFoundWords: new Set(),
      lang: gameLang,
    };

    room.players.set(socket.id, { nickname, isHost: true });
    room.scores.set(socket.id, { nickname, score: 0, wordsFound: new Set() });

    rooms.set(roomCode, room);
    playerRooms.set(socket.id, roomCode);
    socket.join(roomCode);

    socket.emit('room_created', { roomCode, playerId: socket.id });
    io.to(roomCode).emit('room_update', { players: formatPlayers(room) });

    broadcastRoomList();
    console.log(`Room ${roomCode} created by ${nickname} (${socket.id})`);
  });

  // ---- JOIN ROOM ----
  socket.on('join_room', ({ roomCode, nickname }) => {
    const room = rooms.get(roomCode);

    if (!room) {
      socket.emit('room_not_found');
      return;
    }

    if (room.players.size >= 8) {
      socket.emit('error', { message: 'Huone on t\u00e4ynn\u00e4 (max 8)' });
      return;
    }

    if (room.gameState !== 'waiting') {
      socket.emit('error', { message: 'Peli on jo k\u00e4ynniss\u00e4' });
      return;
    }

    room.players.set(socket.id, { nickname, isHost: false });
    room.scores.set(socket.id, { nickname, score: 0, wordsFound: new Set() });
    playerRooms.set(socket.id, roomCode);
    socket.join(roomCode);

    socket.emit('room_joined', { roomCode, playerId: socket.id });
    io.to(roomCode).emit('room_update', { players: formatPlayers(room) });

    broadcastRoomList();
    console.log(`${nickname} (${socket.id}) joined room ${roomCode}`);
  });

  // ---- START GAME ----
  socket.on('start_game', ({ grid, validWords, gameMode, gameTime }) => {
    const roomCode = playerRooms.get(socket.id);
    const room = rooms.get(roomCode);

    if (!room) {
      socket.emit('error', { message: 'Huonetta ei l\u00f6ydy' });
      return;
    }

    if (room.hostId !== socket.id) {
      socket.emit('error', { message: 'Vain is\u00e4nt\u00e4 voi aloittaa pelin' });
      return;
    }

    if (room.gameState !== 'waiting') {
      socket.emit('error', { message: 'Peli on jo aloitettu' });
      return;
    }

    room.grid = grid;
    room.validWords = validWords; // used in classic mode
    room.gameMode = gameMode || 'classic';
    room.gameState = 'running';
    room.timeLeft = gameTime || 120;
    room.originalGameTime = gameTime || 120;
    room.battleFoundWords = new Set();

    for (const [pid, s] of room.scores) {
      s.score = 0;
      s.wordsFound = new Set();
    }

    io.to(roomCode).emit('game_started', { grid, validWords, gameMode: room.gameMode });

    broadcastRoomList();

    // 5s countdown before timer starts
    room.countdownTimer = setTimeout(() => {
      room.countdownTimer = null;
      room.timer = setInterval(async () => {
        room.timeLeft--;
        io.to(roomCode).emit('timer_tick', { remaining: room.timeLeft });

        if (room.timeLeft <= 0) {
          clearInterval(room.timer);
          room.timer = null;
          room.gameState = 'finished';

          const rankings = formatScores(room);
          const allFoundWords = {};
          for (const [pid, s] of room.scores.entries()) {
            allFoundWords[pid] = [...s.wordsFound];
          }
          // Save scores to hall of fame for multi games
          for (const [pid, s] of room.scores.entries()) {
            const p = room.players.get(pid);
            if (p && s.score > 0) {
              await submitScore({
                nickname: p.nickname,
                score: s.score,
                wordsFound: s.wordsFound.size,
                wordsTotal: room.validWords.length || s.wordsFound.size,
                gameMode: room.gameMode === 'battle' ? 'tetris' : 'normal',
                gameTime: room.timeLeft > 0 ? 120 : (room.originalGameTime || 120),
                isMulti: true,
                lang: room.lang || 'fi'
              });
            }
          }

          io.to(roomCode).emit('game_over', {
            rankings,
            validWords: room.gameMode === 'classic' ? room.validWords : [],
            allFoundWords
          });

          console.log(`Game over in room ${roomCode}`);
        }
      }, 1000);
    }, 5000);

    console.log(`Game started in room ${roomCode} mode=${room.gameMode} (received: ${gameMode}) with ${room.players.size} players`);
  });

  // ---- WORD FOUND (classic mode) ----
  socket.on('word_found', ({ word }) => {
    const roomCode = playerRooms.get(socket.id);
    const room = rooms.get(roomCode);

    if (!room || room.gameState !== 'running') {
      socket.emit('word_result', { valid: false, message: 'Peli ei k\u00e4ynniss\u00e4' });
      return;
    }

    const normalized = word.toLowerCase().trim();

    if (room.gameMode === 'battle') {
      // Battle mode: handled by battle_word_found
      socket.emit('word_result', { valid: false, message: 'V\u00e4\u00e4r\u00e4 moodi' });
      return;
    }

    // Classic mode logic
    let isValid = room.validWords.includes(normalized);

    // Check full word list for long Finnish words + verify grid traceability
    const isHexGrid = room.grid && room.grid.length === HEX_ROWS && room.grid[0].length === HEX_COLS;
    if (!isValid && (room.lang || 'fi') === 'fi' && normalized.length > 8 && hasWordInBuf(FULL_WORDS_BUF, normalized) && canTraceWord(room.grid, normalized, isHexGrid)) {
      isValid = true;
      room.validWords.push(normalized);
    }

    if (!isValid) {
      socket.emit('word_result', { valid: false, message: 'Ei kelpaa' });
      return;
    }

    const playerScore = room.scores.get(socket.id);

    if (playerScore.wordsFound.has(normalized)) {
      socket.emit('word_result', { valid: false, message: 'L\u00f6ydetty jo' });
      return;
    }

    const points = getScoreForWordLength(normalized.length);
    playerScore.score += points;
    playerScore.wordsFound.add(normalized);

    const combo = playerScore.wordsFound.size;

    socket.emit('word_result', {
      valid: true,
      message: `+${points}p`,
      points,
      combo: Math.min(combo, 2)
    });

    io.to(roomCode).emit('score_update', { scores: formatScores(room) });
  });

  // ---- BATTLE MODE: WORD FOUND ----
  socket.on('battle_word_found', ({ word, cells, wordList }) => {
    const roomCode = playerRooms.get(socket.id);
    const room = rooms.get(roomCode);

    if (!room) {
      socket.emit('word_result', { valid: false, message: 'Huonetta ei löydy' });
      return;
    }
    if (room.gameState !== 'running') {
      socket.emit('word_result', { valid: false, message: 'Peli ei käynnissä' });
      return;
    }
    if (room.gameMode !== 'battle') {
      socket.emit('word_result', { valid: false, message: 'Väärä pelimoodi: ' + room.gameMode });
      return;
    }

    const normalized = word.toLowerCase().trim();

    // Word length check
    if (normalized.length < 3) {
      socket.emit('word_result', { valid: false, message: 'Liian lyhyt' });
      return;
    }

    // Check the word can actually be traced on the CURRENT server grid
    if (!canTraceWord(room.grid, normalized)) {
      socket.emit('word_result', { valid: false, message: 'Ei l\u00f6ydy ruudukosta' });
      return;
    }

    // Check if already found globally in battle mode
    if (room.battleFoundWords.has(normalized)) {
      socket.emit('word_result', { valid: false, message: 'Joku ehti ensin!' });
      return;
    }

    // Valid! Mark as found globally
    room.battleFoundWords.add(normalized);

    const playerScore = room.scores.get(socket.id);
    const points = getScoreForWordLength(normalized.length);
    playerScore.score += points;
    playerScore.wordsFound.add(normalized);

    // Find the path on the server grid to determine which cells to remove
    const path = cells || findWordPath(room.grid, normalized);

    if (!path || path.length === 0) {
      // Shouldn't happen since canTraceWord passed, but safety fallback
      socket.emit('word_result', { valid: true, message: `+${points}p`, points, combo: 1 });
      io.to(roomCode).emit('score_update', { scores: formatScores(room) });
      return;
    }

    // Apply gravity: remove cells, drop letters, fill new
    room.grid = applyGravity(room.grid, path, room.lang || 'fi');

    // Send result to the finder
    socket.emit('word_result', {
      valid: true,
      message: `+${points}p`,
      points,
      combo: playerScore.wordsFound.size
    });

    // Broadcast grid update + who found what to ALL players
    const nickname = room.players.get(socket.id)?.nickname || '?';
    io.to(roomCode).emit('battle_grid_update', {
      grid: room.grid,
      removedCells: path,
      word: normalized,
      finder: nickname,
      finderId: socket.id,
      points
    });

    io.to(roomCode).emit('score_update', { scores: formatScores(room) });
  });

  // ---- BATTLE MODE: BROADCAST SELECTION ----
  socket.on('battle_selection', ({ cells }) => {
    const roomCode = playerRooms.get(socket.id);
    const room = rooms.get(roomCode);

    if (!room || room.gameState !== 'running' || room.gameMode !== 'battle') return;

    const nickname = room.players.get(socket.id)?.nickname || '?';
    // Broadcast to everyone else in the room
    socket.to(roomCode).emit('battle_player_selection', {
      playerId: socket.id,
      nickname,
      cells
    });
  });

  // ---- LEAVE ROOM ----
  socket.on('leave_room', () => {
    handleDisconnect(socket);
  });

  // ---- DISCONNECT ----
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    handleDisconnect(socket);
  });
});

function handleDisconnect(socket) {
  // Remove from public game if present
  const pubLang = playerPublicLang.get(socket.id);
  if (pubLang) {
    const pg = getPublicGame(pubLang);
    const room = publicRoomName(pubLang);
    pg.players.delete(socket.id);
    playerPublicLang.delete(socket.id);
    socket.leave(room);
    io.to(room).emit('public_player_count', { count: pg.players.size });
  }

  const roomCode = playerRooms.get(socket.id);
  const room = rooms.get(roomCode);

  if (room) {
    room.players.delete(socket.id);
    room.scores.delete(socket.id);

    if (room.players.size === 0) {
      if (room.timer) clearInterval(room.timer);
      if (room.countdownTimer) clearTimeout(room.countdownTimer);
      rooms.delete(roomCode);
      console.log(`Room ${roomCode} destroyed (empty)`);
    } else {
      if (room.hostId === socket.id) {
        const newHostId = Array.from(room.players.keys())[0];
        room.hostId = newHostId;
        room.players.get(newHostId).isHost = true;
      }
      io.to(roomCode).emit('room_update', { players: formatPlayers(room) });
    }

    broadcastRoomList();
  }

  playerRooms.delete(socket.id);
  socket.leave(roomCode);
}

// ============================================================================
// HTTP ROUTES
// ============================================================================

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Piilosana multiplayer server' });
});

// Liveness — vastaa aina kun prosessi pyörii (Railway käyttää tätä erottaakseen kuolleen prosessin)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

// Readiness — vastaa 200 vain kun palvelu ottaa vastaan uutta liikennettä.
// Palauttaa 503 kun palvelin on draining-tilassa (SIGTERM saatu, valmistellaan sammumista).
// Railway:n health check kannattaa osoittaa tähän, jotta deploy-vaiheessa load balancer
// ohjaa uudet pyynnöt suoraan uuteen replikaan.
let isShuttingDown = false;
app.get('/ready', (req, res) => {
  if (isShuttingDown) {
    res.status(503).json({ status: 'draining' });
  } else {
    res.json({ status: 'ready' });
  }
});


// ============================================================================
// AUTH / ACCOUNT — alustetaan integrointiriippuvuudet, reitit ovat moduuleissa
// (server/routes/auth.js ja server/routes/account.js).
// ============================================================================

// Resend (sähköposti) — RESEND_API_KEY env-muuttujasta. Jos puuttuu, jätetään null
// ja salasanan nollaus & tervetuloa-meilit menevät hiljaisesti pois käytöstä.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Google OAuth — GOOGLE_CLIENT_ID env-muuttujasta
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;


// Privacy Policy
app.get('/privacy', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fi">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Piilosana — Tietosuojaseloste / Privacy Policy</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{background:#0a0a1a;color:#88ccaa;font-family:'Courier New',monospace;padding:24px;max-width:700px;margin:0 auto;line-height:1.8;}
h1{color:#00ff88;font-size:20px;margin-bottom:24px;border-bottom:2px solid #334;padding-bottom:12px;}
h2{color:#ffcc00;font-size:16px;margin:24px 0 8px;}
p{margin-bottom:12px;font-size:14px;}
a{color:#00ff88;}
.lang{color:#556;font-size:12px;margin-bottom:24px;display:block;}
</style>
</head>
<body>
<h1>Piilosana — Tietosuojaseloste</h1>
<span class="lang"><a href="#fi">Suomeksi</a> | <a href="#en">In English</a></span>

<div id="fi">
<h2>1. Rekisterinpitäjä</h2>
<p>Matti Kuokkanen (yksityishenkilö)<br/>Sähköposti: info@piilosana.com</p>

<h2>2. Mitä tietoja keräämme</h2>
<p>Piilosana kerää vain tietoja, jotka ovat välttämättömiä pelin toiminnalle:</p>
<p><strong>Rekisteröityneet käyttäjät:</strong> nimimerkki, sähköpostiosoite (vapaaehtoinen) ja salasanan tiiviste (hash). Emme tallenna salasanaa selkokielisenä.</p>
<p><strong>Google-kirjautuminen:</strong> Google jakaa meille vain nimesi ja sähköpostisi. Emme saa pääsyä Google-tilillesi, salasanaasi tai muihin tietoihisi.</p>
<p><strong>Pelitiedot:</strong> pistetilastot, saavutukset ja ennätykset.</p>
<p><strong>Tekniset tiedot:</strong> IP-osoite palvelimen lokitiedostoissa (normaali palvelintoiminta).</p>

<h2>3. Mihin tietoja käytetään</h2>
<p>Tietoja käytetään ainoastaan pelin toimintaan: kirjautumiseen, tulosten tallentamiseen ja ennätystaulukon ylläpitoon. Emme myy tai jaa tietojasi kolmansille osapuolille.</p>

<h2>4. Tietojen säilytys</h2>
<p>Tiedot säilytetään palvelimella niin kauan kuin tili on aktiivinen. Voit pyytää tilisi ja tietojesi poistamista lähettämällä sähköpostia osoitteeseen info@piilosana.com.</p>

<h2>5. Evästeet</h2>
<p>Piilosana käyttää selaimen paikallista tallennustilaa (localStorage) asetusten ja kirjautumistietojen muistamiseen. Emme käytä seurantaevästeitä.</p>

<h2>6. Muutokset</h2>
<p>Tätä selostetta voidaan päivittää. Viimeksi päivitetty: huhtikuu 2026.</p>
</div>

<hr style="border-color:#334;margin:32px 0;"/>

<div id="en">
<h2>Privacy Policy (English)</h2>

<h2>1. Data Controller</h2>
<p>Matti Kuokkanen (private individual)<br/>Email: info@piilosana.com</p>

<h2>2. What Data We Collect</h2>
<p>Piilosana only collects data necessary for the game to function:</p>
<p><strong>Registered users:</strong> nickname, email address (optional), and a password hash. We never store your password in plain text.</p>
<p><strong>Google Sign-In:</strong> Google only shares your name and email with us. We do not gain access to your Google account, password, or other data.</p>
<p><strong>Game data:</strong> score statistics, achievements, and records.</p>
<p><strong>Technical data:</strong> IP address in server logs (standard server operation).</p>

<h2>3. How We Use Data</h2>
<p>Data is used solely for game functionality: authentication, saving results, and maintaining leaderboards. We do not sell or share your data with third parties.</p>

<h2>4. Data Retention</h2>
<p>Data is stored on the server as long as the account is active. You can request deletion of your account and data by emailing info@piilosana.com.</p>

<h2>5. Cookies</h2>
<p>Piilosana uses browser local storage (localStorage) to remember settings and login. We do not use tracking cookies.</p>

<h2>6. Changes</h2>
<p>This policy may be updated. Last updated: April 2026.</p>
</div>

<p style="margin-top:32px;"><a href="/">← Takaisin peliin / Back to game</a></p>
</body>
</html>`);
});

// Reittimoduulit (siirretty server/routes/-hakemistoon)
attachScoresRoutes(app);
attachGameRoutes(app, {
  appVersion: APP_VERSION,
  googleClientId: GOOGLE_CLIENT_ID,
  getPublicGame,
  publicGames,
  findLongWordsOnGrid,
});
attachAuthRoutes(app, {
  resend,
  googleClient,
  googleClientId: GOOGLE_CLIENT_ID,
});
attachAccountRoutes(app);

// SPA catch-all: serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

// ============================================================================
// SERVER START
// ============================================================================


// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================
//
// Kun Railway tai Docker lähettää SIGTERM-signaalin (esim. uusi deploy):
// 1. Asetetaan isShuttingDown=true → /ready palauttaa 503 → load balancer
//    ohjaa uudet pyynnöt muualle (jos on muita replikoita)
// 2. Lähetetään socket-clienteille "server_draining" -event että he osaavat
//    odottaa tai uudelleenyhdistää
// 3. Suljetaan HTTP-palvelin (lopettaa ottamasta uusia yhteyksiä, mutta
//    sallii nykyisten päättyä siististi)
// 4. Maksimi 25 sek odotus, sitten pakotetaan sammuminen (Railway tappaa
//    prosessin 30 sek jälkeen joka tapauksessa)

function gracefulShutdown(signal) {
  console.log(`Received ${signal}, starting graceful shutdown...`);
  isShuttingDown = true;

  // Kerro client-puolelle että server on lähdössä
  try {
    io.emit('server_draining', { reason: signal });
  } catch (e) {
    console.error('Failed to emit server_draining:', e);
  }

  // Pakotettu timeout — jos kaikki ei ehtinyt, lopetetaan kuitenkin
  const forceTimer = setTimeout(() => {
    console.log('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 25_000);

  // Sulje socket.io ja HTTP-palvelin siististi
  io.close(() => {
    console.log('Socket.IO closed');
    httpServer.close(() => {
      console.log('HTTP server closed');
      clearTimeout(forceTimer);
      process.exit(0);
    });
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

initDb().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Piilosana server listening on port ${PORT}`);
    // Start always-on public arenas for all languages
    for (const lang of Object.keys(LANGS)) {
      startPublicRound(lang);
      console.log(`Public arena started for ${lang} (always-on)`);
    }
  });
}).catch(err => {
  console.error('Failed to init database:', err);
  process.exit(1);
});
