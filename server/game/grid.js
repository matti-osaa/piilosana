// Grid — ruudukon generointi annetuilla kirjaintaajuuksilla.
//
// Vakiot pelitiloille (square 5×5, hex 7×5).
// randLetter ja makeGrid ottavat valinnaisen rng-argumentin, jotta testit
// voivat injektoida deterministisen randomin.

export const GRID_SIZE = 5;
export const HEX_ROWS = 7;
export const HEX_COLS = 5;

/**
 * Valitsee yhden kirjaimen painotettuna.
 * @param {Object} letterWeights - { 'a': 120, 'i': 108, ... }
 * @param {() => number} rng - palauttaa luvun [0, 1), default Math.random
 */
export function randLetter(letterWeights, rng = Math.random) {
  const ls = Object.keys(letterWeights);
  const tot = Object.values(letterWeights).reduce((a, b) => a + b, 0);
  let r = rng() * tot;
  for (let i = 0; i < ls.length; i++) {
    r -= letterWeights[ls[i]];
    if (r <= 0) return ls[i];
  }
  return ls[ls.length - 1];
}

/**
 * Generoi kaksiulotteisen kirjainruudukon annetuilla painoilla.
 */
export function makeGrid(letterWeights, rows = GRID_SIZE, cols, rng = Math.random) {
  const c = cols || rows;
  return Array.from({ length: rows }, () =>
    Array.from({ length: c }, () => randLetter(letterWeights, rng))
  );
}
