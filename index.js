import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Resend } from 'resend';
import { OAuth2Client } from 'google-auth-library';
import { hexNeighbors } from "./server/game/hex.js";
import { GRID_SIZE, HEX_ROWS, HEX_COLS, makeGrid as makeGridPure } from "./server/game/grid.js";
import { findWords, findWordsHex } from "./server/game/validate.js";
import { initDb } from "./server/db.js";
import { LANGS, getLang, FULL_WORDS_BUF, hasWordInBuf, bufHasPrefix } from "./server/words.js";
import { attachScoresRoutes } from "./server/routes/scores.js";
import { attachGameRoutes } from "./server/routes/game.js";
import { attachAuthRoutes } from "./server/routes/auth.js";
import { attachAccountRoutes } from "./server/routes/account.js";
import { attachStaticRoutes, attachSpaCatchAll } from "./server/routes/static.js";
import { createPublicArenaManager } from "./server/realtime/publicArena.js";
import { createRoomManager } from "./server/realtime/rooms.js";
import { attachSocketHandlers } from "./server/realtime/socketHandlers.js";
import { requestId, accessLog, errorHandler } from "./server/middleware.js";

// Adapter: pure makeGrid ottaa letterWeights-objektin, mutta index.js:n
// generateGoodGrid käyttää lang-koodia. Kääritään se siksi tähän adapteriin.
function makeGrid(lang = 'fi', rows = GRID_SIZE, cols) {
  return makeGridPure(getLang(lang).letterWeights, rows, cols);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// App version – changes on every deploy (server restart)
const APP_VERSION = Date.now().toString(36);
console.log(`App version: ${APP_VERSION}`);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());
app.use(requestId);
app.use(accessLog);

// Serve static frontend (built by Vite into /dist)
app.use(express.static(join(__dirname, 'dist')));

const PORT = process.env.PORT || 3001;

// ============================================================================
// DATABASE (Hall of Fame) - using sql.js (pure JS, no native binaries)
// ============================================================================

// Use persistent volume path if available (e.g. Railway Volume at /data),
// fall back to local dir for development

// ============================================================================
// WORD LIST + TRIE (for server-side grid generation & validation)
// ============================================================================


function findLongWordsOnGrid(grid, buf, hex, minLen = 11, maxLen = 15) {
  if (!buf) return new Set();
  const rows = grid.length, cols = grid[0].length, found = new Set();
  function getNeighbors(r, c) {
    if (hex) return hexNeighbors(r, c, rows, cols);
    const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
    return dirs.map(([dr,dc]) => ({r:r+dr,c:c+dc})).filter(n => n.r>=0 && n.r<rows && n.c>=0 && n.c<cols);
  }
  function dfs(r, c, path, vis) {
    const np = path + grid[r][c];
    if (!bufHasPrefix(buf, np)) return;
    if (np.length >= minLen && hasWordInBuf(buf, np)) found.add(np);
    if (np.length >= maxLen) return;
    vis.add(r * cols + c);
    for (const n of getNeighbors(r, c)) {
      if (!vis.has(n.r * cols + n.c)) dfs(n.r, n.c, np, vis);
    }
    vis.delete(r * cols + c);
  }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      dfs(r, c, '', new Set());
  return found;
}

function generateGoodGrid(lang = 'fi', hex = false) {
  const trie = getLang(lang).trie;
  const wordFinder = hex ? findWordsHex : findWords;
  const threshold = hex ? 25 : 15;
  let bestGrid = null, bestWords = new Set();
  for (let i = 0; i < 30; i++) {
    const g = hex ? makeGrid(lang, HEX_ROWS, HEX_COLS) : makeGrid(lang, GRID_SIZE);
    const w = wordFinder(g, trie);
    if (w.size > bestWords.size) { bestGrid = g; bestWords = w; }
    if (w.size >= threshold) break;
  }
  // Find long words (11-15 chars) using full word list buffer
  if (lang === 'fi' && bestGrid && FULL_WORDS_BUF) {
    const longWords = findLongWordsOnGrid(bestGrid, FULL_WORDS_BUF, hex);
    for (const w of longWords) bestWords.add(w);
  }
  return { grid: bestGrid, validWords: bestWords };
}

