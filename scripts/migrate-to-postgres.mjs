// Migraatio sql.js → Postgres.
//
// Käyttö:
//   1. Aseta DATABASE_URL ympäristöön (esim. Railway:n Postgres-add-onin URL)
//   2. Kopioi nykyinen piilosana.db tähän hakemistoon (tai aseta DB_PATH)
//   3. Aja: node scripts/migrate-to-postgres.mjs
//
// Skripti:
//   - Lukee paikallisen piilosana.db:n sql.js:llä
//   - Yhdistää Postgresiin
//   - Luo skeeman jos puuttuu
//   - Insertoi kaikki rivit hall_of_fame, daily_scores, users -tauluista
//   - Tarkistaa rivimäärät onnistumisen merkiksi
//
// Skripti on idempotent — jos ajat sen kahdesti, daily_scores käyttää
// ON CONFLICT DO NOTHING:ia, joten rivit eivät duplikoidu.
// hall_of_fame ja users ovat kuitenkin INSERT -only, joten varo: jos
// ajat sen kahdesti, hall_of_fame -taulu duplikoituu. Tyhjennä se
// tarvittaessa: `TRUNCATE hall_of_fame`.

import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable required");
  process.exit(1);
}

const DB_DIR = process.env.DB_PATH || (existsSync("/data") ? "/data" : REPO_ROOT);
const DB_PATH = join(DB_DIR, "piilosana.db");

if (!existsSync(DB_PATH)) {
  console.error(`Source database not found at ${DB_PATH}`);
  process.exit(1);
}

console.log(`Source DB: ${DB_PATH}`);
console.log(`Target Postgres: ${DATABASE_URL.replace(/:[^:@]+@/, ":***@")}`);
console.log("");

// ===== Load source SQLite =====

const SQL = await initSqlJs();
const fileBuffer = readFileSync(DB_PATH);
const sqliteDb = new SQL.Database(fileBuffer);
console.log(`Loaded SQLite (${fileBuffer.length} bytes)`);

function readAll(table) {
  const stmt = sqliteDb.prepare(`SELECT * FROM ${table}`);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

const hofRows = readAll("hall_of_fame");
const dailyRows = readAll("daily_scores");
const userRows = readAll("users");

console.log(`Source counts: hall_of_fame=${hofRows.length}, daily_scores=${dailyRows.length}, users=${userRows.length}`);
console.log("");

// ===== Connect to Postgres =====

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
});

const r = await pool.query("SELECT NOW() as now");
console.log(`Postgres connected, server time: ${r.rows[0].now}`);

// ===== Create schema =====

await pool.query(`
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

await pool.query(`
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
await pool.query(`
  CREATE UNIQUE INDEX IF NOT EXISTS daily_scores_nickname_lower_idx
  ON daily_scores (day_number, lower(nickname), lang)
`);

await pool.query(`
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
await pool.query(`
  CREATE UNIQUE INDEX IF NOT EXISTS users_nickname_lower_idx
  ON users (lower(nickname))
`);

console.log("Schema ready");
console.log("");

// ===== Insert hall_of_fame =====

console.log(`Inserting ${hofRows.length} hall_of_fame rows...`);
let hofInserted = 0;
for (const row of hofRows) {
  await pool.query(
    `INSERT INTO hall_of_fame (nickname, score, words_found, words_total, percentage, game_mode, game_time, is_multi, lang, user_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      row.nickname,
      row.score,
      row.words_found,
      row.words_total,
      row.percentage,
      row.game_mode,
      row.game_time,
      row.is_multi || 0,
      row.lang || "fi",
      row.user_id || null,
      row.created_at || new Date().toISOString(),
    ]
  );
  hofInserted++;
}
console.log(`  ✓ inserted ${hofInserted} rows`);

// ===== Insert daily_scores =====

console.log(`Inserting ${dailyRows.length} daily_scores rows...`);
let dailyInserted = 0;
for (const row of dailyRows) {
  await pool.query(
    `INSERT INTO daily_scores (day_number, nickname, score, words_found, words_total, percentage, lang, year, date_str, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (day_number, nickname, lang) DO NOTHING`,
    [
      row.day_number,
      row.nickname,
      row.score,
      row.words_found,
      row.words_total,
      row.percentage,
      row.lang || "fi",
      row.year,
      row.date_str,
      row.created_at || new Date().toISOString(),
    ]
  );
  dailyInserted++;
}
console.log(`  ✓ inserted (or skipped on conflict) ${dailyInserted} rows`);

// ===== Insert users =====

console.log(`Inserting ${userRows.length} users rows...`);
let userInserted = 0;
for (const row of userRows) {
  await pool.query(
    `INSERT INTO users (nickname, password_hash, email, settings, achievements, google_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      row.nickname,
      row.password_hash,
      row.email || null,
      row.settings || null,
      row.achievements || null,
      row.google_id || null,
      row.created_at || new Date().toISOString(),
    ]
  );
  userInserted++;
}
console.log(`  ✓ inserted ${userInserted} rows`);

// ===== Verify =====

console.log("");
console.log("Verifying counts...");
const hofCount = await pool.query("SELECT COUNT(*) FROM hall_of_fame");
const dailyCount = await pool.query("SELECT COUNT(*) FROM daily_scores");
const userCount = await pool.query("SELECT COUNT(*) FROM users");
console.log(`  Postgres: hall_of_fame=${hofCount.rows[0].count}, daily_scores=${dailyCount.rows[0].count}, users=${userCount.rows[0].count}`);

await pool.end();
console.log("");
console.log("✓ Migration complete. Set DATABASE_URL on Railway to switch traffic to Postgres.");
