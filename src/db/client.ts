import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

/**
 * Inlined rather than read from a .sql file at runtime: `tsc` only emits .ts files,
 * so a sibling schema.sql would not exist under dist/ and `npm start` would ENOENT.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS user_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  diet_type TEXT NOT NULL,
  allergies TEXT NOT NULL DEFAULT '[]',
  region TEXT NOT NULL,
  cooking_mediums TEXT NOT NULL DEFAULT '[]',
  meals_per_day INTEGER,
  snacks_per_day INTEGER,
  preference_notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  calories REAL NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  micros_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ingredients (
  name TEXT PRIMARY KEY,
  calories_per_100g REAL NOT NULL,
  protein_g_per_100g REAL NOT NULL,
  carbs_g_per_100g REAL NOT NULL,
  fat_g_per_100g REAL NOT NULL,
  micros_per_100g_json TEXT NOT NULL DEFAULT '{}',
  tags_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS plan_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dish_name TEXT NOT NULL,
  served_on TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS video_library (
  dish_name TEXT PRIMARY KEY,
  youtube_url TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}
