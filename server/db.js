// db.js — sql.js DB:n elinkaari ja yhteiset query-helpers.
//
// Pitää sisäistä db-instanssia. Index.js kutsuu ensin initDb()
// ja muut moduulit voivat sitten kutsua get/submit-funktioita.
//
// HUOM: tämä on stateful module — yksi prosessi, yksi db. Jos joskus
// siirrytään Postgresiin (ks. ARKKITEHTUURI_ARVIO.md vaihe 3), korvataan
// tämän moduulin sisäosa pg-pool:lla mutta exportit pysyvät samat.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";
import { isLangValid } from "./words.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const DB_DIR = process.env.DB_PATH || (existsSync("/data") ? "/data" : REPO_ROOT);
const DB_PATH = join(DB_DIR, "piilosana.db");

let db = null;

export const HOF_CATEGORIES = [
  { gameMode: "normal", gameTime: 120, label: "Normaali 2 min" },
  { gameMode: "normal", gameTime: 402, label: "Normaali 6,7 min" },
  { gameMode: "tetris", gameTime: 120, label: "Tetris 2 min" },
  { gameMode: "tetris", gameTime: 402, label: "Tetris 6,7 min" },
];

export async function initDb() {
  const SQL = await initSqlJs();
  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log(`Database loaded from ${DB_PATH} (${fileBuffer.length} bytes)`);
  } else {
    db = new SQL.Database();
    console.log(`New database created at ${DB_PATH}`);
  }

  db.run(`
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
  try { db.run(`ALTER TABLE hall_of_fame ADD COLUMN lang TEXT NOT NULL DEFAULT 'fi'`); } catch (e) { /* exists */ }

  db.run(`
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

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  try { db.run(`ALTER TABLE hall_of_fame ADD COLUMN user_id INTEGER`); } catch (e) { /* exists */ }
  try { db.run(`ALTER TABLE users ADD COLUMN settings TEXT`); } catch (e) { /* exists */ }
  try { db.run(`ALTER TABLE users ADD COLUMN achievements TEXT`); } catch (e) { /* exists */ }
  try { db.run(`ALTER TABLE users ADD COLUMN google_id TEXT`); } catch (e) { /* exists */ }

  saveDb();
  return db;
}

export function saveDb() {
  if (!db) return;
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

export function getDb() {
  return db;
}

// ===== Hall of Fame =====

export function submitScore({ nickname, score, wordsFound, wordsTotal, gameMode, gameTime, isMulti, lang }) {
  if (!db || !nickname || score < 0 || !gameMode || !gameTime) return null;
  if (gameTime === 0) return null;
  const safeLang = isLangValid(lang) ? lang : "fi";
  const percentage = wordsTotal > 0 ? Math.round((wordsFound / wordsTotal) * 100) : 0;
  db.run(
    `INSERT INTO hall_of_fame (nickname, score, words_found, words_total, percentage, game_mode, game_time, is_multi, lang)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [nickname, score, wordsFound, wordsTotal, percentage, gameMode, Number(gameTime), isMulti ? 1 : 0, safeLang]
  );
  saveDb();
  return true;
}

export function getHallOfFame(gameMode, gameTime, lang) {
  if (!db) return [];
  const safeLang = lang || "fi";
  const stmt = db.prepare(
    `SELECT nickname, score, words_found, words_total, percentage, created_at
     FROM hall_of_fame WHERE game_mode = ? AND game_time = ? AND lang = ? ORDER BY score DESC LIMIT 10`
  );
  stmt.bind([gameMode, Number(gameTime), safeLang]);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

export function getAllHallOfFame(lang) {
  const safeLang = lang || "fi";
  const result = {};
  for (const cat of HOF_CATEGORIES) {
    result[`${cat.gameMode}-${cat.gameTime}`] = {
      label: cat.label,
      scores: getHallOfFame(cat.gameMode, cat.gameTime, safeLang),
    };
  }
  return result;
}

// ===== Daily leaderboard =====

export function submitDailyScore({ nickname, score, wordsFound, wordsTotal, dateStr, lang }) {
  if (!db || !nickname || score < 0 || !dateStr) return null;
  const safeLang = isLangValid(lang) ? lang : "fi";
  const d = new Date(dateStr + "T00:00:00Z");
  const dayNumber = Math.floor((d - new Date(d.getUTCFullYear(), 0, 0)) / 86400000);
  const year = d.getUTCFullYear();
  const percentage = wordsTotal > 0 ? Math.round((wordsFound / wordsTotal) * 100) : 0;
  db.run(
    `INSERT OR REPLACE INTO daily_scores (day_number, nickname, score, words_found, words_total, percentage, lang, year, date_str)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [dayNumber, nickname, score, wordsFound, wordsTotal, percentage, safeLang, year, dateStr]
  );
  saveDb();
  return true;
}

export function getDailyLeaderboard(dateStr, lang) {
  if (!db || !dateStr) return [];
  const safeLang = lang || "fi";
  const d = new Date(dateStr + "T00:00:00Z");
  const dayNumber = Math.floor((d - new Date(d.getUTCFullYear(), 0, 0)) / 86400000);
  const stmt = db.prepare(
    `SELECT nickname, score, words_found, words_total, percentage, created_at
     FROM daily_scores WHERE day_number = ? AND lang = ? ORDER BY score DESC LIMIT 20`
  );
  stmt.bind([dayNumber, safeLang]);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}