// ============================================================================
// REALTIME – public arena + private rooms + socket handlers (moduulit)
// ============================================================================

const arena = createPublicArenaManager({ io, generateGoodGrid });
const roomMgr = createRoomManager({ io, getLang });

attachSocketHandlers(io, {
  arena,
  roomMgr,
  appVersion: APP_VERSION,
  validLangs: Object.keys(LANGS),
});


// ============================================================================
// HTTP ROUTES – staattiset/perus reitit ovat moduulissa server/routes/static.js
// ============================================================================

// isShuttingDown – graceful shutdown asettaa tämän true:ksi, /ready palauttaa 503
let isShuttingDown = false;



// ============================================================================
// AUTH / ACCOUNT – alustetaan integrointiriippuvuudet, reitit ovat moduuleissa
// (server/routes/auth.js ja server/routes/account.js).
// ============================================================================

// Resend (sähköposti) – RESEND_API_KEY env-muuttujasta. Jos puuttuu, jätetään null
// ja salasanan nollaus & tervetuloa-meilit menevät hiljaisesti pois käytöstä.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Google OAuth – GOOGLE_CLIENT_ID env-muuttujasta
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;



// Reittimoduulit (siirretty server/routes/-hakemistoon)
attachStaticRoutes(app, {
  getRoomsCount: () => roomMgr.size(),
  isShuttingDown: () => isShuttingDown,
});
attachScoresRoutes(app);
attachGameRoutes(app, {
  appVersion: APP_VERSION,
  googleClientId: GOOGLE_CLIENT_ID,
  getPublicGame: arena.get,
  publicGames: arena.games,
  findLongWordsOnGrid,
});
attachAuthRoutes(app, {
  resend,
  googleClient,
  googleClientId: GOOGLE_CLIENT_ID,
});
attachAccountRoutes(app);
// SPA catch-all – TÄYTYY olla viimeisenä kaikkien muiden reittien jälkeen
attachSpaCatchAll(app, join(__dirname, 'dist'));
// Virhe-handler – kaikkien reittien jälkeen, nappaa heitetyt poikkeukset
app.use(errorHandler);


// ============================================================================
// SERVER START
// ============================================================================


// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================
//
// Kun Railway tai Docker lähettää SIGTERM-signaalin (esim. uusi deploy):
// 1. Asetetaan isShuttingDown=true → /ready palauttaa 503 → load balancer
//    ohjaa uudet pyynnöt muualle (jos on muita replikoita)
// 2. Lähetetään socket-clienteille "server_draining" -event että he osaavat
//    odottaa tai uudelleenyhdistää
// 3. Suljetaan HTTP-palvelin (lopettaa ottamasta uusia yhteyksiä, mutta
//    sallii nykyisten päättyä siististi)
// 4. Maksimi 25 sek odotus, sitten pakotetaan sammuminen (Railway tappaa
//    prosessin 30 sek jälkeen joka tapauksessa)

function gracefulShutdown(signal) {
  console.log(`Received ${signal}, starting graceful shutdown...`);
  isShuttingDown = true;

  // Kerro client-puolelle että server on lähdössä
  try {
    io.emit('server_draining', { reason: signal });
  } catch (e) {
    console.error('Failed to emit server_draining:', e);
  }

  // Pakotettu timeout – jos kaikki ei ehtinyt, lopetetaan kuitenkin
  const forceTimer = setTimeout(() => {
    console.log('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 25_000);

  // Sulje socket.io ja HTTP-palvelin siististi
  io.close(() => {
    console.log('Socket.IO closed');
    httpServer.close(() => {
      console.log('HTTP server closed');
      clearTimeout(forceTimer);
      process.exit(0);
    });
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

initDb().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Piilosana server listening on port ${PORT}`);
    // Start always-on public arenas for all languages
    arena.startAll(Object.keys(LANGS));
    for (const lang of Object.keys(LANGS)) {
      console.log(`Public arena started for ${lang} (always-on)`);
    }
  });
}).catch(err => {
  console.error('Failed to init database:', err);
  process.exit(1);
});
