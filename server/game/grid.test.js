import { describe, it, expect } from "vitest";
import { randLetter, makeGrid, GRID_SIZE, HEX_ROWS, HEX_COLS } from "./grid.js";

const FAKE_WEIGHTS = { a: 1, b: 1, c: 1 };

// Deterministinen "rng" jolla voi syöttää sekvenssin arvoja
function seq(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("randLetter", () => {
  it("palauttaa yhden kirjaimen taulukon avaimista", () => {
    const ch = randLetter(FAKE_WEIGHTS);
    expect(["a", "b", "c"]).toContain(ch);
  });

  it("käyttää annettua rng:tä deterministisesti", () => {
    // Kun rng palauttaa 0.0, valitsee ensimmäisen
    expect(randLetter(FAKE_WEIGHTS, () => 0)).toBe("a");
    // Kun rng palauttaa lähes 1, valitsee viimeisen
    expect(randLetter(FAKE_WEIGHTS, () => 0.99)).toBe("c");
  });

  it("respektoi painoja — isompi paino tulee useammin", () => {
    const heavy = { a: 99, b: 1 };
    let aCount = 0;
    const rng = seq([0.1, 0.3, 0.5, 0.7, 0.9, 0.99]);
    for (let i = 0; i < 6; i++) {
      if (randLetter(heavy, rng) === "a") aCount++;
    }
    // a on selvästi yleisempi
    expect(aCount).toBeGreaterThan(3);
  });
});

describe("makeGrid", () => {
  it("luo oikean kokoisen ruudukon (square)", () => {
    const g = makeGrid(FAKE_WEIGHTS, GRID_SIZE);
    expect(g).toHaveLength(GRID_SIZE);
    expect(g[0]).toHaveLength(GRID_SIZE);
  });

  it("luo eri kokoisen ruudukon kun cols annettu", () => {
    const g = makeGrid(FAKE_WEIGHTS, HEX_ROWS, HEX_COLS);
    expect(g).toHaveLength(HEX_ROWS);
    expect(g[0]).toHaveLength(HEX_COLS);
  });

  it("kaikki solut ovat avainjoukosta", () => {
    const g = makeGrid(FAKE_WEIGHTS, 5);
    for (const row of g) {
      for (const cell of row) {
        expect(["a", "b", "c"]).toContain(cell);
      }
    }
  });

  it("on deterministinen samalla rng-sekvenssillä", () => {
    const g1 = makeGrid(FAKE_WEIGHTS, 3, 3, seq([0.1, 0.5, 0.9]));
    const g2 = makeGrid(FAKE_WEIGHTS, 3, 3, seq([0.1, 0.5, 0.9]));
    expect(g1).toEqual(g2);
  });
});
