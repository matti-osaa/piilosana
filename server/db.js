// db.js — DB-elinkaari ja yhteiset query-helpers.
//
// Tukee KAHTA driveria saman julkisen rajapinnan takana:
//
//   - sql.js (oletus): in-process SQLite, koko DB muistissa, levylle
//     serialisoituna /data/piilosana.db. Häviää käytännössä restartissa
//     jos volume puuttuu, eikä mahdollista nollakatkodeplyä.
//
//   - Postgres: jos env-muuttuja DATABASE_URL on asetettu, käytetään
//     pg-poolia. Kestää restartteja, mahdollistaa rinnakkaiset prosessit
//     ja siten nollakatkon.
//
// Migraatio sql.js → Postgres tehdään skriptillä scripts/migrate-to-postgres.mjs.
// Skripti ottaa nykyisen piilosana.db:n datan ja insertoi sen Postgresiin.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";
import pg from "pg";

import { isLangValid } from "./words.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const DATABASE_URL = process.env.DATABASE_URL;
const USE_PG = !!DATABASE_URL;

const DB_DIR = process.env.DB_PATH || (existsSync("/data") ? "/data" : REPO_ROOT);
const DB_PATH = join(DB_DIR, "piilosana.db");

let sqliteDb = null;
let pgPool = null;

export const HOF_CATEGORIES = [
  { gameMode: "normal", gameTime: 120, label: "Normaali 2 min" },
  { gameMode: "normal", gameTime: 402, label: "Normaali 6,7 min" },
  { gameMode: "tetris", gameTime: 120, label: "Tetris 2 min" },
  { gameMode: "tetris", gameTime: 402, label: "Tetris 6,7 min" },
];

// ============================================================================
// PUBLIC API
// ============================================================================

export async function initDb() {
  if (USE_PG) {
    return await initPgDb();
  }
  return await initSqliteDb();
}

