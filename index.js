import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

const DB_PATH = join(__dirname, 'piilosana.db');
let db;

async function initDb() {
  const SQL = await initSqlJs();
  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  saveDb();
}

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

function submitScore({ nickname, score, wordsFound, wordsTotal, gameMode, gameTime, isMulti }) {
  if (!db || !nickname || score < 0 || !gameMode || !gameTime) return null;
  if (gameTime === 0) return null;
  const percentage = wordsTotal > 0 ? Math.round((wordsFound / wordsTotal) * 100) : 0;
  db.run(
    `INSERT INTO hall_of_fame (nickname, score, words_found, words_total, percentage, game_mode, game_time, is_multi)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [nickname, score, wordsFound, wordsTotal, percentage, gameMode, Number(gameTime), isMulti ? 1 : 0]
  );
  saveDb();
  return true;
}

function getHallOfFame(gameMode, gameTime) {
  if (!db) return [];
  const stmt = db.prepare(
    `SELECT nickname, score, words_found, words_total, percentage, created_at
     FROM hall_of_fame WHERE game_mode = ? AND game_time = ? ORDER BY score DESC LIMIT 10`
  );
  stmt.bind([gameMode, Number(gameTime)]);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function getAllHallOfFame() {
  const result = {};
  for (const cat of HOF_CATEGORIES) {
    result[`${cat.gameMode}-${cat.gameTime}`] = {
      label: cat.label,
      scores: getHallOfFame(cat.gameMode, cat.gameTime)
    };
  }
  return result;
}

// ============================================================================
// WORD LIST + TRIE (for server-side grid generation & validation)
// ============================================================================

import WORDS_RAW from './words.js';
const WORDS_SET = new Set(WORDS_RAW.split('|'));

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
const TRIE = buildTrie(WORDS_SET);

const GRID_SIZE = 5;

function makeGrid() {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => randLetter())
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

function generateGoodGrid() {
  let bestGrid = null, bestWords = new Set();
  for (let i = 0; i < 30; i++) {
    const g = makeGrid();
    const w = findWords(g, TRIE);
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

const publicGame = {
  grid: null,
  validWords: new Set(),
  validWordsList: [],
  players: new Map(), // socketId -> { nickname, score, wordsFound: Set }
  state: 'waiting', // 'waiting' | 'countdown' | 'playing'
  timeLeft: PUBLIC_GAME_TIME,
  timer: null,
  countdownTimer: null,
  roundNumber: 0,
};

function startPublicRound() {
  const { grid, validWords } = generateGoodGrid();
  publicGame.grid = grid;
  publicGame.validWords = validWords;
  publicGame.validWordsList = [...validWords];
  publicGame.state = 'countdown';
  publicGame.timeLeft = PUBLIC_GAME_TIME;
  publicGame.roundNumber++;

  // Reset scores for all current players
  for (const [, p] of publicGame.players) {
    p.score = 0;
    p.wordsFound = new Set();
  }

  // Send countdown to all players
  io.to('public_game').emit('public_countdown', {
    grid,
    validWords: publicGame.validWordsList,
    roundNumber: publicGame.roundNumber,
  });

  // 5 second countdown, then start
  publicGame.countdownTimer = setTimeout(() => {
    publicGame.state = 'playing';
    io.to('public_game').emit('public_game_start');

    publicGame.timer = setInterval(() => {
      publicGame.timeLeft--;
      io.to('public_game').emit('public_timer_tick', { remaining: publicGame.timeLeft });

      if (publicGame.timeLeft <= 0) {
        clearInterval(publicGame.timer);
        publicGame.timer = null;
        endPublicRound();
      }
    }, 1000);
  }, 5000);
}

function endPublicRound() {
  publicGame.state = 'waiting';

  const rankings = Array.from(publicGame.players.entries())
    .map(([sid, p]) => ({
      nickname: p.nickname,
      score: p.score,
      wordsFound: p.wordsFound.size,
      percentage: publicGame.validWords.size > 0
        ? Math.round((p.wordsFound.size / publicGame.validWords.size) * 100) : 0,
    }))
    .sort((a, b) => b.score - a.score);

  // Collect all words found by all players
  const allFoundWords = new Set();
  for (const [, p] of publicGame.players) {
    for (const w of p.wordsFound) allFoundWords.add(w);
  }

  // Save to hall of fame
  for (const r of rankings) {
    if (r.score > 0) {
      submitScore({
        nickname: r.nickname,
        score: r.score,
        wordsFound: r.wordsFound,
        wordsTotal: publicGame.validWords.size,
        gameMode: 'normal',
        gameTime: PUBLIC_GAME_TIME,
        isMulti: true,
      });
    }
  }

  io.to('public_game').emit('public_game_over', {
    rankings,
    validWords: publicGame.validWordsList,
    allFoundWords: [...allFoundWords],
  });

  // Countdown to next round (60 seconds)
  let nextRoundCountdown = 60;
  const countdownInterval = setInterval(() => {
    nextRoundCountdown--;
    io.to('public_game').emit('public_next_round_countdown', { seconds: nextRoundCountdown });
    if (nextRoundCountdown <= 0) {
      clearInterval(countdownInterval);
      if (publicGame.players.size > 0) {
        startPublicRound();
      }
    }
  }, 1000);
}

function publicScoreUpdate() {
  const scores = Array.from(publicGame.players.entries())
    .map(([, p]) => ({ nickname: p.nickname, score: p.score, wordsFound: p.wordsFound.size }))
    .sort((a, b) => b.score - a.score);
  io.to('public_game').emit('public_score_update', { scores });
}

// ============================================================================
// DATA STRUCTURES
// ============================================================================

const rooms = new Map(); // roomCode -> room
const playerRooms = new Map(); // socketId -> roomCode

// ============================================================================
// LETTER GENERATION (for battle mode)
// ============================================================================

const LETTER_WEIGHTS = {
  a:120, i:108, t:87, n:88, e:80, s:79, l:58, o:53, k:51, u:51,
  '\u00e4':37, m:33, v:25, r:29, j:20, h:19, y:19, p:18, d:10, '\u00f6':4
};
const LETTERS = Object.keys(LETTER_WEIGHTS);
const TOTAL_WEIGHT = Object.values(LETTER_WEIGHTS).reduce((a, b) => a + b, 0);

function randLetter() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (let i = 0; i < LETTERS.length; i++) {
    r -= LETTER_WEIGHTS[LETTERS[i]];
    if (r <= 0) return LETTERS[i];
  }
  return LETTERS[LETTERS.length - 1];
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
function applyGravity(grid, removedCells) {
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
        newGrid[r][c] = randLetter();
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
        maxPlayers: 8
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

  // ---- JOIN PUBLIC GAME (PIILOSAUNA) ----
  socket.on('join_public', ({ nickname }) => {
    if (!nickname || nickname.length > 12) {
      socket.emit('error', { message: 'Virheellinen nimimerkki' });
      return;
    }
    if (publicGame.players.size >= 64) {
      socket.emit('error', { message: 'Piilosauna on täynnä (max 64)' });
      return;
    }

    socket.join('public_game');
    publicGame.players.set(socket.id, {
      nickname,
      score: 0,
      wordsFound: new Set(),
    });

    // Tell the player the current state
    if (publicGame.state === 'playing') {
      // Join mid-game
      socket.emit('public_join_midgame', {
        grid: publicGame.grid,
        validWords: publicGame.validWordsList,
        timeLeft: publicGame.timeLeft,
        roundNumber: publicGame.roundNumber,
      });
    } else if (publicGame.state === 'countdown') {
      socket.emit('public_countdown', {
        grid: publicGame.grid,
        validWords: publicGame.validWordsList,
        roundNumber: publicGame.roundNumber,
      });
    } else {
      socket.emit('public_waiting', { playerCount: publicGame.players.size });
    }

    publicScoreUpdate();
    io.to('public_game').emit('public_player_count', { count: publicGame.players.size });

    // Start a round if this is the first player and game is waiting
    if (publicGame.state === 'waiting' && publicGame.players.size >= 1) {
      startPublicRound();
    }

    console.log(`${nickname} joined Piilosauna (${publicGame.players.size} players)`);
  });

  // ---- PUBLIC GAME: WORD FOUND ----
  socket.on('public_word_found', ({ word }) => {
    if (publicGame.state !== 'playing') return;
    const player = publicGame.players.get(socket.id);
    if (!player) return;

    const normalized = word.toLowerCase().trim();
    if (normalized.length < 3) return;
    if (!publicGame.validWords.has(normalized)) {
      socket.emit('public_word_result', { valid: false, message: 'Ei kelpaa' });
      return;
    }
    if (player.wordsFound.has(normalized)) {
      socket.emit('public_word_result', { valid: false, message: 'Jo löydetty' });
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

    publicScoreUpdate();
  });

  // ---- LEAVE PUBLIC GAME ----
  socket.on('leave_public', () => {
    socket.leave('public_game');
    publicGame.players.delete(socket.id);
    io.to('public_game').emit('public_player_count', { count: publicGame.players.size });
    console.log(`Player left Piilosauna (${publicGame.players.size} remaining)`);
  });

  // ---- LIST ROOMS ----
  socket.on('list_rooms', () => {
    socket.emit('room_list', { rooms: getPublicRooms() });
  });

  // ---- CREATE ROOM ----
  socket.on('create_room', ({ nickname }) => {
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
      gameMode: 'classic', // 'classic' or 'battle'
      timer: null,
      countdownTimer: null,
      timeLeft: 120,
      scores: new Map(),
      // Battle mode: track all found words globally
      battleFoundWords: new Set(),
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
                isMulti: true
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
    room.grid = applyGravity(room.grid, path);

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
  if (publicGame.players.has(socket.id)) {
    publicGame.players.delete(socket.id);
    socket.leave('public_game');
    io.to('public_game').emit('public_player_count', { count: publicGame.players.size });
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
  res.json(getAllHallOfFame());
});

// Hall of Fame: get specific category
app.get('/api/hall-of-fame/:gameMode/:gameTime', (req, res) => {
  const { gameMode, gameTime } = req.params;
  res.json(getHallOfFame(gameMode, Number(gameTime)));
});

// Public game status
app.get('/api/public-game', (req, res) => {
  res.json({
    state: publicGame.state,
    playerCount: publicGame.players.size,
    timeLeft: publicGame.timeLeft,
    roundNumber: publicGame.roundNumber,
  });
});

// Hall of Fame: submit score (for solo games)
app.post('/api/hall-of-fame', (req, res) => {
  const { nickname, score, wordsFound, wordsTotal, gameMode, gameTime } = req.body;
  if (!nickname || nickname.length > 12) {
    return res.status(400).json({ error: 'Virheellinen nimimerkki' });
  }
  const id = submitScore({ nickname, score, wordsFound, wordsTotal, gameMode, gameTime, isMulti: false });
  if (!id) return res.status(400).json({ error: 'Tulosta ei voitu tallentaa' });
  // Return updated top 10 for this category
  const top = getHallOfFame(gameMode, gameTime);
  res.json({ id, top });
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
  });
}).catch(err => {
  console.error('Failed to init database:', err);
  process.exit(1);
});
