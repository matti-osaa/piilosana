import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

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
// DATA STRUCTURES
// ============================================================================

const rooms = new Map();
const playerRooms = new Map();

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

// ============================================================================
// SOCKET.IO EVENT HANDLERS
// ============================================================================

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

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
      timer: null,
      timeLeft: 120,
      scores: new Map()
    };

    room.players.set(socket.id, { nickname, isHost: true });
    room.scores.set(socket.id, { nickname, score: 0, wordsFound: new Set() });

    rooms.set(roomCode, room);
    playerRooms.set(socket.id, roomCode);
    socket.join(roomCode);

    socket.emit('room_created', { roomCode, playerId: socket.id });
    io.to(roomCode).emit('room_update', { players: formatPlayers(room) });

    console.log(`Room ${roomCode} created by ${nickname} (${socket.id})`);
  });

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

    console.log(`${nickname} (${socket.id}) joined room ${roomCode}`);
  });

  socket.on('start_game', ({ grid, validWords }) => {
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
    room.validWords = validWords;
    room.gameState = 'running';
    room.timeLeft = 120;

    for (const [pid, s] of room.scores) {
      s.score = 0;
      s.wordsFound = new Set();
    }

    io.to(roomCode).emit('game_started', { grid, validWords });

    room.timer = setInterval(() => {
      room.timeLeft--;
      io.to(roomCode).emit('timer_tick', { remaining: room.timeLeft });

      if (room.timeLeft <= 0) {
        clearInterval(room.timer);
        room.timer = null;
        room.gameState = 'finished';

        const rankings = formatScores(room);
        io.to(roomCode).emit('game_over', { rankings });
        console.log(`Game over in room ${roomCode}`);
      }
    }, 1000);

    console.log(`Game started in room ${roomCode} with ${room.players.size} players`);
  });

  socket.on('word_found', ({ word }) => {
    const roomCode = playerRooms.get(socket.id);
    const room = rooms.get(roomCode);

    if (!room || room.gameState !== 'running') {
      socket.emit('word_result', { valid: false, message: 'Peli ei k\u00e4ynniss\u00e4' });
      return;
    }

    const normalized = word.toLowerCase().trim();
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

  socket.on('leave_room', () => {
    handleDisconnect(socket);
  });

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

// ============================================================================
// SERVER START
// ============================================================================

httpServer.listen(PORT, () => {
  console.log(`Piilosana server listening on port ${PORT}`);
});
