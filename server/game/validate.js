// Validate – sanan etsintä ja polun tarkistus ruudukolta.
//
// findWords/Hex käyvät trie:n kanssa kaikki polut ja keräävät kaikki
// sanat jotka voi muodostaa naapurussolujen ketjuilla.
// canTraceWord tarkistaa onko tietty sana piirrettävissä gridille
// (käytetään pitkien sanojen post-validointiin).

import { hexNeighbors } from "./hex.js";

const SQUARE_DIRS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [-1, 1], [1, -1], [1, 1],
];

function squareNeighbors(r, c, rows, cols) {
  return SQUARE_DIRS
    .map(([dr, dc]) => ({ r: r + dr, c: c + dc }))
    .filter((n) => n.r >= 0 && n.r < rows && n.c >= 0 && n.c < cols);
}

/**
 * Etsii kaikki sanat (>= 3 kirjainta) neliö-gridiltä trie:n avulla.
 */
export function findWords(grid, trie) {
  const sz = grid.length;
  const found = new Set();

  function dfs(r, c, node, path, vis) {
    const ch = grid[r][c];
    const nx = node.c[ch];
    if (!nx) return;
    const np = path + ch;
    if (nx.w && np.length >= 3) found.add(np);
    vis.add(r * sz + c);
    for (const [dr, dc] of SQUARE_DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < sz && nc >= 0 && nc < sz && !vis.has(nr * sz + nc)) {
        dfs(nr, nc, nx, np, vis);
      }
    }
    vis.delete(r * sz + c);
  }

  for (let r = 0; r < sz; r++) {
    for (let c = 0; c < sz; c++) {
      dfs(r, c, trie, "", new Set());
    }
  }
  return found;
}

/**
 * Etsii kaikki sanat hex-gridiltä.
 */
export function findWordsHex(grid, trie) {
  const rows = grid.length;
  const cols = grid[0].length;
  const found = new Set();

  function dfs(r, c, node, path, vis) {
    const ch = grid[r][c];
    const nx = node.c[ch];
    if (!nx) return;
    const np = path + ch;
    if (nx.w && np.length >= 3) found.add(np);
    vis.add(r * cols + c);
    for (const n of hexNeighbors(r, c, rows, cols)) {
      if (!vis.has(n.r * cols + n.c)) dfs(n.r, n.c, nx, np, vis);
    }
    vis.delete(r * cols + c);
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      dfs(r, c, trie, "", new Set());
    }
  }
  return found;
}

/**
 * Tarkistaa onko sana piirrettävissä ruudukolta (square tai hex).
 */
export function canTraceWord(grid, word, hex = false) {
  const rows = grid.length;
  const cols = grid[0].length;

  function neighbors(r, c) {
    return hex ? hexNeighbors(r, c, rows, cols) : squareNeighbors(r, c, rows, cols);
  }

  function dfs(idx, r, c, vis) {
    if (grid[r][c] !== word[idx]) return false;
    if (idx === word.length - 1) return true;
    vis.add(r * cols + c);
    for (const n of neighbors(r, c)) {
      if (!vis.has(n.r * cols + n.c) && dfs(idx + 1, n.r, n.c, vis)) return true;
    }
    vis.delete(r * cols + c);
    return false;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === word[0] && dfs(0, r, c, new Set())) return true;
    }
  }
  return false;
}
