// publicArena.test.js – arena-managerin käyttäytyminen ilman oikeaa Socket.IO:ta.
//
// Testit ajetaan ilman timerejä – startRound/endRound -putki vaatii
// setTimeoutia, joten emme kutsu sitä. Sen sijaan asetamme arenan tilan
// suoraan 'playing'iksi ja testaamme socket-logiikan.
//
// Mockaamme db.js:n ettei yksikkötesti vaadi tietokantaa.

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../db.js", () => ({
  submitScore: vi.fn(async () => 1),
}));

// Importtaa vasta mock:n jälkeen
const { createPublicArenaManager } = await import("./publicArena.js");

// ---- Testi-helpperit ----

function makeMockIo() {
  const emits = []; // { room, event, data }
  return {
    emits,
    to: (room) => ({
      emit: (event, data) => {
        emits.push({ room, event, data });
      },
    }),
    emit: (event, data) => {
      emits.push({ room: null, event, data });
    },
  };
}

function makeMockSocket(id = "s1") {
  const emits = [];
  const joined = new Set();
  return {
    id,
    emits,
    joined,
    emit: (event, data) => emits.push({ event, data }),
    join: (room) => joined.add(room),
    leave: (room) => joined.delete(room),
  };
}

// Generaattori joka palauttaa kanned validwords-setin
function makeStubGenerator(words = ["kissa", "koira", "kala"]) {
  const grid = [["k", "i", "s", "s", "a"], ["k", "o", "i", "r", "a"], ["k", "a", "l", "a", "x"]];
  return () => ({ grid, validWords: new Set(words) });
}

// ---- Testit ----