export function saveDb() {
  // pg-versio kirjoittaa heti — saveDb on no-op
  if (USE_PG) return;
  if (!sqliteDb) return;
  const data = sqliteDb.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

export function getDb() {
  return USE_PG ? pgPool : sqliteDb;
}

export function isUsingPostgres() {
  return USE_PG;
}

// ============================================================================
// SQLite (sql.js) implementation
// ============================================================================

async function initSqliteDb() {
  const SQL = await initSqlJs();
  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH);
    sqliteDb = new SQL.Database(fileBuffer);
    console.log(`SQLite database loaded from ${DB_PATH} (${fileBuffer.length} bytes)`);
  } else {
    sqliteDb = new SQL.Database();
    console.log(`New SQLite database created at ${DB_PATH}`);
  }

  sqliteDb.run(`
    CREATE TABLE IF NOT EXISTS hall_of_fame (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL,
      score INTEGER NOT NULL,
      words_found INTEGER NOT NULL,
      words_total INTEGER NOT NULL,
      percentage REAL NOT NULL,
      game_mode TEXT NOT NULL,
      game_time INTEGER NOT NULL,
      is_multi INTEGER NOT NULL DEFAULT 0,
      lang TEXT NOT NULL DEFAULT 'fi',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  try { sqliteDb.run(`ALTER TABLE hall_of_fame ADD COLUMN lang TEXT NOT NULL DEFAULT 'fi'`); } catch (e) {}

  sqliteDb.run(`
    CREATE TABLE IF NOT EXISTS daily_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_number INTEGER NOT NULL,
      nickname TEXT NOT NULL COLLATE NOCASE,
      score INTEGER NOT NULL,
      words_found INTEGER NOT NULL,
      words_total INTEGER NOT NULL,
      percentage REAL NOT NULL,
      lang TEXT NOT NULL DEFAULT 'fi',
      year INTEGER NOT NULL,
      date_str TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(day_number, nickname, lang)
    )
  `);

  sqliteDb.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  try { sqliteDb.run(`ALTER TABLE hall_of_fame ADD COLUMN user_id INTEGER`); } catch (e) {}
  try { sqliteDb.run(`ALTER TABLE users ADD COLUMN settings TEXT`); } catch (e) {}
  try { sqliteDb.run(`ALTER TABLE users ADD COLUMN achievements TEXT`); } catch (e) {}
  try { sqliteDb.run(`ALTER TABLE users ADD COLUMN google_id TEXT`); } catch (e) {}

  saveDb();
  return sqliteDb;
}

// ============================================================================
// Postgres (pg) implementation
// ============================================================================

async function initPgDb() {
  pgPool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
  });

  // Test connection
  const client = await pgPool.connect();
  try {
    const r = await client.query("SELECT NOW() as now");
    console.log(`Postgres connected, server time: ${r.rows[0].now}`);
  } finally {
    client.release();
  }

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS hall_of_fame (
      id SERIAL PRIMARY KEY,
      nickname TEXT NOT NULL,
      score INTEGER NOT NULL,
      words_found INTEGER NOT NULL,
      words_total INTEGER NOT NULL,
      percentage REAL NOT NULL,
      game_mode TEXT NOT NULL,
      game_time INTEGER NOT NULL,
      is_multi INTEGER NOT NULL DEFAULT 0,
      lang TEXT NOT NULL DEFAULT 'fi',
      user_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS daily_scores (
      id SERIAL PRIMARY KEY,
      day_number INTEGER NOT NULL,
      nickname TEXT NOT NULL,
      score INTEGER NOT NULL,
      words_found INTEGER NOT NULL,
      words_total INTEGER NOT NULL,
      percentage REAL NOT NULL,
      lang TEXT NOT NULL DEFAULT 'fi',
      year INTEGER NOT NULL,
      date_str TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(day_number, nickname, lang)
    )
  `);
  // Case-insensitive nickname uniqueness via index
  await pgPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS daily_scores_nickname_lower_idx
    ON daily_scores (day_number, lower(nickname), lang)
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      nickname TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT,
      settings TEXT,
      achievements TEXT,
      google_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pgPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_nickname_lower_idx
    ON users (lower(nickname))
  `);

  console.log("Postgres schema ready");
  return pgPool;
}

// ============================================================================
// Hall of Fame queries (driver-aware)
// ============================================================================

export async function submitScore({ nickname, score, wordsFound, wordsTotal, gameMode, gameTime, isMulti, lang }) {
  if (!nickname || score < 0 || !gameMode || !gameTime) return null;
  if (gameTime === 0) return null;
  const safeLang = isLangValid(lang) ? lang : "fi";
  const percentage = wordsTotal > 0 ? Math.round((wordsFound / wordsTotal) * 100) : 0;

  if (USE_PG) {
    await pgPool.query(
      `INSERT INTO hall_of_fame (nickname, score, words_found, words_total, percentage, game_mode, game_time, is_multi, lang)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [nickname, score, wordsFound, wordsTotal, percentage, gameMode, Number(gameTime), isMulti ? 1 : 0, safeLang]
    );
  } else {
    if (!sqliteDb) return null;
    sqliteDb.run(
      `INSERT INTO hall_of_fame (nickname, score, words_found, words_total, percentage, game_mode, game_time, is_multi, lang)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nickname, score, wordsFound, wordsTotal, percentage, gameMode, Number(gameTime), isMulti ? 1 : 0, safeLang]
    );
    saveDb();
  }
  return true;
}

export async function getHallOfFame(gameMode, gameTime, lang) {
  const safeLang = lang || "fi";
  if (USE_PG) {
    const r = await pgPool.query(
      `SELECT nickname, score, words_found, words_total, percentage, created_at
       FROM hall_of_fame WHERE game_mode = $1 AND game_time = $2 AND lang = $3
       ORDER BY score DESC LIMIT 10`,
      [gameMode, Number(gameTime), safeLang]
    );
    return r.rows;
  }
  if (!sqliteDb) return [];
  const stmt = sqliteDb.prepare(
    `SELECT nickname, score, words_found, words_total, percentage, created_at
     FROM hall_of_fame WHERE game_mode = ? AND game_time = ? AND lang = ?
     ORDER BY score DESC LIMIT 10`
  );
  stmt.bind([gameMode, Number(gameTime), safeLang]);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

export async function getAllHallOfFame(lang) {
  const safeLang = lang || "fi";
  const result = {};
  for (const cat of HOF_CATEGORIES) {
    result[`${cat.gameMode}-${cat.gameTime}`] = {
      label: cat.label,
      scores: await getHallOfFame(cat.gameMode, cat.gameTime, safeLang),
    };
  }
  return result;
}

// ============================================================================
// Daily leaderboard (driver-aware)
// ============================================================================

export async function submitDailyScore({ nickname, score, wordsFound, wordsTotal, dateStr, lang }) {
  if (!nickname || score < 0 || !dateStr) return null;
  const safeLang = isLangValid(lang) ? lang : "fi";
  const d = new Date(dateStr + "T00:00:00Z");
  const dayNumber = Math.floor((d - new Date(d.getUTCFullYear(), 0, 0)) / 86400000);
  const year = d.getUTCFullYear();
  const percentage = wordsTotal > 0 ? Math.round((wordsFound / wordsTotal) * 100) : 0;

  if (USE_PG) {
    await pgPool.query(
      `INSERT INTO daily_scores (day_number, nickname, score, words_found, words_total, percentage, lang, year, date_str)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (day_number, nickname, lang) DO UPDATE SET
         score = EXCLUDED.score,
         words_found = EXCLUDED.words_found,
         words_total = EXCLUDED.words_total,
         percentage = EXCLUDED.percentage,
         year = EXCLUDED.year,
         date_str = EXCLUDED.date_str`,
      [dayNumber, nickname, score, wordsFound, wordsTotal, percentage, safeLang, year, dateStr]
    );
  } else {
    if (!sqliteDb) return null;
    sqliteDb.run(
      `INSERT OR REPLACE INTO daily_scores (day_number, nickname, score, words_found, words_total, percentage, lang, year, date_str)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [dayNumber, nickname, score, wordsFound, wordsTotal, percentage, safeLang, year, dateStr]
    );
    saveDb();
  }
  return true;
}

