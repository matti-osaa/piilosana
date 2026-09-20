// Boards – pelilaudan muodot (neliö, kuusikulmio, kolmio, viisikulmio, tähti, vinoneliö).
//
// HUOM: tämä tiedosto on KAKSI kertaa repossa, identtisenä:
//   server/game/boards.js   (palvelin: ruudukon generointi + sanojen validointi)
//   client/src/boards.js    (selain: piirto, naapurit, sanahaku)
// Muokkaa toista ja kopioi toiseen – boards.test.js varmistaa että ne ovat samat.
//
// Jokainen lauta on lista soluja. Solulla on paikka kirjainruudukossa
// (r,c → grid[r][c]), monikulmio (poly, laudan omissa yksiköissä), painopiste
// (cx,cy) ja lineaarinen indeksi i. Rivit voivat olla eripituisia (rowLens).
//
// NAAPURISÄÄNTÖ on kaikilla laudoilla sama: kaksi ruutua ovat naapureita,
// jos ne koskettavat toisiaan – sivulla TAI kulmalla (= jakavat kärkipisteen).
//   neliö 8 · vinoneliö 8 · kuusikulmio 6 · kolmio 12 · viisikulmio 7 · tähti 6
//
// Viisikulmio = Kairon laatoitus (viisikulmiot täyttävät tason aukottomasti).
// Tähti = kuusisakaraiset, samankokoiset tähdet, jotka koskettavat toisiaan sakaroiden kärjistä.

export const SHAPES = ["hex", "square", "triangle", "pentagon", "star", "diamond"];

export function randomShape(rng = Math.random) {
  return SHAPES[Math.floor(rng() * SHAPES.length) % SHAPES.length];
}

export function isShape(s) {
  return typeof s === "string" && SHAPES.includes(s);
}

// ---------- geometria-apurit ----------

function centroid(poly) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = poly.length;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const vkey = (p) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;

// ---------- lautojen määrittelyt: palauttaa rivit [[poly,...],...] ----------

function squareRows() {
  const N = 5, rows = [];
  for (let r = 0; r < N; r++) {
    const row = [];
    for (let c = 0; c < N; c++) row.push([[c, r], [c + 1, r], [c + 1, r + 1], [c, r + 1]]);
    rows.push(row);
  }
  return rows;
}

function hexRows() {
  // pointy-top, odd-r offset – sama asettelu kuin hex.js:n hexNeighbors
  const R = 7, C = 5, w = 1, h = 2 / Math.sqrt(3), rows = [];
  for (let r = 0; r < R; r++) {
    const row = [];
    for (let c = 0; c < C; c++) {
      const cx = c * w + (r % 2 === 1 ? w / 2 : 0) + w / 2, cy = r * h * 0.75 + h / 2;
      row.push([[cx, cy - h / 2], [cx + w / 2, cy - h / 4], [cx + w / 2, cy + h / 4],
        [cx, cy + h / 2], [cx - w / 2, cy + h / 4], [cx - w / 2, cy - h / 4]]);
    }
    rows.push(row);
  }
  return rows;
}

function diamondRows() {
  const R = 9, C = 4, rows = [];
  for (let r = 0; r < R; r++) {
    const row = [];
    for (let c = 0; c < C; c++) {
      const cx = 1 + 2 * c + (r % 2 === 1 ? 1 : 0), cy = 1 + r;
      row.push([[cx, cy - 1], [cx + 1, cy], [cx, cy + 1], [cx - 1, cy]]);
    }
    rows.push(row);
  }
  return rows;
}

function triangleRows() {
  const R = 5, C = 7, h = Math.sqrt(3) / 2, rows = [];
  for (let r = 0; r < R; r++) {
    const row = [], y = r * h;
    for (let c = 0; c < C; c++) {
      const x = c * 0.5, up = (r + c) % 2 === 0;
      row.push(up ? [[x + 0.5, y], [x + 1, y + h], [x, y + h]] : [[x, y], [x + 1, y], [x + 0.5, y + h]]);
    }
    rows.push(row);
  }
  return rows;
}

function pentagonRows() {
  // Kairon laatoitus: neliöhilan (sivu 2) jokaista SISÄsärmää vastaa yksi viisikulmio.
  // Neliössä (i,j) on keskellä lyhyt jana: vaaka jos (i+j) parillinen, muuten pysty.
  const N = 4, M = 5, a = 0.55, rows = [];
  const horiz = (i, j) => (i + j) % 2 === 0;
  for (let j = 0; j < M; j++) {
    // pystysärmät neliörivillä j: x = 2i, i = 1..N-1
    const vrow = [];
    for (let i = 1; i < N; i++) {
      const X = 2 * i, y0 = 2 * j, y1 = 2 * j + 2, cy = 2 * j + 1;
      const Rc = 2 * i + 1, Lc = 2 * i - 1;
      const right = horiz(i, j) ? [[Rc - a, cy]] : [[Rc, cy - a], [Rc, cy + a]];
      const left = horiz(i - 1, j) ? [[Lc + a, cy]] : [[Lc, cy + a], [Lc, cy - a]];
      vrow.push([[X, y0], ...right, [X, y1], ...left]);
    }
    rows.push(vrow);
    if (j < M - 1) {
      // vaakasärmät y = 2(j+1), i = 0..N-1
      const hrow = [];
      for (let i = 0; i < N; i++) {
        const Y = 2 * (j + 1), x0 = 2 * i, x1 = 2 * i + 2, cx = 2 * i + 1;
        const Tc = 2 * j + 1, Bc = 2 * j + 3;
        const top = horiz(i, j) ? [[cx - a, Tc], [cx + a, Tc]] : [[cx, Tc + a]];
        const bottom = horiz(i, j + 1) ? [[cx + a, Bc], [cx - a, Bc]] : [[cx, Bc - a]];
        hrow.push([[x0, Y], ...top, [x1, Y], ...bottom]);
      }
      rows.push(hrow);
    }
  }
  return rows;
}

