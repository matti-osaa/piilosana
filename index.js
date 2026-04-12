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

const rooms = new Map(); // roomCode -> { hostId, players, grid, validWords, gameState, timer, scores }
const playerRooms = new Map(); // playerId -> roomCode
const playerNicknames = new Map(); // playerId -> nickname

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
  return 14; // 8+ letters
}

function createRoom(hostId, nickname) {
  let roomCode;
  do {
    roomCode = generateRoomCode();
  } while (rooms.has(roomCode));

  const room = {
    roomCode,
    hostId,
    players: new Map(), // playerId -> { nickname, isHost, socketId }
    grid: null,
    validWords: [],
    gameState: 'waiting', // 'waiting' | 'running' | 'finished'
    timer: null,
    timeLeft: 120,
    scores: new Map(), // playerId -> { nickname, score, wordsFound: Set }
    gameStartTime: null
  };

  room.players.set(hostId, { nickname, isHost: true, socketId: null });
  room.scores.set(hostId, { nickname, score: 0, wordsFound: new Set() });

  rooms.set(roomCode, room);
  playerRooms.set(hostId, roomCode);
  playerNicknames.set(hostId, nickname);

  return roomCode;
}

function formatRoomPlayers(room) {
  return Array.from(room.players.entries()).map(([playerId, player]) => ({
    id: playerId,
    nickname: player.nickname,
    isHost: player.isHost
  }));
}

function formatScoreboard(room) {
  return Array.from(room.scores.entries()).map(([playerId, score]) => ({
    nickname: score.nickname,
    score: score.score,
    wordsFound: score.wordsFound.size
  }));
}

function broadcastRoomUpdate(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  io.to(roomCode).emit('room_update', {
    players: formatRoomPlayers(room)
  });
}

function broadcastScoreUpdate(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  io.to(roomCode).emit('score_update', {
    scores: formatScoreboard(room)
  });
}

function deleteRoomIfEmpty(roomCode) {
  const room = rooms.get(roomCode);
  if (room && room.players.size === 0) {
    if (room.timer) clearInterval(room.timer);
    rooms.delete(roomCode);
  }
}

function startGameTimer(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  room.gameState = 'running';
  room.gameStartTime = Date.now();
  room.timeLeft = 120;

  // Send initial grid
  io.to(roomCode).emit('game_started', {
    grid: room.grid,
    timeLeft: room.timeLeft
  });

  // Send timer ticks every second
  room.timer = setInterval(() => {
    room.timeLeft--;

    io.to(roomCode).emit('timer_tick', {
      timeLeft: room.timeLeft
    });

    if (room.timeLeft <= 0) {
      endGame(roomCode);
    }
  }, 1000);
}

function endGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  if (room.timer) clearInterval(room.timer);
  room.gameState = 'finished';

  // Create rankings
  const rankings = Array.from(room.scores.entries())
    .map(([, score]) => ({
      nickname: score.nickname,
      score: score.score,
      wordsFound: score.wordsFound.size,
      words: Array.from(score.wordsFound)
    }))
    .sort((a, b) => b.score - a.score);

  io.to(roomCode).emit('game_over', { rankings });
}

// ============================================================================
// SOCKET.IO EVENT HANDLERS
// ============================================================================