export async function getDailyLeaderboard(dateStr, lang) {
  if (!dateStr) return [];
  const safeLang = lang || "fi";
  const d = new Date(dateStr + "T00:00:00Z");
  const dayNumber = Math.floor((d - new Date(d.getUTCFullYear(), 0, 0)) / 86400000);

  if (USE_PG) {
    const r = await pgPool.query(
      `SELECT nickname, score, words_found, words_total, percentage, created_at
       FROM daily_scores WHERE day_number = $1 AND lang = $2
       ORDER BY score DESC LIMIT 20`,
      [dayNumber, safeLang]
    );
    return r.rows;
  }
  if (!sqliteDb) return [];
  const stmt = sqliteDb.prepare(
    `SELECT nickname, score, words_found, words_total, percentage, created_at
     FROM daily_scores WHERE day_number = ? AND lang = ?
     ORDER BY score DESC LIMIT 20`
  );
  stmt.bind([dayNumber, safeLang]);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

// ============================================================================
// USER CRUD — kirjautuminen, rekisteröinti, asetukset, saavutukset
// ============================================================================

// Kaikki funktiot palauttavat täyden user-objektin tai null. Caller poimii
// mitä tarvitsee. Tukee sekä sql.js:ää että Postgresia.

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    nickname: row.nickname,
    password_hash: row.password_hash,
    email: row.email,
    settings: row.settings,
    achievements: row.achievements,
    google_id: row.google_id,
    created_at: row.created_at,
  };
}

