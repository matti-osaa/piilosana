import { describe, it, expect } from "vitest";
import { buildTrie } from "./trie.js";
import { findWords, findWordsHex, canTraceWord } from "./validate.js";

describe("findWords (square)", () => {
  it("löytää yksinkertaiset sanat 3×3-gridiltä", () => {
    const grid = [
      ["k", "i", "s"],
      ["a", "s", "a"],
      ["t", "o", "n"],
    ];
    const trie = buildTrie(["kissa", "kis", "tonni"]);
    const found = findWords(grid, trie);
    expect(found.has("kissa")).toBe(true);
    expect(found.has("kis")).toBe(true);
  });

  it("ei salli saman solun käyttöä kahdesti samassa polussa", () => {
    const grid = [
      ["a", "a", "a"],
      ["a", "a", "a"],
      ["a", "a", "a"],
    ];
    // Sana "aaaaaaaaaa" tarvitsisi 10 a:ta – gridissä on vain 9
    const trie = buildTrie(["aaaaaaaaaa"]);
    const found = findWords(grid, trie);
    expect(found.has("aaaaaaaaaa")).toBe(false);
  });

  it("hylkää alle 3 kirjaimen sanat", () => {
    const grid = [
      ["k", "i"],
      ["s", "a"],
    ];
    const trie = buildTrie(["ki", "sa"]);
    const found = findWords(grid, trie);
    expect(found.size).toBe(0);
  });
});

describe("findWordsHex", () => {
  it("löytää sanan hex-gridiltä", () => {
    // 3×3 hex grid jossa sana "kis" muodostuu naapurussoluista
    const grid = [
      ["k", "i", "x"],
      ["s", "x", "x"],
      ["x", "x", "x"],
    ];
    const trie = buildTrie(["kis"]);
    const found = findWordsHex(grid, trie);
    expect(found.has("kis")).toBe(true);
  });
});

describe("canTraceWord (square)", () => {
  const grid = [
    ["k", "i", "s"],
    ["a", "s", "a"],
    ["t", "o", "n"],
  ];

  it("palauttaa true sanalle joka on naapuripolulla", () => {
    expect(canTraceWord(grid, "kissa")).toBe(true);
  });

  it("palauttaa false sanalle jota ei voi piirtää", () => {
    expect(canTraceWord(grid, "xyz")).toBe(false);
  });

  it("ei salli saman solun käyttöä kahdesti", () => {
    // 'kk' vaatisi saman k-solun kahdesti
    expect(canTraceWord(grid, "kk")).toBe(false);
  });

  it("toimii hex-tilassa", () => {
    const hexGrid = [
      ["a", "b", "c"],
      ["d", "e", "f"],
      ["g", "h", "i"],
    ];
    expect(canTraceWord(hexGrid, "abc", true)).toBe(true);
  });
});
