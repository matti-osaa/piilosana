// Hex-ruudukon naapuruus — pelin pidemmissä tiloissa käytettävä geometria.
//
// Käytetään odd-r offset -kaavaa: parilliset rivit siirtyvät hieman
// vasemmalle, parittomat oikealle. Jokainen solu kuuluu kuusikulmioon
// jolla on 6 naapuria.

export const HEX_DIRS_EVEN = [
  [-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0],
];
export const HEX_DIRS_ODD = [
  [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1],
];

/**
 * Palauttaa annetun solun (r,c) lailliset hex-naapurit ruudukolla,
 * jonka koko on rows × cols.
 * @returns {Array<{r:number,c:number}>}
 */
export function hexNeighbors(r, c, rows, cols) {
  const dirs = r % 2 === 0 ? HEX_DIRS_EVEN : HEX_DIRS_ODD;
  return dirs
    .map(([dr, dc]) => ({ r: r + dr, c: c + dc }))
    .filter((n) => n.r >= 0 && n.r < rows && n.c >= 0 && n.c < cols);
}
