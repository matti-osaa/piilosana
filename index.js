import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import bcrypt from 'bcryptjs';
import { Resend } from 'resend';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
const DB_DIR = process.env.DB_PATH || (existsSync('/data') ? '/data' : __dirname);
const DB_PATH = join(DB_DIR, 'piilosana.db');
let db;

async function initDb() {
  const SQL = await initSqlJs();
  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log(`Database loaded from ${DB_PATH} (${fileBuffer.length} bytes)`);
  } else {
    db = new SQL.Database();
    console.log(`New database created at ${DB_PATH}`);
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS hall_of_fame (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL,
      score INTEGER NOT NULL,
      words_found INTEGER NOT NULL,
      words_total INTEGER NOT NULL,
      percentage REAL NOT NULL,
      game_mode TEXT NOT NULL,
      game_time INTEGER NOT NULL,
      is_multi INTEGER NOT NULL DEFAULT 0,
      lang TEXT NOT NULL DEFAULT 'fi',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  // Add lang column to existing databases that don't have it
  try { db.run(`ALTER TABLE hall_of_fame ADD COLUMN lang TEXT NOT NULL DEFAULT 'fi'`); } catch(e) { /* column already exists */ }

  // Users table for authentication
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  // Link hall_of_fame to users (optional, add user_id column)
  try { db.run(`ALTER TABLE hall_of_fame ADD COLUMN user_id INTEGER`); } catch(e) { /* column already exists */ }
  // Add settings column to users
  try { db.run(`ALTER TABLE users ADD COLUMN settings TEXT`); } catch(e) { /* column already exists */ }
  // Add achievements column to users (JSON string)
  try { db.run(`ALTER TABLE users ADD COLUMN achievements TEXT`); } catch(e) { /* column already exists */ }
  // Add google_id column for Google Sign-In
  try { db.run(`ALTER TABLE users ADD COLUMN google_id TEXT`); } catch(e) { /* column already exists */ }

  saveDb();
}

// Resend email client (optional - only if RESEND_API_KEY is set)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function saveDb() {
  if (!db) return;
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

// Categories: normal-120, normal-402, tetris-120, tetris-402
const HOF_CATEGORIES = [
  { gameMode: 'normal', gameTime: 120, label: 'Normaali 2 min' },
  { gameMode: 'normal', gameTime: 402, label: 'Normaali 6,7 min' },
  { gameMode: 'tetris', gameTime: 120, label: 'Tetris 2 min' },
  { gameMode: 'tetris', gameTime: 402, label: 'Tetris 6,7 min' },
];

function submitScore({ nickname, score, wordsFound, wordsTotal, gameMode, gameTime, isMulti, lang }) {
  if (!db || !nickname || score < 0 || !gameMode || !gameTime) return null;
  if (gameTime === 0) return null;
  const safeLang = LANGS[lang] ? lang : 'fi';
  const percentage = wordsTotal > 0 ? Math.round((wordsFound / wordsTotal) * 100) : 0;
  db.run(
    `INSERT INTO hall_of_fame (nickname, score, words_found, words_total, percentage, game_mode, game_time, is_multi, lang)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [nickname, score, wordsFound, wordsTotal, percentage, gameMode, Number(gameTime), isMulti ? 1 : 0, safeLang]
  );
  saveDb();
  return true;
}

function getHallOfFame(gameMode, gameTime, lang) {
  if (!db) return [];
  const safeLang = lang || 'fi';
  const stmt = db.prepare(
    `SELECT nickname, score, words_found, words_total, percentage, created_at
     FROM hall_of_fame WHERE game_mode = ? AND game_time = ? AND lang = ? ORDER BY score DESC LIMIT 10`
  );
  stmt.bind([gameMode, Number(gameTime), safeLang]);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function getAllHallOfFame(lang) {
  const safeLang = lang || 'fi';
  const result = {};
  for (const cat of HOF_CATEGORIES) {
    result[`${cat.gameMode}-${cat.gameTime}`] = {
      label: cat.label,
      scores: getHallOfFame(cat.gameMode, cat.gameTime, safeLang)
    };
  }
  return result;
}

// ============================================================================
// WORD LIST + TRIE (for server-side grid generation & validation)
// ============================================================================

import WORDS_RAW_FI from './words.js';
import WORDS_RAW_EN from './words_en.js';
import WORDS_RAW_SV from './words_sv.js';

class TrieNode { constructor() { this.c = {}; this.w = false; } }
function buildTrie(words) {
  const root = new TrieNode();
  for (const word of words) {
    let n = root;
    for (const ch of word) { if (!n.c[ch]) n.c[ch] = new TrieNode(); n = n.c[ch]; }
    n.w = true;
  }
  return root;
}

// Per-language word sets and tries
const LANGS = {
  fi: {
    words: new Set(WORDS_RAW_FI.split('|')),
    trie: null,
    letterWeights: {
      a:120, i:108, t:87, n:88, e:80, s:79, l:58, o:53, k:51, u:51,
      'ä':37, m:33, v:25, r:29, j:20, h:19, y:19, p:18, d:10, 'ö':4
    },
  },
  en: {
    words: new Set(WORDS_RAW_EN.split('|')),
    trie: null,
    letterWeights: {
      e:127, t:91, a:82, o:75, i:70, n:67, s:63, h:61, r:60,
      d:43, l:40, c:28, u:28, m:24, w:24, f:22, g:20, y:20,
      p:19, b:15, v:10, k:8, j:2, x:2, q:1, z:1
    },
  },
  sv: {
    words: new Set(WORDS_RAW_SV.split('|')),
    trie: null,
    letterWeights: {
      a:93, e:88, n:82, r:73, t:70, s:66, i:58, l:52, d:45, o:41,
      k:34, g:33, m:32, f:20, v:20, 'ä':18, u:18, h:17, p:17,
      b:16, 'å':13, 'ö':13, c:6, j:6, y:6, x:2, w:1, z:1, q:1
    },
  },
};
// Build tries
for (const lang of Object.keys(LANGS)) {
  LANGS[lang].trie = buildTrie(LANGS[lang].words);
}

function getLang(lang) { return LANGS[lang] || LANGS.fi; }

const GRID_SIZE = 5;

function makeGrid(lang = 'fi') {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => randLetter(lang))
  );
}

function findWords(grid, trie) {
  const sz = grid.length, found = new Set();
  const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
  function dfs(r, c, node, path, vis) {
    const ch = grid[r][c], nx = node.c[ch];
    if (!nx) return;
    const np = path + ch;
    if (nx.w && np.length >= 3) found.add(np);
    vis.add(r * sz + c);
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < sz && nc >= 0 && nc < sz && !vis.has(nr * sz + nc))
        dfs(nr, nc, nx, np, vis);
    }
    vis.delete(r * sz + c);
  }
  for (let r = 0; r < sz; r++)
    for (let c = 0; c < sz; c++)
      dfs(r, c, trie, '', new Set());
  return found;
}

function generateGoodGrid(lang = 'fi') {
  const trie = getLang(lang).trie;
  let bestGrid = null, bestWords = new Set();
  for (let i = 0; i < 30; i++) {
    const g = makeGrid(lang);
    const w = findWords(g, trie);
    if (w.size > bestWords.size) { bestGrid = g; bestWords = w; }
    if (w.size >= 15) break;
  }
  return { grid: bestGrid, validWords: bestWords };
}

function getScoreForWord(word) {
  const len = word.length;
  if (len === 3) return 1;
  if (len === 4) return 2;
  if (len === 5) return 4;
  if (len === 6) return 6;
  if (len === 7) return 10;
  return 14;
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
  const { grid, validWords } = generateGoodGrid(lang);
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

function endPublicRound(lang = 'fi') {
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
      submitScore({
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

  pg.nextRoundCountdown = 40;
  let nextRoundCountdown = 40;
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

function randLetter(lang = 'fi') {
  const lw = getLang(lang).letterWeights;
  const ls = Object.keys(lw);
  const tot = Object.values(lw).reduce((a, b) => a + b, 0);
  let r = Math.random() * tot;
  for (let i = 0; i < ls.length; i++) {
    r -= lw[ls[i]];
    if (r <= 0) return ls[i];
  }
  return ls[ls.length - 1];
}

// ============================================================================
// BATTLE MODE: Grid path validation
// ============================================================================

// Check if a word can be traced on the grid via adjacent cells
function canTraceWord(grid, word) {
  const sz = grid.length;
  const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];

  function dfs(r, c, idx, visited) {
    if (idx === word.length) return true;
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < sz && nc >= 0 && nc < sz && !visited.has(nr * sz + nc)) {
        if (grid[nr][nc] === word[idx]) {
          visited.add(nr * sz + nc);
          if (dfs(nr, nc, idx + 1, visited)) return true;
          visited.delete(nr * sz + nc);
        }
      }
    }
    return false;
  }

  for (let r = 0; r < sz; r++) {
    for (let c = 0; c < sz; c++) {
      if (grid[r][c] === word[0]) {
        const visited = new Set([r * sz + c]);
        if (dfs(r, c, 1, visited)) return true;
      }
    }
  }
  return false;
}

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

function getScoreForWordLength(length) {
  if (length === 3) return 1;
  if (length === 4) return 2;
  if (length === 5) return 4;
  if (length === 6) return 6;
  if (length === 7) return 10;
  return 14;
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
      });
    } else if (pg.state === 'countdown') {
      socket.emit('public_countdown', {
        grid: pg.grid,
        validWords: pg.validWordsList,
        roundNumber: pg.roundNumber,
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
      socket.emit('public_word_result', { valid: false, message: gameLang === 'en' ? 'Not valid' : 'Ei kelpaa' });
      return;
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
      room.timer = setInterval(() => {
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
              submitScore({
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
    const isValid = room.validWords.includes(normalized);

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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

// Hall of Fame: get all categories
app.get('/api/hall-of-fame', (req, res) => {
  const lang = req.query.lang || 'fi';
  res.json(getAllHallOfFame(lang));
});

// Hall of Fame: get specific category
app.get('/api/hall-of-fame/:gameMode/:gameTime', (req, res) => {
  const { gameMode, gameTime } = req.params;
  const lang = req.query.lang || 'fi';
  res.json(getHallOfFame(gameMode, Number(gameTime), lang));
});

// Public game status (supports ?lang=fi|en)
app.get('/api/public-game', (req, res) => {
  const lang = req.query.lang === 'en' ? 'en' : 'fi';
  const pg = getPublicGame(lang);
  res.json({
    state: pg.state,
    playerCount: pg.players.size,
    timeLeft: pg.timeLeft,
    roundNumber: pg.roundNumber,
  });
});

// Hall of Fame: submit score (for solo games)
app.post('/api/hall-of-fame', (req, res) => {
  const { nickname, score, wordsFound, wordsTotal, gameMode, gameTime, lang } = req.body;
  if (!nickname || nickname.length > 12) {
    return res.status(400).json({ error: 'Virheellinen nimimerkki' });
  }
  const safeLang = LANGS[lang] ? lang : 'fi';
  const id = submitScore({ nickname, score, wordsFound, wordsTotal, gameMode, gameTime, isMulti: false, lang: safeLang });
  if (!id) return res.status(400).json({ error: 'Tulosta ei voitu tallentaa' });
  // Return updated top 10 for this category
  const top = getHallOfFame(gameMode, gameTime, safeLang);
  res.json({ id, top });
});

// ============================================================================
// AUTH ROUTES
// ============================================================================

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20, // max 20 requests per 15 min per IP
  message: { error: 'Liian monta yritystä. Odota hetki.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);
app.use('/api/forgot-password', authLimiter);

// Register new user
app.post('/api/register', async (req, res) => {
  try {
    const { nickname, password, email } = req.body;
    if (!nickname || !password) return res.status(400).json({ error: 'Nimimerkki ja salasana vaaditaan' });
    if (nickname.length > 12) return res.status(400).json({ error: 'Nimimerkki max 12 merkkiä' });
    if (password.length < 4) return res.status(400).json({ error: 'Salasana min 4 merkkiä' });
    if (email && email.length > 0) {
      // Validate both emails match (client sends email, email2)
      const { email2 } = req.body;
      if (email !== email2) return res.status(400).json({ error: 'Sähköpostit eivät täsmää' });
    }

    // Check if nickname exists
    const existing = db.exec(`SELECT id FROM users WHERE nickname = ? COLLATE NOCASE`, [nickname.toUpperCase()]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      return res.status(409).json({ error: 'Nimimerkki on jo käytössä' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const safeEmail = email && email.trim().length > 0 ? email.trim().toLowerCase() : null;

    db.run(
      `INSERT INTO users (nickname, password_hash, email) VALUES (?, ?, ?)`,
      [nickname.toUpperCase(), password_hash, safeEmail]
    );
    saveDb();

    const userRows = db.exec(`SELECT id FROM users WHERE nickname = ? COLLATE NOCASE`, [nickname.toUpperCase()]);
    const userId = userRows[0].values[0][0];

    // Send password to email if provided and Resend is configured
    if (safeEmail && resend) {
      try {
        await resend.emails.send({
          from: process.env.RESEND_FROM || 'Piilosana <onboarding@resend.dev>',
          to: safeEmail,
          subject: 'Piilosana — tunnuksesi',
          html: `
            <div style="font-family:monospace;background:#0a0a1a;color:#00ff88;padding:30px;border-radius:8px;">
              <h2 style="color:#ffcc00;">Tervetuloa Piilosanaan!</h2>
              <p>Nimimerkkisi: <strong>${nickname.toUpperCase()}</strong></p>
              <p>Tilisi on luotu onnistuneesti. Pelaa osoitteessa piilosana.up.railway.app</p>
              <p style="color:#556;margin-top:20px;font-size:12px;">Jos unohdat salasanasi, voit nollata sen pelin kirjautumissivulta.</p>
            </div>
          `
        });
        console.log(`Welcome email sent to ${safeEmail} for user ${nickname}`);
      } catch (emailErr) {
        console.error('Failed to send email:', emailErr);
        // Don't fail registration if email fails
      }
    }

    res.json({ ok: true, user: { id: userId, nickname: nickname.toUpperCase(), email: safeEmail } });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Rekisteröinti epäonnistui' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { nickname, password } = req.body;
    if (!nickname || !password) return res.status(400).json({ error: 'Nimimerkki ja salasana vaaditaan' });

    const rows = db.exec(`SELECT id, nickname, password_hash, email, settings, achievements FROM users WHERE nickname = ? COLLATE NOCASE`, [nickname.toUpperCase()]);
    if (rows.length === 0 || rows[0].values.length === 0) {
      return res.status(401).json({ error: 'Väärä nimimerkki tai salasana' });
    }

    const [id, dbNickname, password_hash, email, settingsJson, achievementsJson] = rows[0].values[0];
    const match = await bcrypt.compare(password, password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Väärä nimimerkki tai salasana' });
    }

    let settings = null;
    try { settings = settingsJson ? JSON.parse(settingsJson) : null; } catch(e) {}
    let achievements = null;
    try { achievements = achievementsJson ? JSON.parse(achievementsJson) : null; } catch(e) {}

    res.json({ ok: true, user: { id, nickname: dbNickname, email, settings, achievements } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Kirjautuminen epäonnistui' });
  }
});

// Forgot password — generate new password and send to email
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Sähköposti vaaditaan' });

    const rows = db.exec(`SELECT id, nickname, email FROM users WHERE email = ?`, [email.trim().toLowerCase()]);
    if (rows.length === 0 || rows[0].values.length === 0) {
      // Don't reveal if email exists
      return res.json({ ok: true, message: 'Jos sähköposti löytyy, uusi salasana lähetetään.' });
    }

    const [id, dbNickname, dbEmail] = rows[0].values[0];

    if (!resend) {
      return res.status(500).json({ error: 'Sähköpostipalvelu ei ole käytössä' });
    }

    // Generate random password (8 chars)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let newPassword = '';
    for (let i = 0; i < 8; i++) newPassword += chars[Math.floor(Math.random() * chars.length)];

    const password_hash = await bcrypt.hash(newPassword, 10);
    db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [password_hash, id]);
    saveDb();

    await resend.emails.send({
      from: process.env.RESEND_FROM || 'Piilosana <onboarding@resend.dev>',
      to: dbEmail,
      subject: 'Piilosana — uusi salasana',
      html: `
        <div style="font-family:monospace;background:#0a0a1a;color:#00ff88;padding:30px;border-radius:8px;">
          <h2 style="color:#ffcc00;">Uusi salasana</h2>
          <p>Nimimerkkisi: <strong>${dbNickname}</strong></p>
          <p>Uusi salasanasi: <strong>${newPassword}</strong></p>
          <p style="color:#556;margin-top:20px;font-size:12px;">Kirjaudu osoitteessa piilosana.app</p>
        </div>
      `
    });

    console.log(`Password reset email sent to ${dbEmail} for user ${dbNickname}`);
    res.json({ ok: true, message: 'Uusi salasana lähetetty sähköpostiin!' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Salasanan nollaus epäonnistui' });
  }
});

// Change password (requires current password)
app.post('/api/change-password', async (req, res) => {
  try {
    const { nickname, currentPassword, newPassword } = req.body;
    if (!nickname || !currentPassword || !newPassword) return res.status(400).json({ error: 'Kaikki kentät vaaditaan' });
    if (newPassword.length < 4) return res.status(400).json({ error: 'Uusi salasana min 4 merkkiä' });

    const rows = db.exec(`SELECT id, password_hash, email FROM users WHERE nickname = ? COLLATE NOCASE`, [nickname.toUpperCase()]);
    if (rows.length === 0 || rows[0].values.length === 0) {
      return res.status(401).json({ error: 'Käyttäjää ei löydy' });
    }

    const [id, password_hash, email] = rows[0].values[0];
    const match = await bcrypt.compare(currentPassword, password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Nykyinen salasana on väärin' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [newHash, id]);
    saveDb();

    // Send new password to email if available
    if (email && resend) {
      try {
        await resend.emails.send({
          from: process.env.RESEND_FROM || 'Piilosana <onboarding@resend.dev>',
          to: email,
          subject: 'Piilosana — salasana vaihdettu',
          html: `
            <div style="font-family:monospace;background:#0a0a1a;color:#00ff88;padding:30px;border-radius:8px;">
              <h2 style="color:#ffcc00;">Salasana vaihdettu</h2>
              <p>Nimimerkkisi: <strong>${nickname.toUpperCase()}</strong></p>
              <p>Salasanasi on vaihdettu onnistuneesti.</p>
              <p style="color:#ff4444;margin-top:10px;font-size:12px;">Jos et vaihtanut salasanaasi, ota yhteyttä ylläpitoon.</p>
            </div>
          `
        });
      } catch (emailErr) {
        console.error('Failed to send password change email:', emailErr);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Salasanan vaihto epäonnistui' });
  }
});

// Google Sign-In
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

app.post('/api/google-login', async (req, res) => {
  try {
    if (!googleClient) return res.status(500).json({ error: 'Google-kirjautuminen ei ole käytössä' });
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Token puuttuu' });

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name || payload.email.split('@')[0];

    // Check if user exists with this google_id
    let rows = db.exec(`SELECT id, nickname, email, settings, achievements FROM users WHERE google_id = ?`, [googleId]);
    if (rows.length > 0 && rows[0].values.length > 0) {
      const [id, nickname, dbEmail, settingsJson, achievementsJson] = rows[0].values[0];
      let settings = null, achievements = null;
      try { settings = settingsJson ? JSON.parse(settingsJson) : null; } catch(e) {}
      try { achievements = achievementsJson ? JSON.parse(achievementsJson) : null; } catch(e) {}
      return res.json({ ok: true, user: { id, nickname, email: dbEmail, settings, achievements }, isNew: false });
    }

    // Check if user exists with same email — link accounts
    rows = db.exec(`SELECT id, nickname, email FROM users WHERE email = ?`, [email?.toLowerCase()]);
    if (rows.length > 0 && rows[0].values.length > 0) {
      const [id, nickname] = rows[0].values[0];
      db.run(`UPDATE users SET google_id = ? WHERE id = ?`, [googleId, id]);
      saveDb();
      const updated = db.exec(`SELECT id, nickname, email, settings, achievements FROM users WHERE id = ?`, [id]);
      const [uid, uNick, uEmail, sJson, aJson] = updated[0].values[0];
      let settings = null, achievements = null;
      try { settings = sJson ? JSON.parse(sJson) : null; } catch(e) {}
      try { achievements = aJson ? JSON.parse(aJson) : null; } catch(e) {}
      return res.json({ ok: true, user: { id: uid, nickname: uNick, email: uEmail, settings, achievements }, isNew: false });
    }

    // Create new user with Google
    const nickname = name.toUpperCase().replace(/[^A-ZÄÖÅ0-9]/g, '').slice(0, 12) || 'PELAAJA';
    // Ensure unique nickname
    let finalNick = nickname;
    let counter = 1;
    while (true) {
      const check = db.exec(`SELECT id FROM users WHERE nickname = ? COLLATE NOCASE`, [finalNick]);
      if (check.length === 0 || check[0].values.length === 0) break;
      finalNick = nickname.slice(0, 9) + counter;
      counter++;
    }

    // Random password hash (user won't use it — they use Google)
    const dummyHash = await bcrypt.hash(Math.random().toString(36), 10);
    db.run(`INSERT INTO users (nickname, password_hash, email, google_id) VALUES (?, ?, ?, ?)`,
      [finalNick, dummyHash, email?.toLowerCase() || null, googleId]);
    saveDb();

    const newRows = db.exec(`SELECT id FROM users WHERE google_id = ?`, [googleId]);
    const newId = newRows[0].values[0][0];

    res.json({ ok: true, user: { id: newId, nickname: finalNick, email: email?.toLowerCase() }, isNew: true });
  } catch (err) {
    console.error('Google login error:', err);
    res.status(500).json({ error: 'Google-kirjautuminen epäonnistui' });
  }
});

// Endpoint to provide Google Client ID to frontend
app.get('/api/google-client-id', (req, res) => {
  res.json({ clientId: GOOGLE_CLIENT_ID || null });
});

// Save user settings
app.post('/api/settings', async (req, res) => {
  try {
    const { nickname, password, settings } = req.body;
    if (!nickname || !password) return res.status(401).json({ error: 'Ei kirjautunut' });

    const rows = db.exec(`SELECT id, password_hash FROM users WHERE nickname = ? COLLATE NOCASE`, [nickname.toUpperCase()]);
    if (rows.length === 0 || rows[0].values.length === 0) return res.status(401).json({ error: 'Ei kirjautunut' });

    const [id, password_hash] = rows[0].values[0];
    const match = await bcrypt.compare(password, password_hash);
    if (!match) return res.status(401).json({ error: 'Ei kirjautunut' });

    const settingsJson = JSON.stringify(settings || {});
    db.run(`UPDATE users SET settings = ? WHERE id = ?`, [settingsJson, id]);
    saveDb();

    res.json({ ok: true });
  } catch (err) {
    console.error('Settings save error:', err);
    res.status(500).json({ error: 'Asetusten tallennus epäonnistui' });
  }
});

// Get user info (check if logged in)
app.post('/api/me', (req, res) => {
  try {
    const { nickname, password } = req.body;
    if (!nickname || !password) return res.status(401).json({ error: 'Ei kirjautunut' });

    const rows = db.exec(`SELECT id, nickname, email FROM users WHERE nickname = ? COLLATE NOCASE`, [nickname.toUpperCase()]);
    if (rows.length === 0 || rows[0].values.length === 0) {
      return res.status(401).json({ error: 'Ei kirjautunut' });
    }
    const [id, dbNickname, email] = rows[0].values[0];
    res.json({ ok: true, user: { id, nickname: dbNickname, email } });
  } catch (err) {
    res.status(500).json({ error: 'Virhe' });
  }
});

// Get arena player count (for main menu display)
app.get('/api/arena-count', (req, res) => {
  let total = 0;
  for (const lang of Object.keys(publicGames)) {
    total += publicGames[lang].players.size;
  }
  res.json({ count: total });
});

// Save achievements
app.post('/api/achievements', async (req, res) => {
  try {
    const { nickname, password, achievements } = req.body;
    if (!nickname || !password) return res.status(401).json({ error: 'Ei kirjautunut' });

    const rows = db.exec(`SELECT id, password_hash FROM users WHERE nickname = ? COLLATE NOCASE`, [nickname.toUpperCase()]);
    if (rows.length === 0 || rows[0].values.length === 0) return res.status(401).json({ error: 'Ei kirjautunut' });

    const [id, password_hash] = rows[0].values[0];
    const match = await bcrypt.compare(password, password_hash);
    if (!match) return res.status(401).json({ error: 'Ei kirjautunut' });

    const achievementsJson = JSON.stringify(achievements || {});
    db.run(`UPDATE users SET achievements = ? WHERE id = ?`, [achievementsJson, id]);
    saveDb();

    res.json({ ok: true });
  } catch (err) {
    console.error('Achievements save error:', err);
    res.status(500).json({ error: 'Saavutusten tallennus epäonnistui' });
  }
});

// SPA catch-all: serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

// ============================================================================
// SERVER START
// ============================================================================

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
