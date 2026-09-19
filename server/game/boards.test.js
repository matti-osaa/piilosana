import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { SHAPES, getBoard, makeBoardGrid, findWordsOnBoard, gridFitsBoard } from "./boards.js";
import { hexNeighbors } from "./hex.js";
import { canTraceWord } from "./validate.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("boards", () => {
  it("client- ja server-kopio ovat identtiset", () => {
    const a = readFileSync(join(here, "boards.js"), "utf8");
    const b = readFileSync(join(here, "../../client/src/boards.js"), "utf8");
    expect(a).toBe(b);
  });

  it("jokaisella muodolla on järkevä lauta ja symmetriset naapurit", () => {
    for (const shape of SHAPES) {
      const b = getBoard(shape);
      expect(b.cells.length).toBeGreaterThanOrEqual(25);
      for (const cell of b.cells) {
        const ns = b.neighborsOf(cell.r, cell.c);
        expect(ns.length).toBeGreaterThanOrEqual(2);
        for (const n of ns) expect(b.isAdjacent(n, cell)).toBe(true);
        expect(b.cellAtPoint(cell.cx, cell.cy)).toBe(cell);
      }
    }
  });

  it("kuusikulmiolauta vastaa vanhaa hexNeighbors-logiikkaa", () => {
    const b = getBoard("hex");
    for (const cell of b.cells) {
      const a = b.neighborsOf(cell.r, cell.c).map((n) => `${n.r},${n.c}`).sort();
      const e = hexNeighbors(cell.r, cell.c, 7, 5).map((n) => `${n.r},${n.c}`).sort();
      expect(a).toEqual(e);
    }
  });

  it("naapurimäärät: neliö 8, vinoneliö 8, kolmio 12, viisikulmio 7, tähti 8", () => {
    const max = (s) => Math.max(...getBoard(s).cells.map((c) => getBoard(s).neighborsOf(c.r, c.c).length));
    expect(max("square")).toBe(8);
    expect(max("diamond")).toBe(8);
    expect(max("triangle")).toBe(12);
    expect(max("pentagon")).toBe(7);
    expect(max("star")).toBe(8);
    expect(max("hex")).toBe(6);
  });

  it("sanahaku ja canTraceWord toimivat eripituisilla riveillä", () => {
    const grid = makeBoardGrid("star", () => "x");
    expect(gridFitsBoard(grid, getBoard("star"))).toBe(true);
    // tähti (0,0) – kahdeksankulmio (1,0) – tähti (2,1) koskettavat ketjuna
    grid[0][0] = "k"; grid[1][0] = "o"; grid[2][1] = "e";
    const trie = { c: { k: { c: { o: { c: { e: { c: {}, w: true } } } } } } };
    expect([...findWordsOnBoard(grid, trie, "star")]).toEqual(["koe"]);
    expect(canTraceWord(grid, "koe", "star")).toBe(true);
    expect(canTraceWord(grid, "keo", "star")).toBe(false);
  });
});
