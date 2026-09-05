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
  household_size INTEGER,
  preference_notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  calories REAL NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  fiber_g REAL NOT NULL,
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
  fiber_g_per_100g REAL NOT NULL DEFAULT 0,
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

/**
 * Columns added to an existing table after its initial release. CREATE TABLE IF NOT
 * EXISTS only applies to brand-new databases, so an already-existing user_profile
 * table needs each new column added explicitly — this keeps existing installs
 * (existing onboarding/targets data) working without a manual reset every time a
 * new field is introduced.
 */
const COLUMN_MIGRATIONS: { table: string; column: string; ddl: string }[] = [
  { table: "user_profile", column: "household_size", ddl: "ALTER TABLE user_profile ADD COLUMN household_size INTEGER" },
];

function applyColumnMigrations(database: Database.Database): void {
  for (const { table, column, ddl } of COLUMN_MIGRATIONS) {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((c) => c.name === column)) {
      database.exec(ddl);
    }
  }
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  applyColumnMigrations(db);
  return db;
}
