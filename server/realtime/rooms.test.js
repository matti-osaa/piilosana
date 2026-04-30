// rooms.test.js – yksityishuoneiden managerin käyttäytyminen ilman io:ta.
//
// Testataan create/join/leave -elinkaari, classic + battle moodien
// sananhyväksyntä, ja host-kierrätys kun host poistuu.
//
// Mockaamme db.js:n submitScoren ettei testit vaadi tietokantaa.

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../db.js", () => ({
  submitScore: vi.fn(async () => 1),
}));

const { createRoomManager } = await import("./rooms.js");

// ---- Helpperit ----

function makeMockIo() {
  const emits = [];
  return {
    emits,
    to: (room) => ({
      emit: (event, data) => emits.push({ room, event, data }),
    }),
    emit: (event, data) => emits.push({ room: null, event, data }),
  };
}

let socketCounter = 0;
function makeMockSocket(id = null) {
  if (!id) id = `s${++socketCounter}`;
  const emits = [];
  const joined = new Set();
  return {
    id,
    emits,
    joined,
    emit: (event, data) => emits.push({ event, data }),
    join: (room) => joined.add(room),
    leave: (room) => joined.delete(room),
    to: (room) => ({
      emit: (event, data) => emits.push({ to: room, event, data }),
    }),
  };
}

// Stub getLang ettei vaadi koko words.js -datajoukkoa testiin
const stubGetLang = () => ({ letterWeights: { a: 1, b: 1, c: 1 } });

// ---- Tests ----

