import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import Database from 'better-sqlite3';
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

const PORT = process.env.PORT || 3001;

// ============================================================================
// DATABASE (Hall of Fame)
// ============================================================================

const db = new Database(join(__dirname, 'piilosana.db'));
db.pragma('journal_mode = WAL');

db.exec(`
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

// Prepared statements for performance
const insertScore = db.prepare(`
  INSERT INTO hall_of_fame (nickname, score, words_found, words_total, percentage, game_mode, game_time, is_multi)
  VALUES (@nickname, @score, @wordsFound, @wordsTotal, @percentage, @gameMode, @gameTime, @isMulti)
`);

const getTopScores = db.prepare(`
  SELECT nickname, score, words_found, words_total, percentage, created_at
  FROM hall_of_fame
  WHERE game_mode = @gameMode AND game_time = @gameTime
  ORDER BY score DESC
  LIMIT 10
`);

// Categories: normal-120, normal-402, tetris-120, tetris-402
const HOF_CATEGORIES = [
  { gameMode: 'normal', gameTime: 120, label: 'Normaali 2 min' },
  { gameMode: 'normal', gameTime: 402, label: 'Normaali 6,7 min' },
  { gameMode: 'tetris', gameTime: 120, label: 'Tetris 2 min' },
  { gameMode: 'tetris', gameTime: 402, label: 'Tetris 6,7 min' },
];

function submitScore({ nickname, score, wordsFound, wordsTotal, gameMode, gameTime, isMulti }) {
  if (!nickname || score < 0 || !gameMode || !gameTime) return null;
  if (gameTime === 0) return null; // no hall of fame for unlimited
  const percentage = wordsTotal > 0 ? Math.round((wordsFound / wordsTotal) * 100) : 0;
  const result = insertScore.run({ nickname, score, wordsFound, wordsTotal, percentage, gameMode, gameTime: Number(gameTime), isMulti: isMulti ? 1 : 0 });
  return result.lastInsertRowid;
}

function getHallOfFame(gameMode, gameTime) {
  return getTopScores.all({ gameMode, gameTime: Number(gameTime) });
}

function getAllHallOfFame() {
  const result = {};
  for (const cat of HOF_CATEGORIES) {
    result[`${cat.gameMode}-${cat.gameTime}`] = {
      label: cat.label,
      scores: getTopScores.all({ gameMode: cat.gameMode, gameTime: cat.gameTime })
    };
  }
  return result;
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

// ============================================================================
// SERVER START
// ============================================================================

httpServer.listen(PORT, () => {
  console.log(`Piilosana server listening on port ${PORT}`);
});
