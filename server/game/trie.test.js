import { describe, it, expect } from "vitest";
import { TrieNode, buildTrie } from "./trie.js";

describe("buildTrie", () => {
  it("luo tyhjän juurisolmun tyhjälle sanalistalle", () => {
    const t = buildTrie([]);
    expect(t).toBeInstanceOf(TrieNode);
    expect(Object.keys(t.c)).toHaveLength(0);
    expect(t.w).toBe(false);
  });

  it("merkitsee sanan loppusolmun w=true", () => {
    const t = buildTrie(["kissa"]);
    let n = t;
    for (const ch of "kissa") n = n.c[ch];
    expect(n.w).toBe(true);
  });

  it("jakaa yhteisen prefiksin", () => {
    const t = buildTrie(["kissa", "kissan"]);
    let n = t;
    for (const ch of "kissa") n = n.c[ch];
    expect(n.w).toBe(true);
    expect(n.c["n"]).toBeDefined();
    expect(n.c["n"].w).toBe(true);
  });

  it("ei merkitse välimuotoja sanoiksi", () => {
    const t = buildTrie(["kissa"]);
    let n = t;
    for (const ch of "kis") n = n.c[ch];
    expect(n.w).toBe(false);
  });
});
