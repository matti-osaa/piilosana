// rooms.js — Yksityiset moninpelihuoneet (4-merkkinen koodi).
//
// Manageri pitää huolta huoneista (Map: roomCode -> room) ja siitä missä
// huoneessa kukin socket on (Map: socketId -> roomCode). Ei sisällä socket.on-
// kuuntelijoita — ne elävät socketHandlers.js:ssä.
//
// Käyttö:
//   const roomMgr = createRoomManager({ io, getLang });
//   roomMgr.create(socket, { nickname, lang });
//   ...

import { getScoreForWordLength } from "../game/score.js";
import { canTraceWord } from "../game/validate.js";
import { hasWordInBuf, FULL_WORDS_BUF, getLang as defaultGetLang } from "../words.js";
import { HEX_ROWS, HEX_COLS, randLetter as randLetterPure } from "../game/grid.js";
import { submitScore } from "../db.js";

const MAX_PLAYERS_PER_ROOM = 8;
const ROOM_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const COUNTDOWN_BEFORE_START = 5_000;

function generateRoomCode() {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += ROOM_CODE_CHARS.charAt(Math.floor(Math.random() * ROOM_CODE_CHARS.length));
  }
  return code;
}

function formatPlayers(room) {
  return Array.from(room.players.entries()).map(([pid, p]) => ({
    playerId: pid,
    nickname: p.nickname,
    isHost: p.isHost,
  }));
}

function formatScores(room) {
  return Array.from(room.scores.entries())
    .map(([pid, s]) => ({
      playerId: pid,
      nickname: s.nickname,
      score: s.score,
      wordsFound: s.wordsFound.size,
    }))
    .sort((a, b) => b.score - a.score);
}

// Battle-mode: sovella painovoimaa kun sanoja löytyy
function applyGravity(grid, removedCells, lang, getLang) {
  const sz = grid.length;
  const newGrid = grid.map((row) => [...row]);
  const weights = getLang(lang).letterWeights;

  for (const { r, c } of removedCells) newGrid[r][c] = null;

  for (let c = 0; c < sz; c++) {
    const letters = [];
    for (let r = sz - 1; r >= 0; r--) {
      if (newGrid[r][c] !== null) letters.push(newGrid[r][c]);
    }
    for (let r = sz - 1; r >= 0; r--) {
      const idx = sz - 1 - r;
      if (idx < letters.length) {
        newGrid[r][c] = letters[idx];
      } else {
        newGrid[r][c] = randLetterPure(weights);
      }
    }
  }
  return newGrid;
}