describe("createPublicArenaManager", () => {
  let io, arena;
  beforeEach(() => {
    io = makeMockIo();
    arena = createPublicArenaManager({ io, generateGoodGrid: makeStubGenerator() });
  });

  it("creates per-language games on demand", () => {
    const fi = arena.get("fi");
    const en = arena.get("en");
    expect(fi).not.toBe(en);
    expect(fi.players.size).toBe(0);
    expect(fi.state).toBe("waiting");
  });

  it("addPlayer joins room, registers player, returns true", () => {
    const socket = makeMockSocket();
    const ok = arena.addPlayer(socket, { nickname: "ALICE", lang: "fi" });
    expect(ok).toBe(true);
    expect(socket.joined.has("public_game_fi")).toBe(true);
    expect(arena.get("fi").players.has("s1")).toBe(true);
    expect(arena.get("fi").players.get("s1").nickname).toBe("ALICE");
    // Lähettää player_count -eventin
    expect(io.emits.some((e) => e.event === "public_player_count" && e.data.count === 1)).toBe(true);
  });

  it("addPlayer rejects when arena is full (64+)", () => {
    const pg = arena.get("fi");
    // Täytetään keinotekoisesti
    for (let i = 0; i < 64; i++) {
      pg.players.set(`s${i}`, { nickname: `p${i}`, score: 0, wordsFound: new Set() });
    }
    const socket = makeMockSocket("overflow");
    const ok = arena.addPlayer(socket, { nickname: "X", lang: "fi" });
    expect(ok).toBe(false);
    // Pelaajaa EI lisätty
    expect(arena.get("fi").players.has("overflow")).toBe(false);
    // Lähetti error-eventin pelaajalle
    expect(socket.emits.some((e) => e.event === "error")).toBe(true);
  });

  it("addPlayer emits public_waiting if state is waiting", () => {
    const socket = makeMockSocket();
    arena.addPlayer(socket, { nickname: "ALICE", lang: "fi" });
    expect(socket.emits.some((e) => e.event === "public_waiting")).toBe(true);
  });

  it("addPlayer emits public_join_midgame if state is playing", () => {
    const pg = arena.get("fi");
    pg.state = "playing";
    pg.grid = [["a"]];
    pg.validWordsList = ["a"];
    pg.timeLeft = 30;
    pg.roundNumber = 5;
    const socket = makeMockSocket();
    arena.addPlayer(socket, { nickname: "ALICE", lang: "fi" });
    const evt = socket.emits.find((e) => e.event === "public_join_midgame");
    expect(evt).toBeDefined();
    expect(evt.data.timeLeft).toBe(30);
    expect(evt.data.roundNumber).toBe(5);
  });

  it("handleWord ignores word when state isn't playing", () => {
    const socket = makeMockSocket();
    arena.addPlayer(socket, { nickname: "ALICE", lang: "fi" });
    socket.emits.length = 0;
    // state on yhä 'waiting'
    arena.handleWord(socket, "kissa");
    // Mitään word_result -eventtiä ei lähetetty
    expect(socket.emits.some((e) => e.event === "public_word_result")).toBe(false);
  });

  it("handleWord scores a valid word", () => {
    const pg = arena.get("fi");
    pg.state = "playing";
    pg.grid = [["a"]];
    pg.validWords = new Set(["kissa", "koira"]);
    pg.validWordsList = ["kissa", "koira"];

    const socket = makeMockSocket();
    arena.addPlayer(socket, { nickname: "ALICE", lang: "fi" });
    socket.emits.length = 0;
    io.emits.length = 0;

    arena.handleWord(socket, "kissa");
    const result = socket.emits.find((e) => e.event === "public_word_result");
    expect(result).toBeDefined();
    expect(result.data.valid).toBe(true);
    expect(result.data.points).toBeGreaterThan(0);

    const player = pg.players.get("s1");
    expect(player.wordsFound.has("kissa")).toBe(true);
    expect(player.score).toBeGreaterThan(0);
    // Pisteet broadcastattu kaikille arenassa
    expect(io.emits.some((e) => e.event === "public_score_update")).toBe(true);
  });

  it("handleWord rejects invalid word", () => {
    const pg = arena.get("fi");
    pg.state = "playing";
    pg.grid = [["a"]];
    pg.validWords = new Set(["kissa"]);
    pg.validWordsList = ["kissa"];

    const socket = makeMockSocket();
    arena.addPlayer(socket, { nickname: "ALICE", lang: "fi" });
    socket.emits.length = 0;

    arena.handleWord(socket, "xyz");
    const result = socket.emits.find((e) => e.event === "public_word_result");
    expect(result.data.valid).toBe(false);
    expect(result.data.message).toBe("Ei kelpaa");
  });

  it("handleWord rejects already-found word", () => {
    const pg = arena.get("fi");
    pg.state = "playing";
    pg.grid = [["a"]];
    pg.validWords = new Set(["kissa"]);
    pg.validWordsList = ["kissa"];

    const socket = makeMockSocket();
    arena.addPlayer(socket, { nickname: "ALICE", lang: "fi" });

    arena.handleWord(socket, "kissa"); // 1. kerta hyväksytty
    socket.emits.length = 0;
    arena.handleWord(socket, "kissa"); // 2. kerta hylätty

    const result = socket.emits.find((e) => e.event === "public_word_result");
    expect(result.data.valid).toBe(false);
    expect(result.data.message).toBe("Jo löydetty");
  });

  it("removePlayer removes from arena, emits updated count", () => {
    const socket = makeMockSocket();
    arena.addPlayer(socket, { nickname: "ALICE", lang: "fi" });
    io.emits.length = 0;

    const lang = arena.removePlayer(socket);
    expect(lang).toBe("fi");
    expect(arena.get("fi").players.size).toBe(0);
    expect(socket.joined.has("public_game_fi")).toBe(false);
    expect(io.emits.some((e) => e.event === "public_player_count" && e.data.count === 0)).toBe(true);
  });

  it("removePlayer returns null if socket isn't in any arena", () => {
    const socket = makeMockSocket("ghost");
    const result = arena.removePlayer(socket);
    expect(result).toBeNull();
  });

  it("totalPlayerCount sums across all langs", () => {
    const sf = makeMockSocket("a");
    const se = makeMockSocket("b");
    const sv = makeMockSocket("c");
    arena.addPlayer(sf, { nickname: "ALICE", lang: "fi" });
    arena.addPlayer(se, { nickname: "BOB", lang: "en" });
    arena.addPlayer(sv, { nickname: "ÅSE", lang: "sv" });
    expect(arena.totalPlayerCount()).toBe(3);
  });

  it("getPlayerForEmoji returns lang/nickname/room", () => {
    const socket = makeMockSocket();
    arena.addPlayer(socket, { nickname: "ALICE", lang: "fi" });
    const info = arena.getPlayerForEmoji("s1");
    expect(info).toEqual({
      lang: "fi",
      nickname: "ALICE",
      room: "public_game_fi",
    });
  });

  it("getPlayerForEmoji returns null for unknown socket", () => {
    expect(arena.getPlayerForEmoji("nobody")).toBeNull();
  });
});