describe("createRoomManager", () => {
  let io, mgr;
  beforeEach(() => {
    socketCounter = 0;
    io = makeMockIo();
    mgr = createRoomManager({ io, getLang: stubGetLang });
  });

  describe("create", () => {
    it("creates a room with 4-char code, host as first player", () => {
      const host = makeMockSocket();
      mgr.create(host, { nickname: "ALICE", lang: "fi" });
      expect(mgr.size()).toBe(1);
      const created = host.emits.find((e) => e.event === "room_created");
      expect(created).toBeDefined();
      expect(created.data.roomCode).toMatch(/^[A-Z0-9]{4}$/);
      // Host nähdään huonelistassa
      const list = mgr.getPublicRooms();
      expect(list[0].playerCount).toBe(1);
      expect(list[0].hostNickname).toBe("ALICE");
    });

    it("broadcasts updated room list", () => {
      const host = makeMockSocket();
      mgr.create(host, { nickname: "ALICE", lang: "fi" });
      const broadcast = io.emits.find((e) => e.event === "room_list" && e.room === null);
      expect(broadcast).toBeDefined();
      expect(broadcast.data.rooms.length).toBe(1);
    });
  });

  describe("join", () => {
    it("adds player to existing room", () => {
      const host = makeMockSocket();
      mgr.create(host, { nickname: "ALICE", lang: "fi" });
      const code = host.emits[0].data.roomCode;

      const guest = makeMockSocket();
      mgr.join(guest, { roomCode: code, nickname: "BOB" });
      const joined = guest.emits.find((e) => e.event === "room_joined");
      expect(joined.data.roomCode).toBe(code);
      expect(mgr.getPublicRooms()[0].playerCount).toBe(2);
    });

    it("emits room_not_found for unknown code", () => {
      const guest = makeMockSocket();
      mgr.join(guest, { roomCode: "ZZZZ", nickname: "BOB" });
      expect(guest.emits.some((e) => e.event === "room_not_found")).toBe(true);
    });

    it("rejects when room is full (8+ players)", () => {
      const host = makeMockSocket();
      mgr.create(host, { nickname: "HOST", lang: "fi" });
      const code = host.emits[0].data.roomCode;
      // Lisää 7 lisää (yhteensä 8)
      for (let i = 1; i < 8; i++) {
        mgr.join(makeMockSocket(), { roomCode: code, nickname: `P${i}` });
      }
      // 9. yritys kaatuu
      const overflow = makeMockSocket("overflow");
      mgr.join(overflow, { roomCode: code, nickname: "EXTRA" });
      expect(overflow.emits.some((e) => e.event === "error")).toBe(true);
      expect(mgr.getPublicRooms()[0].playerCount).toBe(8);
    });

    it("rejects when game is already running", () => {
      const host = makeMockSocket();
      mgr.create(host, { nickname: "HOST", lang: "fi" });
      const code = host.emits[0].data.roomCode;
      // Force room state running
      const room = mgr.rooms.get(code);
      room.gameState = "running";

      const late = makeMockSocket();
      mgr.join(late, { roomCode: code, nickname: "LATE" });
      const err = late.emits.find((e) => e.event === "error");
      expect(err).toBeDefined();
      expect(err.data.message).toMatch(/käynnissä/i);
    });
  });

  describe("startGame", () => {
    it("requires host to start", () => {
      const host = makeMockSocket();
      mgr.create(host, { nickname: "HOST", lang: "fi" });
      const code = host.emits[0].data.roomCode;
      const guest = makeMockSocket();
      mgr.join(guest, { roomCode: code, nickname: "GUEST" });

      // Guest yrittää aloittaa
      mgr.startGame(guest, { grid: [], validWords: [], gameMode: "classic", gameTime: 10 });
      const err = guest.emits.find((e) => e.event === "error");
      expect(err.data.message).toMatch(/isäntä/i);
    });

    it("emits game_started when host starts", () => {
      const host = makeMockSocket();
      mgr.create(host, { nickname: "HOST", lang: "fi" });
      io.emits.length = 0;

      mgr.startGame(host, { grid: [["a"]], validWords: ["foo"], gameMode: "classic", gameTime: 10 });
      const started = io.emits.find((e) => e.event === "game_started");
      expect(started).toBeDefined();
      expect(started.data.gameMode).toBe("classic");
    });
  });

  describe("classicWord", () => {
    let host, code, room;
    beforeEach(() => {
      host = makeMockSocket();
      mgr.create(host, { nickname: "HOST", lang: "fi" });
      code = host.emits[0].data.roomCode;
      room = mgr.rooms.get(code);
      // Set up running classic game manually (skip startGame timer)
      room.grid = [["k", "i", "s", "s", "a"]];
      room.validWords = ["kissa", "koira"];
      room.gameMode = "classic";
      room.gameState = "running";
    });

    it("scores valid word, emits word_result + score_update", () => {
      mgr.classicWord(host, { word: "kissa" });
      const result = host.emits.find((e) => e.event === "word_result");
      expect(result.data.valid).toBe(true);
      expect(result.data.points).toBeGreaterThan(0);
      const scoreUpdate = io.emits.find((e) => e.event === "score_update");
      expect(scoreUpdate).toBeDefined();
    });

    it("rejects already-found word", () => {
      mgr.classicWord(host, { word: "kissa" });
      host.emits.length = 0;
      mgr.classicWord(host, { word: "kissa" });
      const result = host.emits.find((e) => e.event === "word_result");
      expect(result.data.valid).toBe(false);
      expect(result.data.message).toMatch(/jo/i);
    });

    it("rejects word not in dictionary", () => {
      mgr.classicWord(host, { word: "xyz" });
      const result = host.emits.find((e) => e.event === "word_result");
      expect(result.data.valid).toBe(false);
    });

    it("rejects when game not running", () => {
      room.gameState = "waiting";
      mgr.classicWord(host, { word: "kissa" });
      const result = host.emits.find((e) => e.event === "word_result");
      expect(result.data.valid).toBe(false);
    });

    it("rejects classic word in battle mode", () => {
      room.gameMode = "battle";
      mgr.classicWord(host, { word: "kissa" });
      const result = host.emits.find((e) => e.event === "word_result");
      expect(result.data.valid).toBe(false);
      expect(result.data.message).toMatch(/moodi/i);
    });
  });

  describe("battleWord", () => {
    let host, room;
    beforeEach(() => {
      host = makeMockSocket();
      mgr.create(host, { nickname: "HOST", lang: "fi" });
      const code = host.emits[0].data.roomCode;
      room = mgr.rooms.get(code);
      // 'kissa' jäljitettävissä: (0,0)k → (0,1)i → (0,2)s → (1,2)s → (1,3)a
      room.grid = [
        ["k", "i", "s", "x"],
        ["x", "x", "s", "a"],
        ["x", "x", "x", "x"],
        ["x", "x", "x", "x"],
      ];
      room.gameMode = "battle";
      room.gameState = "running";
      room.battleFoundWords = new Set();
    });

    it("rejects word not traceable on grid", () => {
      mgr.battleWord(host, { word: "zebra", cells: null });
      const result = host.emits.find((e) => e.event === "word_result");
      expect(result.data.valid).toBe(false);
    });

    it("rejects word found by someone else first", () => {
      // Toinen pelaaja löysi sanan ensin
      room.battleFoundWords.add("kissa");
      mgr.battleWord(host, { word: "kissa" });
      const result = host.emits.find((e) => e.event === "word_result");
      expect(result.data.valid).toBe(false);
      expect(result.data.message).toMatch(/ensin/i);
    });
  });

  describe("leave", () => {
    it("removes solo player and destroys empty room", () => {
      const host = makeMockSocket();
      mgr.create(host, { nickname: "ALICE", lang: "fi" });
      mgr.leave(host);
      expect(mgr.size()).toBe(0);
    });

    it("removes one player, transfers host if needed", () => {
      const host = makeMockSocket();
      mgr.create(host, { nickname: "ALICE", lang: "fi" });
      const code = host.emits[0].data.roomCode;
      const guest = makeMockSocket();
      mgr.join(guest, { roomCode: code, nickname: "BOB" });

      // Host poistuu — guestin pitäisi tulla uudeksi hostiksi
      mgr.leave(host);
      const room = mgr.rooms.get(code);
      expect(room).toBeDefined();
      expect(room.hostId).toBe(guest.id);
      expect(room.players.get(guest.id).isHost).toBe(true);
    });

    it("no-op for socket not in any room", () => {
      const ghost = makeMockSocket("ghost");
      // Ei kaadu
      expect(() => mgr.leave(ghost)).not.toThrow();
    });
  });

  describe("getPlayerForEmoji", () => {
    it("returns roomCode + nickname for a player in a room", () => {
      const host = makeMockSocket();
      mgr.create(host, { nickname: "ALICE", lang: "fi" });
      const code = host.emits[0].data.roomCode;
      expect(mgr.getPlayerForEmoji(host.id)).toEqual({
        roomCode: code,
        nickname: "ALICE",
      });
    });

    it("returns null for unknown socket", () => {
      expect(mgr.getPlayerForEmoji("nobody")).toBeNull();
    });
  });
});