// Etsi sanan reitti gridiltä (kun client ei lähettänyt cellsiä)
function findWordPath(grid, word) {
  const sz = grid.length;
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

  function dfs(r, c, idx, visited, path) {
    if (idx === word.length) return path;
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
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

export function createRoomManager({ io, getLang = defaultGetLang }) {
  const rooms = new Map();          // roomCode -> room
  const playerRooms = new Map();    // socketId -> roomCode

  function getPublicRooms() {
    const list = [];
    for (const [code, room] of rooms) {
      if (room.gameState === "waiting") {
        list.push({
          roomCode: code,
          hostNickname: room.players.get(room.hostId)?.nickname || "?",
          playerCount: room.players.size,
          maxPlayers: MAX_PLAYERS_PER_ROOM,
          lang: room.lang || "fi",
        });
      }
    }
    return list;
  }

  function broadcastRoomList() {
    io.emit("room_list", { rooms: getPublicRooms() });
  }

  function create(socket, { nickname, lang }) {
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
      gameState: "waiting",
      gameMode: "classic",
      timer: null,
      countdownTimer: null,
      timeLeft: 120,
      scores: new Map(),
      battleFoundWords: new Set(),
      lang: lang || "fi",
    };

    room.players.set(socket.id, { nickname, isHost: true });
    room.scores.set(socket.id, { nickname, score: 0, wordsFound: new Set() });

    rooms.set(roomCode, room);
    playerRooms.set(socket.id, roomCode);
    socket.join(roomCode);

    socket.emit("room_created", { roomCode, playerId: socket.id });
    io.to(roomCode).emit("room_update", { players: formatPlayers(room) });

    broadcastRoomList();
    console.log(`Room ${roomCode} created by ${nickname} (${socket.id})`);
  }

  function join(socket, { roomCode, nickname }) {
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit("room_not_found");
      return;
    }
    if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
      socket.emit("error", { message: "Huone on täynnä (max 8)" });
      return;
    }
    if (room.gameState !== "waiting") {
      socket.emit("error", { message: "Peli on jo käynnissä" });
      return;
    }

    room.players.set(socket.id, { nickname, isHost: false });
    room.scores.set(socket.id, { nickname, score: 0, wordsFound: new Set() });
    playerRooms.set(socket.id, roomCode);
    socket.join(roomCode);

    socket.emit("room_joined", { roomCode, playerId: socket.id });
    io.to(roomCode).emit("room_update", { players: formatPlayers(room) });

    broadcastRoomList();
    console.log(`${nickname} (${socket.id}) joined room ${roomCode}`);
  }

  function startGame(socket, { grid, validWords, gameMode, gameTime }) {
    const roomCode = playerRooms.get(socket.id);
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit("error", { message: "Huonetta ei löydy" });
      return;
    }
    if (room.hostId !== socket.id) {
      socket.emit("error", { message: "Vain isäntä voi aloittaa pelin" });
      return;
    }
    if (room.gameState !== "waiting") {
      socket.emit("error", { message: "Peli on jo aloitettu" });
      return;
    }

    room.grid = grid;
    room.validWords = validWords;
    room.gameMode = gameMode || "classic";
    room.gameState = "running";
    room.timeLeft = gameTime || 120;
    room.originalGameTime = gameTime || 120;
    room.battleFoundWords = new Set();

    for (const [, s] of room.scores) {
      s.score = 0;
      s.wordsFound = new Set();
    }

    io.to(roomCode).emit("game_started", { grid, validWords, gameMode: room.gameMode });
    broadcastRoomList();

    // 5s countdown ennen pelin alkua
    room.countdownTimer = setTimeout(() => {
      room.countdownTimer = null;
      room.timer = setInterval(async () => {
        room.timeLeft--;
        io.to(roomCode).emit("timer_tick", { remaining: room.timeLeft });

        if (room.timeLeft <= 0) {
          clearInterval(room.timer);
          room.timer = null;
          room.gameState = "finished";

          const rankings = formatScores(room);
          const allFoundWords = {};
          for (const [pid, s] of room.scores.entries()) {
            allFoundWords[pid] = [...s.wordsFound];
          }

          // Tallenna pisteet hall of fameen multiplayer-peleille
          for (const [pid, s] of room.scores.entries()) {
            const p = room.players.get(pid);
            if (p && s.score > 0) {
              await submitScore({
                nickname: p.nickname,
                score: s.score,
                wordsFound: s.wordsFound.size,
                wordsTotal: room.validWords.length || s.wordsFound.size,
                gameMode: room.gameMode === "battle" ? "tetris" : "normal",
                gameTime: room.timeLeft > 0 ? 120 : (room.originalGameTime || 120),
                isMulti: true,
                lang: room.lang || "fi",
              });
            }
          }

          io.to(roomCode).emit("game_over", {
            rankings,
            validWords: room.gameMode === "classic" ? room.validWords : [],
            allFoundWords,
          });

          console.log(`Game over in room ${roomCode}`);
        }
      }, 1000);
    }, COUNTDOWN_BEFORE_START);

    console.log(`Game started in room ${roomCode} mode=${room.gameMode} (received: ${gameMode}) with ${room.players.size} players`);
  }

  // Classic mode: sana löydetty
  function classicWord(socket, { word }) {
    const roomCode = playerRooms.get(socket.id);
    const room = rooms.get(roomCode);

    if (!room || room.gameState !== "running") {
      socket.emit("word_result", { valid: false, message: "Peli ei käynnissä" });
      return;
    }

    const normalized = (word || "").toLowerCase().trim();

    if (room.gameMode === "battle") {
      socket.emit("word_result", { valid: false, message: "Väärä moodi" });
      return;
    }

    let isValid = room.validWords.includes(normalized);

    // Tarkista koko sanasto pitkille suomenkielisille sanoille + reitti
    const isHexGrid = room.grid && room.grid.length === HEX_ROWS && room.grid[0].length === HEX_COLS;
    if (
      !isValid
      && (room.lang || "fi") === "fi"
      && normalized.length > 8
      && hasWordInBuf(FULL_WORDS_BUF, normalized)
      && canTraceWord(room.grid, normalized, isHexGrid)
    ) {
      isValid = true;
      room.validWords.push(normalized);
    }

    if (!isValid) {
      socket.emit("word_result", { valid: false, message: "Ei kelpaa" });
      return;
    }

    const playerScore = room.scores.get(socket.id);
    if (playerScore.wordsFound.has(normalized)) {
      socket.emit("word_result", { valid: false, message: "Löydetty jo" });
      return;
    }

    const points = getScoreForWordLength(normalized.length);
    playerScore.score += points;
    playerScore.wordsFound.add(normalized);

    const combo = playerScore.wordsFound.size;
    socket.emit("word_result", {
      valid: true,
      message: `+${points}p`,
      points,
      combo: Math.min(combo, 2),
    });

    io.to(roomCode).emit("score_update", { scores: formatScores(room) });
  }

  // Battle mode: sana löydetty (tetris-mainen, ensimmäinen voittaa)
  function battleWord(socket, { word, cells }) {
    const roomCode = playerRooms.get(socket.id);
    const room = rooms.get(roomCode);

    if (!room) {
      socket.emit("word_result", { valid: false, message: "Huonetta ei löydy" });
      return;
    }
    if (room.gameState !== "running") {
      socket.emit("word_result", { valid: false, message: "Peli ei käynnissä" });
      return;
    }
    if (room.gameMode !== "battle") {
      socket.emit("word_result", { valid: false, message: "Väärä pelimoodi: " + room.gameMode });
      return;
    }

    const normalized = (word || "").toLowerCase().trim();

    if (normalized.length < 3) {
      socket.emit("word_result", { valid: false, message: "Liian lyhyt" });
      return;
    }

    if (!canTraceWord(room.grid, normalized)) {
      socket.emit("word_result", { valid: false, message: "Ei löydy ruudukosta" });
      return;
    }

    if (room.battleFoundWords.has(normalized)) {
      socket.emit("word_result", { valid: false, message: "Joku ehti ensin!" });
      return;
    }

    room.battleFoundWords.add(normalized);

    const playerScore = room.scores.get(socket.id);
    const points = getScoreForWordLength(normalized.length);
    playerScore.score += points;
    playerScore.wordsFound.add(normalized);

    const path = cells || findWordPath(room.grid, normalized);

    if (!path || path.length === 0) {
      socket.emit("word_result", { valid: true, message: `+${points}p`, points, combo: 1 });
      io.to(roomCode).emit("score_update", { scores: formatScores(room) });
      return;
    }

    // Sovella painovoimaa
    room.grid = applyGravity(room.grid, path, room.lang || "fi", getLang);

    socket.emit("word_result", {
      valid: true,
      message: `+${points}p`,
      points,
      combo: playerScore.wordsFound.size,
    });

    const nickname = room.players.get(socket.id)?.nickname || "?";
    io.to(roomCode).emit("battle_grid_update", {
      grid: room.grid,
      removedCells: path,
      word: normalized,
      finder: nickname,
      finderId: socket.id,
      points,
    });

    io.to(roomCode).emit("score_update", { scores: formatScores(room) });
  }

  // Battle mode: lähetä pelaajan valinta muille
  function battleSelection(socket, { cells }) {
    const roomCode = playerRooms.get(socket.id);
    const room = rooms.get(roomCode);
    if (!room || room.gameState !== "running" || room.gameMode !== "battle") return;

    const nickname = room.players.get(socket.id)?.nickname || "?";
    socket.to(roomCode).emit("battle_player_selection", {
      playerId: socket.id,
      nickname,
      cells,
    });
  }

  // Pelaaja poistuu huoneesta tai disconnectaa
  function leave(socket) {
    const roomCode = playerRooms.get(socket.id);
    const room = rooms.get(roomCode);
    if (!room) {
      playerRooms.delete(socket.id);
      return;
    }

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
      io.to(roomCode).emit("room_update", { players: formatPlayers(room) });
    }

    broadcastRoomList();
    playerRooms.delete(socket.id);
    socket.leave(roomCode);
  }

  // Apuri emoji-reactionia varten — palauttaa { roomCode, nickname } tai null
  function getPlayerForEmoji(socketId) {
    const roomCode = playerRooms.get(socketId);
    if (!roomCode || !rooms.has(roomCode)) return null;
    const p = rooms.get(roomCode).players.get(socketId);
    if (!p) return null;
    return { roomCode, nickname: p.nickname };
  }

  function size() {
    return rooms.size;
  }

  return {
    // Tilaan pääsy
    rooms,
    size,
    getPublicRooms,
    broadcastRoomList,

    // Socket-actionit
    create,
    join,
    startGame,
    classicWord,
    battleWord,
    battleSelection,
    leave,
    getPlayerForEmoji,
  };
}