function starRows() {
  // Kuusisakaraiset tähdet kolmiohilassa (odd-r offset kuten kuusikulmiolaudassa).
  // Sakarat osoittavat suoraan naapureihin ja koskettavat niitä kärjistään,
  // joten sääntö on: tähdet ovat naapureita, jos niiden sakarat koskettavat (6 naapuria).
  // Kaikki ruudut ovat samankokoisia; sakaroiden väliin jäävät aukot ovat tyhjää.
  const R = 6, C = 5, rad = 1, inner = rad * 0.72, rows = []; // paksu runko: kirjaimelle tilaa, sakarat lyhyet
  for (let r = 0; r < R; r++) {
    const row = [];
    for (let c = 0; c < C; c++) {
      const cx = rad + 2 * rad * c + (r % 2 === 1 ? rad : 0), cy = rad + r * rad * Math.sqrt(3);
      const poly = [];
      for (let k = 0; k < 12; k++) {
        const ang = (k * Math.PI) / 6, d = k % 2 === 0 ? rad : inner;
        poly.push([cx + d * Math.cos(ang), cy + d * Math.sin(ang)]);
      }
      row.push(poly);
    }
    rows.push(row);
  }
  return rows;
}

// Kirjaimen koon kerroin: tähden runko on leveämpi kuin sen sisäympyrä antaa ymmärtää.
const FONT_BOOST = { star: 1.15 };

const BUILDERS = {
  hex: hexRows, square: squareRows, diamond: diamondRows,
  triangle: triangleRows, pentagon: pentagonRows, star: starRows,
};

// ---------- laudan rakennus ----------

const cache = new Map();

export function getBoard(shape) {
  if (!BUILDERS[shape]) return null;
  if (cache.has(shape)) return cache.get(shape);
  const polyRows = BUILDERS[shape]();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const row of polyRows) for (const poly of row) for (const [x, y] of poly) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const cells = [], byRC = [], vmap = new Map();
  polyRows.forEach((row, r) => {
    byRC.push([]);
    row.forEach((p, c) => {
      const poly = p.map(([x, y]) => [x - minX, y - minY]);
      const [cx, cy] = centroid(poly);
      const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]);
      const cell = {
        i: cells.length, r, c, poly, cx, cy,
        x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys),
        sides: poly.length,
      };
      cells.push(cell); byRC[r].push(cell);
      for (const q of poly) { const k = vkey(q); if (!vmap.has(k)) vmap.set(k, []); vmap.get(k).push(cell.i); }
    });
  });
  const nsets = cells.map(() => new Set());
  for (const list of vmap.values()) for (const a of list) for (const b of list) if (a !== b) nsets[a].add(b);
  const neighbors = nsets.map((s) => [...s].sort((a, b) => a - b).map((i) => ({ r: cells[i].r, c: cells[i].c })));
  const board = {
    shape, W: maxX - minX, H: maxY - minY, cells, byRC, fontBoost: FONT_BOOST[shape] || 1,
    rowLens: polyRows.map((row) => row.length),
    maxCols: Math.max(...polyRows.map((row) => row.length)),
    neighborsOf: (r, c) => (byRC[r] && byRC[r][c] ? neighbors[byRC[r][c].i] : []),
    isAdjacent: (a, b) => !!(byRC[a.r] && byRC[a.r][a.c]) && neighbors[byRC[a.r][a.c].i].some((n) => n.r === b.r && n.c === b.c),
    cellAtPoint: (x, y) => {
      for (const cell of cells) {
        if (x < cell.x0 || x > cell.x1 || y < cell.y0 || y > cell.y1) continue;
        if (pointInPoly(x, y, cell.poly)) return cell;
      }
      return null;
    },
  };
  cache.set(shape, board);
  return board;
}

// Sopiiko ruudukko laudan mittoihin (rivien pituudet)?
export function gridFitsBoard(grid, board) {
  return !!board && Array.isArray(grid) && grid.length === board.rowLens.length
    && grid.every((row, r) => Array.isArray(row) && row.length === board.rowLens[r]);
}

// Kirjainruudukko laudalle; randLetter = () => kirjain
export function makeBoardGrid(shape, randLetter) {
  const board = getBoard(shape);
  return board.rowLens.map((len) => Array.from({ length: len }, () => randLetter()));
}

// Kaikki sanat (≥3 kirjainta) laudalta trie-rakenteella { c: {kirjain: solmu}, w: bool }
export function findWordsOnBoard(grid, trie, shape) {
  const board = getBoard(shape), found = new Set();
  if (!gridFitsBoard(grid, board)) return found;
  const vis = new Uint8Array(board.cells.length);
  function dfs(cell, node, path) {
    const nx = node.c[grid[cell.r][cell.c]];
    if (!nx) return;
    const np = path + grid[cell.r][cell.c];
    if (nx.w && np.length >= 3) found.add(np);
    vis[cell.i] = 1;
    for (const n of board.neighborsOf(cell.r, cell.c)) {
      const nc = board.byRC[n.r][n.c];
      if (!vis[nc.i]) dfs(nc, nx, np);
    }
    vis[cell.i] = 0;
  }
  for (const cell of board.cells) dfs(cell, trie, "");
  return found;
}
