import { describe, it, expect } from "vitest";
import { hexNeighbors } from "./hex.js";

describe("hexNeighbors", () => {
  it("palauttaa 6 naapuria keskellä ruudukkoa parillisella rivillä", () => {
    const ns = hexNeighbors(2, 2, 5, 5);
    expect(ns).toHaveLength(6);
  });

  it("palauttaa 6 naapuria keskellä ruudukkoa parittomalla rivillä", () => {
    const ns = hexNeighbors(3, 2, 5, 5);
    expect(ns).toHaveLength(6);
  });

  it("rajaa naapurit nurkan kohdalla (0,0)", () => {
    const ns = hexNeighbors(0, 0, 5, 5);
    // Vain 0,1 ja 1,0 ovat ruudukolla
    expect(ns.every(n => n.r >= 0 && n.c >= 0)).toBe(true);
    expect(ns.length).toBeLessThan(6);
  });

  it("rajaa naapurit oikeasta alanurkasta", () => {
    const ns = hexNeighbors(4, 4, 5, 5);
    expect(ns.every(n => n.r < 5 && n.c < 5)).toBe(true);
    expect(ns.length).toBeLessThan(6);
  });

  it("parilliset rivit käyttävät EVEN-suuntia, parittomat ODD-suuntia", () => {
    const evenN = hexNeighbors(2, 2, 7, 7);
    const oddN = hexNeighbors(3, 2, 7, 7);
    // Parillisella rivillä naapuri (-1,-1) on olemassa, parittomalla ei
    expect(evenN.some(n => n.r === 1 && n.c === 1)).toBe(true);
    expect(oddN.some(n => n.r === 2 && n.c === 1)).toBe(false);
  });
});
