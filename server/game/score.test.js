import { describe, it, expect } from "vitest";
import { getScoreForWord, getScoreForWordLength } from "./score.js";

describe("getScoreForWordLength", () => {
  it("palauttaa 0 alle 3 kirjaimen sanoille", () => {
    expect(getScoreForWordLength(0)).toBe(0);
    expect(getScoreForWordLength(1)).toBe(0);
    expect(getScoreForWordLength(2)).toBe(0);
  });

  it("palauttaa 1 pisteen 3-kirjaimisesta", () => {
    expect(getScoreForWordLength(3)).toBe(1);
  });

  it("palauttaa 2 pistettä 4-kirjaimisesta", () => {
    expect(getScoreForWordLength(4)).toBe(2);
  });

  it("palauttaa 4 pistettä 5-kirjaimisesta", () => {
    expect(getScoreForWordLength(5)).toBe(4);
  });

  it("palauttaa 6 pistettä 6-kirjaimisesta", () => {
    expect(getScoreForWordLength(6)).toBe(6);
  });

  it("palauttaa 10 pistettä 7-kirjaimisesta", () => {
    expect(getScoreForWordLength(7)).toBe(10);
  });

  it("palauttaa 14 pistettä 8+ kirjaimen sanoista", () => {
    expect(getScoreForWordLength(8)).toBe(14);
    expect(getScoreForWordLength(9)).toBe(14);
    expect(getScoreForWordLength(15)).toBe(14);
    expect(getScoreForWordLength(100)).toBe(14);
  });

  it("käyttäytyy pisteytyskaavan mukaan eksponentiaalisesti", () => {
    expect(getScoreForWordLength(4)).toBeGreaterThan(getScoreForWordLength(3));
    expect(getScoreForWordLength(5)).toBeGreaterThan(getScoreForWordLength(4));
    expect(getScoreForWordLength(7)).toBeGreaterThan(getScoreForWordLength(6));
  });
});

describe("getScoreForWord", () => {
  it("palauttaa pisteet sanan pituuden mukaan", () => {
    expect(getScoreForWord("kis")).toBe(1);
    expect(getScoreForWord("kala")).toBe(2);
    expect(getScoreForWord("talot")).toBe(4);
    expect(getScoreForWord("perhonen")).toBe(14);
  });

  it("palauttaa 0 ei-stringille", () => {
    expect(getScoreForWord(null)).toBe(0);
    expect(getScoreForWord(undefined)).toBe(0);
    expect(getScoreForWord(42)).toBe(0);
    expect(getScoreForWord({})).toBe(0);
  });

  it("palauttaa 0 tyhjälle stringille", () => {
    expect(getScoreForWord("")).toBe(0);
  });

  it("hyväksyy isot ja pienet kirjaimet samalla tavalla", () => {
    expect(getScoreForWord("KISSA")).toBe(getScoreForWord("kissa"));
  });
});
