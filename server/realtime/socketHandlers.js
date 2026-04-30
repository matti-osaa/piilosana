// socketHandlers.js — Socket.IO connection-handler ja kaikkien tapahtumien
// rekisteröinti. Logiikka itse asuu publicArena.js:ssä ja rooms.js:ssä;
// tämä tiedosto vain bindaa eventit ja delegoi.
//
// Käyttö:
//   attachSocketHandlers(io, { arena, roomMgr, appVersion });

const ALLOWED_EMOJIS = ["😀","😎","🤔","😮","🔥","💪","🎯","👀","😭","🤣","😱","🥳","👏","❤️","💀","🫡"];
const EMOJI_COOLDOWN_MS = 2000;

function safeLang(lang, validLangs) {
  return validLangs.includes(lang) ? lang : "fi";
}

export function attachSocketHandlers(io, ctx) {
  const { arena, roomMgr, appVersion, validLangs = ["fi", "en", "sv"] } = ctx;

  // Per-socket emoji-cooldownit (yksinkertainen Map socketId -> timestamp)
  const emojiCooldowns = new Map();

  io.on("connection", (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // App-versio + huonelista heti yhteyden alkaessa
    socket.emit("app_version", { version: appVersion });
    socket.emit("room_list", { rooms: roomMgr.getPublicRooms() });

    // ---- ARENA ----
    socket.on("join_public", ({ nickname, lang }) => {
      const gameLang = safeLang(lang, validLangs);
      if (!nickname || nickname.length > 12) {
        const msg = gameLang === "en"
          ? "Invalid nickname"
          : gameLang === "sv" ? "Ogiltigt smeknamn" : "Virheellinen nimimerkki";
        socket.emit("error", { message: msg });
        return;
      }
      const ok = arena.addPlayer(socket, { nickname, lang: gameLang });
      if (ok) {
        const count = arena.get(gameLang).players.size;
        console.log(`${nickname} joined Arena/${gameLang} (${count} players)`);
      }
    });

    socket.on("public_word_found", ({ word }) => {
      arena.handleWord(socket, word);
    });

    socket.on("leave_public", () => {
      const lang = arena.removePlayer(socket);
      if (lang) {
        const count = arena.get(lang).players.size;
        console.log(`Player left Arena/${lang} (${count} remaining)`);
      }
    });

    // ---- EMOJI REACTIONS ----
    socket.on("emoji_reaction", ({ emoji }) => {
      if (!ALLOWED_EMOJIS.includes(emoji)) return;
      const now = Date.now();
      const last = emojiCooldowns.get(socket.id) || 0;
      if (now - last < EMOJI_COOLDOWN_MS) return;
      emojiCooldowns.set(socket.id, now);

      // Yritetään ensin arenaa, sitten yksityistä huonetta
      const arenaPlayer = arena.getPlayerForEmoji(socket.id);
      if (arenaPlayer) {
        io.to(arenaPlayer.room).emit("emoji_feed", {
          nickname: arenaPlayer.nickname,
          emoji,
        });
        return;
      }
      const roomPlayer = roomMgr.getPlayerForEmoji(socket.id);
      if (roomPlayer) {
        io.to(roomPlayer.roomCode).emit("emoji_feed", {
          nickname: roomPlayer.nickname,
          emoji,
        });
      }
    });

    // ---- ROOMS ----
    socket.on("list_rooms", () => {
      socket.emit("room_list", { rooms: roomMgr.getPublicRooms() });
    });

    socket.on("create_room", ({ nickname, lang }) => {
      const gameLang = safeLang(lang, validLangs);
      roomMgr.create(socket, { nickname, lang: gameLang });
    });

    socket.on("join_room", ({ roomCode, nickname }) => {
      roomMgr.join(socket, { roomCode, nickname });
    });

    socket.on("start_game", (payload) => {
      roomMgr.startGame(socket, payload);
    });

    socket.on("word_found", (payload) => {
      roomMgr.classicWord(socket, payload);
    });

    socket.on("battle_word_found", (payload) => {
      roomMgr.battleWord(socket, payload);
    });

    socket.on("battle_selection", (payload) => {
      roomMgr.battleSelection(socket, payload);
    });

    socket.on("leave_room", () => {
      handleDisconnect(socket);
    });

    socket.on("disconnect", () => {
      console.log(`Player disconnected: ${socket.id}`);
      handleDisconnect(socket);
      emojiCooldowns.delete(socket.id);
    });
  });

  function handleDisconnect(socket) {
    arena.removePlayer(socket);
    roomMgr.leave(socket);
  }
}