io.on('connection', (socket) => {
  const playerId = socket.id;

  socket.on('create_room', ({ nickname }, callback) => {
    try {
      const roomCode = createRoom(playerId, nickname);
      socket.join(roomCode);

      const room = rooms.get(roomCode);
      room.players.get(playerId).socketId = socket.id;

      callback({
        success: true,
        roomCode,
        playerId
      });

      broadcastRoomUpdate(roomCode);
    } catch (error) {
      callback({
        success: false,
        error: error.message
      });
    }
  });

  socket.on('join_room', ({ roomCode, nickname }, callback) => {
    try {
      const room = rooms.get(roomCode);

      if (!room) {
        return callback({
          success: false,
          error: 'Room not found'
        });
      }

      if (room.players.size >= 8) {
        return callback({
          success: false,
          error: 'Room is full'
        });
      }

      if (room.gameState !== 'waiting') {
        return callback({
          success: false,
          error: 'Game has already started'
        });
      }

      room.players.set(playerId, { nickname, isHost: false, socketId: socket.id });
      room.scores.set(playerId, { nickname, score: 0, wordsFound: new Set() });

      playerRooms.set(playerId, roomCode);
      playerNicknames.set(playerId, nickname);

      socket.join(roomCode);

      callback({
        success: true,
        players: formatRoomPlayers(room),
        playerId
      });

      broadcastRoomUpdate(roomCode);
    } catch (error) {
      callback({
        success: false,
        error: error.message
      });
    }
  });

  socket.on('start_game', ({ grid, validWords }, callback) => {
    try {
      const roomCode = playerRooms.get(playerId);
      const room = rooms.get(roomCode);

      if (!room) {
        return callback({ success: false, error: 'Room not found' });
      }

      if (room.hostId !== playerId) {
        return callback({ success: false, error: 'Only host can start the game' });
      }

      if (room.gameState !== 'waiting') {
        return callback({ success: false, error: 'Game already started' });
      }

      room.grid = grid;
      room.validWords = validWords;

      startGameTimer(roomCode);

      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  socket.on('word_found', ({ word }, callback) => {
    try {
      const roomCode = playerRooms.get(playerId);
      const room = rooms.get(roomCode);

      if (!room) {
        callback({ valid: false, error: 'Room not found' });
        return;
      }

      if (room.gameState !== 'running') {
        callback({ valid: false, error: 'Game is not running' });
        return;
      }

      const normalizedWord = word.toLowerCase().trim();

      // Check if valid word
      const isValid = room.validWords.includes(normalizedWord);

      if (!isValid) {
        callback({ valid: false, word, message: 'Word not in valid list' });
        return;
      }

      const playerScore = room.scores.get(playerId);

      // Check if already found
      if (playerScore.wordsFound.has(normalizedWord)) {
        callback({ valid: false, word, alreadyFound: true, message: 'Already found' });
        return;
      }

      // Award points
      const points = getScoreForWordLength(normalizedWord.length);
      playerScore.score += points;
      playerScore.wordsFound.add(normalizedWord);

      callback({
        valid: true,
        word,
        score: points,
        alreadyFound: false
      });

      broadcastScoreUpdate(roomCode);
    } catch (error) {
      callback({ valid: false, error: error.message });
    }
  });

  socket.on('leave_room', () => {
    const roomCode = playerRooms.get(playerId);
    const room = rooms.get(roomCode);

    if (room) {
      room.players.delete(playerId);
      room.scores.delete(playerId);

      if (room.players.size === 0) {
        if (room.timer) clearInterval(room.timer);
        rooms.delete(roomCode);
      } else {
        // If host leaves, assign new host
        if (room.hostId === playerId) {
          const remainingPlayerIds = Array.from(room.players.keys());
          if (remainingPlayerIds.length > 0) {
            const newHostId = remainingPlayerIds[0];
            room.hostId = newHostId;
            room.players.get(newHostId).isHost = true;
          }
        }

        broadcastRoomUpdate(roomCode);
      }
    }

    playerRooms.delete(playerId);
    playerNicknames.delete(playerId);
    socket.leave(roomCode);
  });

  socket.on('disconnect', () => {
    const roomCode = playerRooms.get(playerId);
    const room = rooms.get(roomCode);

    if (room) {
      room.players.delete(playerId);
      room.scores.delete(playerId);

      if (room.players.size === 0) {
        if (room.timer) clearInterval(room.timer);
        rooms.delete(roomCode);
      } else {
        // If host disconnects, assign new host
        if (room.hostId === playerId) {
          const remainingPlayerIds = Array.from(room.players.keys());
          if (remainingPlayerIds.length > 0) {
            const newHostId = remainingPlayerIds[0];
            room.hostId = newHostId;
            room.players.get(newHostId).isHost = true;
          }
        }

        io.to(roomCode).emit('room_update', {
          players: formatRoomPlayers(room)
        });
      }
    }

    playerRooms.delete(playerId);
    playerNicknames.delete(playerId);
  });
});

// ============================================================================
// HTTP ROUTES
// ============================================================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/rooms', (req, res) => {
  const roomList = Array.from(rooms.entries()).map(([code, room]) => ({
    code,
    hostId: room.hostId,
    playerCount: room.players.size,
    gameState: room.gameState
  }));

  res.json({ rooms: roomList });
});

// ============================================================================
// SERVER START
// ============================================================================

httpServer.listen(PORT, () => {
  console.log(`Piilosana server listening on port ${PORT}`);
});