export async function getUserByNickname(nickname) {
  if (!nickname) return null;
  if (USE_PG) {
    const r = await pgPool.query(
      "SELECT * FROM users WHERE lower(nickname) = lower($1) LIMIT 1",
      [nickname]
    );
    return rowToUser(r.rows[0]);
  }
  if (!sqliteDb) return null;
  const stmt = sqliteDb.prepare(
    "SELECT * FROM users WHERE nickname = ? COLLATE NOCASE LIMIT 1"
  );
  stmt.bind([nickname]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return rowToUser(row);
}

export async function getUserByEmail(email) {
  if (!email) return null;
  if (USE_PG) {
    const r = await pgPool.query(
      "SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1",
      [email]
    );
    return rowToUser(r.rows[0]);
  }
  if (!sqliteDb) return null;
  const stmt = sqliteDb.prepare(
    "SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1"
  );
  stmt.bind([email]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return rowToUser(row);
}

export async function getUserById(id) {
  if (id == null) return null;
  if (USE_PG) {
    const r = await pgPool.query("SELECT * FROM users WHERE id = $1", [id]);
    return rowToUser(r.rows[0]);
  }
  if (!sqliteDb) return null;
  const stmt = sqliteDb.prepare("SELECT * FROM users WHERE id = ?");
  stmt.bind([id]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return rowToUser(row);
}

export async function getUserByGoogleId(googleId) {
  if (!googleId) return null;
  if (USE_PG) {
    const r = await pgPool.query(
      "SELECT * FROM users WHERE google_id = $1 LIMIT 1",
      [googleId]
    );
    return rowToUser(r.rows[0]);
  }
  if (!sqliteDb) return null;
  const stmt = sqliteDb.prepare(
    "SELECT * FROM users WHERE google_id = ? LIMIT 1"
  );
  stmt.bind([googleId]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return rowToUser(row);
}

export async function createUser({ nickname, password_hash, email, google_id }) {
  if (!nickname || !password_hash) return null;
  if (USE_PG) {
    const r = await pgPool.query(
      `INSERT INTO users (nickname, password_hash, email, google_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [nickname, password_hash, email || null, google_id || null]
    );
    return r.rows[0].id;
  }
  if (!sqliteDb) return null;
  sqliteDb.run(
    `INSERT INTO users (nickname, password_hash, email, google_id) VALUES (?, ?, ?, ?)`,
    [nickname, password_hash, email || null, google_id || null]
  );
  // Hae juuri lisätty id
  const stmt = sqliteDb.prepare("SELECT last_insert_rowid() AS id");
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  saveDb();
  return row.id;
}

export async function updateUserPassword(id, password_hash) {
  if (id == null || !password_hash) return false;
  if (USE_PG) {
    await pgPool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [password_hash, id]);
    return true;
  }
  if (!sqliteDb) return false;
  sqliteDb.run("UPDATE users SET password_hash = ? WHERE id = ?", [password_hash, id]);
  saveDb();
  return true;
}

export async function updateUserSettings(id, settings) {
  if (id == null) return false;
  const json = JSON.stringify(settings || {});
  if (USE_PG) {
    await pgPool.query("UPDATE users SET settings = $1 WHERE id = $2", [json, id]);
    return true;
  }
  if (!sqliteDb) return false;
  sqliteDb.run("UPDATE users SET settings = ? WHERE id = ?", [json, id]);
  saveDb();
  return true;
}

export async function updateUserAchievements(id, achievements) {
  if (id == null) return false;
  const json = JSON.stringify(achievements || {});
  if (USE_PG) {
    await pgPool.query("UPDATE users SET achievements = $1 WHERE id = $2", [json, id]);
    return true;
  }
  if (!sqliteDb) return false;
  sqliteDb.run("UPDATE users SET achievements = ? WHERE id = ?", [json, id]);
  saveDb();
  return true;
}

export async function linkGoogleId(id, googleId) {
  if (id == null || !googleId) return false;
  if (USE_PG) {
    await pgPool.query("UPDATE users SET google_id = $1 WHERE id = $2", [googleId, id]);
    return true;
  }
  if (!sqliteDb) return false;
  sqliteDb.run("UPDATE users SET google_id = ? WHERE id = ?", [googleId, id]);
  saveDb();
  return true;
}

