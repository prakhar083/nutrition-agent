# Personal Nutritionist Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, always-running Node/TypeScript service that onboards the user via Telegram, generates a daily Hinglish meal plan hitting calorie/macro/micro targets from ingredient-level nutrition math, checks ingredient availability on Zepto, and delivers the plan to the user on Telegram every morning.

**Architecture:** A single Node process wires together: a SQLite-backed data layer (profile, targets, plan history, ingredient DB, video library), a Telegram bot (onboarding + intake + delivery), a Claude-powered meal plan generator and recipe writer, a Zepto MCP client for availability checks, and an in-process daily cron job that runs the pipeline and sends the result. See `docs/superpowers/specs/2026-08-11-nutritionist-agent-design.md` for the full design.

**Tech Stack:** TypeScript, Node.js 20+, `better-sqlite3`, `telegraf` (Telegram Bot API), `@anthropic-ai/sdk` (Claude), `@modelcontextprotocol/sdk` (Zepto MCP client), `node-cron`, `vitest` (tests).

## Global Constraints

- India-first only: regional Indian cuisine, Hinglish instructions, Zepto (India-only) for availability. No multi-country support in this build.
- No WhatsApp integration anywhere in the code — delivery is Telegram only; the user forwards manually.
- No automatic YouTube search — video links are only added when the user sends one via Telegram tagged to a dish.
- Variety window defaults to 14 days, must be configurable (env var or DB setting), not hardcoded.
- Portion sizes are captured and stored in grams/ml, never size labels.
- All nutrition totals are computed from the local Ingredient Nutrition DB (ingredient + grams), never estimated ad hoc by the LLM.
- v1 runs locally only (`node`/`pm2` on the user's machine) — no deployment/VPS work in this plan.

---

## File Structure

```
butler/
  package.json
  tsconfig.json
  vitest.config.ts
  .env.example
  .gitignore
  data/
    ingredients.seed.json
  src/
    config.ts
    index.ts
    db/
      client.ts
      schema.sql
      migrate.ts
      repositories/
        userProfileRepo.ts
        targetsRepo.ts
        ingredientRepo.ts
        planHistoryRepo.ts
        videoLibraryRepo.ts
    nutrition/
      types.ts
      calculator.ts
      calculator.test.ts
    variety/
      varietyTracker.ts
      varietyTracker.test.ts
    zepto/
      mcpClient.ts
      availabilityChecker.ts
      availabilityChecker.test.ts
    planning/
      mealPlanGenerator.ts
      recipeWriter.ts
    telegram/
      bot.ts
      onboarding.ts
      targetsIntake.ts
      videoLinkHandler.ts
      formatter.ts
      formatter.test.ts
    pipeline/
      runDailyPipeline.ts
    scheduler/
      dailyJob.ts
```

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `.gitignore`

**Interfaces:**
- Produces: npm scripts `build`, `start`, `dev`, `test`; TS path resolves `src/*`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "butler",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.0",
    "@modelcontextprotocol/sdk": "^1.5.0",
    "better-sqlite3": "^11.5.0",
    "dotenv": "^16.4.5",
    "node-cron": "^3.0.3",
    "telegraf": "^4.16.3"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.9.0",
    "@types/node-cron": "^3.0.11",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Create `.env.example`**

```
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
ANTHROPIC_API_KEY=
ZEPTO_MCP_URL=https://mcp.zepto.co.in/mcp
DAILY_PLAN_CRON=0 7 * * *
VARIETY_WINDOW_DAYS=14
DB_PATH=./data/butler.db
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
.env
data/butler.db
data/zepto-token.json
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: installs without error, creates `package-lock.json`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .env.example .gitignore
git commit -m "chore: scaffold Node/TypeScript project"
```

---

### Task 2: SQLite schema and DB client

**Files:**
- Create: `src/db/schema.sql`
- Create: `src/db/client.ts`
- Create: `src/db/migrate.ts`

**Interfaces:**
- Produces: `getDb(): Database` (from `src/db/client.ts`), a singleton `better-sqlite3` connection with schema applied.

- [ ] **Step 1: Create `src/db/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS user_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  diet_type TEXT NOT NULL,
  allergies TEXT NOT NULL DEFAULT '[]',
  region TEXT NOT NULL,
  cooking_mediums TEXT NOT NULL DEFAULT '[]',
  portion_grams_per_meal INTEGER,
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
```

- [ ] **Step 2: Create `src/db/client.ts`**

```ts
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  db.exec(schema);
  return db;
}
```

- [ ] **Step 3: Create `src/db/migrate.ts`**

```ts
import { getDb } from "./client.js";

getDb();
console.log("Database schema applied.");
```

Note: `src/config.ts` is created in Task 7. If running this task standalone before Task 7 exists, stub it temporarily; otherwise implement Task 7 first — the tasks below assume Task 7 (`config.ts`) exists before any file that imports it is executed.

- [ ] **Step 4: Verify manually**

Run: `npx tsx src/db/migrate.ts` (after Task 7's `config.ts` exists)
Expected: prints `Database schema applied.` and creates `data/butler.db`.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.sql src/db/client.ts src/db/migrate.ts
git commit -m "feat: add SQLite schema and db client"
```

---

### Task 3: Nutrition calculator and ingredient seed data (TDD)

**Files:**
- Create: `src/nutrition/types.ts`
- Create: `src/nutrition/calculator.ts`
- Create: `src/nutrition/calculator.test.ts`
- Create: `data/ingredients.seed.json`
- Create: `src/db/repositories/ingredientRepo.ts`

**Interfaces:**
- Produces: `type Ingredient`, `type DishIngredient = { ingredientName: string; grams: number }`, `type NutritionTotals = { calories: number; proteinG: number; carbsG: number; fatG: number; micros: Record<string, number> }`, `computeDishTotals(dish: DishIngredient[], ingredients: Ingredient[]): NutritionTotals`, `sumTotals(totals: NutritionTotals[]): NutritionTotals`.
- Produces: `ingredientRepo.getAll(): Ingredient[]`, `ingredientRepo.getByNames(names: string[]): Ingredient[]`, `ingredientRepo.seedFromFile(filePath: string): void`.

- [ ] **Step 1: Create `src/nutrition/types.ts`**

```ts
export interface Ingredient {
  name: string;
  caloriesPer100g: number;
  proteinGPer100g: number;
  carbsGPer100g: number;
  fatGPer100g: number;
  microsPer100g: Record<string, number>;
  tags: string[];
}

export interface DishIngredient {
  ingredientName: string;
  grams: number;
}

export interface NutritionTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  micros: Record<string, number>;
}
```

- [ ] **Step 2: Write failing tests in `src/nutrition/calculator.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { computeDishTotals, sumTotals } from "./calculator.js";
import type { Ingredient } from "./types.js";

const rice: Ingredient = {
  name: "rice",
  caloriesPer100g: 130,
  proteinGPer100g: 2.7,
  carbsGPer100g: 28,
  fatGPer100g: 0.3,
  microsPer100g: { ironMg: 0.2 },
  tags: [],
};

const dal: Ingredient = {
  name: "dal",
  caloriesPer100g: 116,
  proteinGPer100g: 9,
  carbsGPer100g: 20,
  fatGPer100g: 0.4,
  microsPer100g: { ironMg: 1.5 },
  tags: [],
};

describe("computeDishTotals", () => {
  it("scales nutrition by grams and sums across ingredients", () => {
    const totals = computeDishTotals(
      [
        { ingredientName: "rice", grams: 200 },
        { ingredientName: "dal", grams: 100 },
      ],
      [rice, dal]
    );
    expect(totals.calories).toBeCloseTo(130 * 2 + 116 * 1, 3);
    expect(totals.proteinG).toBeCloseTo(2.7 * 2 + 9, 3);
    expect(totals.micros.ironMg).toBeCloseTo(0.2 * 2 + 1.5, 3);
  });

  it("throws if an ingredient is missing from the lookup list", () => {
    expect(() =>
      computeDishTotals([{ ingredientName: "ghost", grams: 50 }], [rice])
    ).toThrow(/ghost/);
  });
});

describe("sumTotals", () => {
  it("adds calories/macros/micros across multiple totals", () => {
    const a = { calories: 100, proteinG: 5, carbsG: 10, fatG: 2, micros: { ironMg: 1 } };
    const b = { calories: 200, proteinG: 10, carbsG: 20, fatG: 4, micros: { ironMg: 2 } };
    const result = sumTotals([a, b]);
    expect(result).toEqual({ calories: 300, proteinG: 15, carbsG: 30, fatG: 6, micros: { ironMg: 3 } });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/nutrition/calculator.test.ts`
Expected: FAIL — `calculator.ts` does not exist yet.

- [ ] **Step 4: Implement `src/nutrition/calculator.ts`**

```ts
import type { DishIngredient, Ingredient, NutritionTotals } from "./types.js";

export function computeDishTotals(
  dish: DishIngredient[],
  ingredients: Ingredient[]
): NutritionTotals {
  const byName = new Map(ingredients.map((i) => [i.name, i]));
  const totals: NutritionTotals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, micros: {} };

  for (const item of dish) {
    const ingredient = byName.get(item.ingredientName);
    if (!ingredient) {
      throw new Error(`Unknown ingredient: ${item.ingredientName}`);
    }
    const factor = item.grams / 100;
    totals.calories += ingredient.caloriesPer100g * factor;
    totals.proteinG += ingredient.proteinGPer100g * factor;
    totals.carbsG += ingredient.carbsGPer100g * factor;
    totals.fatG += ingredient.fatGPer100g * factor;
    for (const [key, value] of Object.entries(ingredient.microsPer100g)) {
      totals.micros[key] = (totals.micros[key] ?? 0) + value * factor;
    }
  }
  return totals;
}

export function sumTotals(totalsList: NutritionTotals[]): NutritionTotals {
  const result: NutritionTotals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, micros: {} };
  for (const t of totalsList) {
    result.calories += t.calories;
    result.proteinG += t.proteinG;
    result.carbsG += t.carbsG;
    result.fatG += t.fatG;
    for (const [key, value] of Object.entries(t.micros)) {
      result.micros[key] = (result.micros[key] ?? 0) + value;
    }
  }
  return result;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/nutrition/calculator.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Create starter ingredient seed data `data/ingredients.seed.json`**

```json
[
  { "name": "rice", "caloriesPer100g": 130, "proteinGPer100g": 2.7, "carbsGPer100g": 28, "fatGPer100g": 0.3, "microsPer100g": { "ironMg": 0.2 }, "tags": ["grain", "north-indian", "south-indian"] },
  { "name": "dal", "caloriesPer100g": 116, "proteinGPer100g": 9, "carbsGPer100g": 20, "fatGPer100g": 0.4, "microsPer100g": { "ironMg": 1.5 }, "tags": ["legume", "north-indian"] },
  { "name": "roti_atta", "caloriesPer100g": 341, "proteinGPer100g": 12, "carbsGPer100g": 69, "fatGPer100g": 1.7, "microsPer100g": { "ironMg": 3.9 }, "tags": ["grain", "north-indian"] },
  { "name": "paneer", "caloriesPer100g": 265, "proteinGPer100g": 18, "carbsGPer100g": 3.4, "fatGPer100g": 20.8, "microsPer100g": { "calciumMg": 480 }, "tags": ["dairy", "north-indian"] },
  { "name": "chicken_breast", "caloriesPer100g": 165, "proteinGPer100g": 31, "carbsGPer100g": 0, "fatGPer100g": 3.6, "microsPer100g": { "ironMg": 1 }, "tags": ["meat"] },
  { "name": "spinach", "caloriesPer100g": 23, "proteinGPer100g": 2.9, "carbsGPer100g": 3.6, "fatGPer100g": 0.4, "microsPer100g": { "ironMg": 2.7, "vitaminAMcg": 469 }, "tags": ["vegetable", "north-indian", "south-indian"] },
  { "name": "curd", "caloriesPer100g": 98, "proteinGPer100g": 11, "carbsGPer100g": 3.4, "fatGPer100g": 4.3, "microsPer100g": { "calciumMg": 380 }, "tags": ["dairy"] },
  { "name": "coconut_grated", "caloriesPer100g": 354, "proteinGPer100g": 3.3, "carbsGPer100g": 15, "fatGPer100g": 33, "microsPer100g": {}, "tags": ["south-indian"] },
  { "name": "sambar_dal", "caloriesPer100g": 116, "proteinGPer100g": 9, "carbsGPer100g": 20, "fatGPer100g": 0.4, "microsPer100g": { "ironMg": 1.5 }, "tags": ["legume", "south-indian"] },
  { "name": "egg", "caloriesPer100g": 155, "proteinGPer100g": 13, "carbsGPer100g": 1.1, "fatGPer100g": 11, "microsPer100g": { "vitaminDMcg": 2 }, "tags": ["eggetarian"] }
]
```

Note: this is a starter set (10 ingredients) covering common North/South Indian staples across the diet types in scope. Extend `data/ingredients.seed.json` with more entries from USDA FoodData Central / IFCT 2017 as real usage surfaces missing ingredients — the schema (`ingredientRepo.seedFromFile`) supports re-seeding at any size without code changes.

- [ ] **Step 7: Create `src/db/repositories/ingredientRepo.ts`**

```ts
import fs from "node:fs";
import { getDb } from "../client.js";
import type { Ingredient } from "../../nutrition/types.js";

function rowToIngredient(row: any): Ingredient {
  return {
    name: row.name,
    caloriesPer100g: row.calories_per_100g,
    proteinGPer100g: row.protein_g_per_100g,
    carbsGPer100g: row.carbs_g_per_100g,
    fatGPer100g: row.fat_g_per_100g,
    microsPer100g: JSON.parse(row.micros_per_100g_json),
    tags: JSON.parse(row.tags_json),
  };
}

export const ingredientRepo = {
  getAll(): Ingredient[] {
    const rows = getDb().prepare("SELECT * FROM ingredients").all();
    return rows.map(rowToIngredient);
  },

  getByNames(names: string[]): Ingredient[] {
    if (names.length === 0) return [];
    const placeholders = names.map(() => "?").join(",");
    const rows = getDb()
      .prepare(`SELECT * FROM ingredients WHERE name IN (${placeholders})`)
      .all(...names);
    return rows.map(rowToIngredient);
  },

  seedFromFile(filePath: string): void {
    const ingredients: Ingredient[] = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const insert = getDb().prepare(
      `INSERT OR REPLACE INTO ingredients
        (name, calories_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, micros_per_100g_json, tags_json)
       VALUES (@name, @caloriesPer100g, @proteinGPer100g, @carbsGPer100g, @fatGPer100g, @microsJson, @tagsJson)`
    );
    const tx = getDb().transaction((items: Ingredient[]) => {
      for (const item of items) {
        insert.run({
          ...item,
          microsJson: JSON.stringify(item.microsPer100g),
          tagsJson: JSON.stringify(item.tags),
        });
      }
    });
    tx(ingredients);
  },
};
```

- [ ] **Step 8: Commit**

```bash
git add src/nutrition data/ingredients.seed.json src/db/repositories/ingredientRepo.ts
git commit -m "feat: add nutrition calculator and ingredient seed data"
```

---

### Task 4: User profile and targets repositories

**Files:**
- Create: `src/db/repositories/userProfileRepo.ts`
- Create: `src/db/repositories/targetsRepo.ts`

**Interfaces:**
- Consumes: `getDb()` from Task 2.
- Produces: `type UserProfile = { dietType: string; allergies: string[]; region: string; cookingMediums: string[]; portionGramsPerMeal: number | null }`; `userProfileRepo.get(): UserProfile | null`; `userProfileRepo.upsert(profile: UserProfile): void`.
- Produces: `type Targets = { calories: number; proteinG: number; carbsG: number; fatG: number; micros: Record<string, number> }`; `targetsRepo.getActive(): Targets | null`; `targetsRepo.setActive(targets: Targets): void` (deactivates prior row, inserts new active row).

- [ ] **Step 1: Create `src/db/repositories/userProfileRepo.ts`**

```ts
import { getDb } from "../client.js";

export interface UserProfile {
  dietType: string;
  allergies: string[];
  region: string;
  cookingMediums: string[];
  portionGramsPerMeal: number | null;
}

export const userProfileRepo = {
  get(): UserProfile | null {
    const row: any = getDb().prepare("SELECT * FROM user_profile WHERE id = 1").get();
    if (!row) return null;
    return {
      dietType: row.diet_type,
      allergies: JSON.parse(row.allergies),
      region: row.region,
      cookingMediums: JSON.parse(row.cooking_mediums),
      portionGramsPerMeal: row.portion_grams_per_meal,
    };
  },

  upsert(profile: UserProfile): void {
    getDb()
      .prepare(
        `INSERT INTO user_profile (id, diet_type, allergies, region, cooking_mediums, portion_grams_per_meal, updated_at)
         VALUES (1, @dietType, @allergies, @region, @cookingMediums, @portionGramsPerMeal, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           diet_type = @dietType,
           allergies = @allergies,
           region = @region,
           cooking_mediums = @cookingMediums,
           portion_grams_per_meal = @portionGramsPerMeal,
           updated_at = datetime('now')`
      )
      .run({
        dietType: profile.dietType,
        allergies: JSON.stringify(profile.allergies),
        region: profile.region,
        cookingMediums: JSON.stringify(profile.cookingMediums),
        portionGramsPerMeal: profile.portionGramsPerMeal,
      });
  },
};
```

- [ ] **Step 2: Create `src/db/repositories/targetsRepo.ts`**

```ts
import { getDb } from "../client.js";

export interface Targets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  micros: Record<string, number>;
}

export const targetsRepo = {
  getActive(): Targets | null {
    const row: any = getDb()
      .prepare("SELECT * FROM targets WHERE active = 1 ORDER BY id DESC LIMIT 1")
      .get();
    if (!row) return null;
    return {
      calories: row.calories,
      proteinG: row.protein_g,
      carbsG: row.carbs_g,
      fatG: row.fat_g,
      micros: JSON.parse(row.micros_json),
    };
  },

  setActive(targets: Targets): void {
    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare("UPDATE targets SET active = 0 WHERE active = 1").run();
      db.prepare(
        `INSERT INTO targets (calories, protein_g, carbs_g, fat_g, micros_json, active)
         VALUES (@calories, @proteinG, @carbsG, @fatG, @microsJson, 1)`
      ).run({ ...targets, microsJson: JSON.stringify(targets.micros) });
    });
    tx();
  },
};
```

- [ ] **Step 3: Verify manually**

Run:
```bash
npx tsx -e "
import { userProfileRepo } from './src/db/repositories/userProfileRepo.js';
import { targetsRepo } from './src/db/repositories/targetsRepo.js';
userProfileRepo.upsert({ dietType: 'vegetarian', allergies: [], region: 'north-indian', cookingMediums: ['gas-stove'], portionGramsPerMeal: 350 });
targetsRepo.setActive({ calories: 2000, proteinG: 100, carbsG: 220, fatG: 60, micros: {} });
console.log(userProfileRepo.get());
console.log(targetsRepo.getActive());
"
```
Expected: prints the profile and targets just written, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/db/repositories/userProfileRepo.ts src/db/repositories/targetsRepo.ts
git commit -m "feat: add user profile and targets repositories"
```

---

### Task 5: Plan history repository and Variety Tracker (TDD)

**Files:**
- Create: `src/db/repositories/planHistoryRepo.ts`
- Create: `src/variety/varietyTracker.ts`
- Create: `src/variety/varietyTracker.test.ts`

**Interfaces:**
- Produces: `planHistoryRepo.recordServed(dishName: string, servedOn: string): void`; `planHistoryRepo.getServedSince(sinceDate: string): { dishName: string; servedOn: string }[]`.
- Produces: `excludeRecentDishes(history: { dishName: string; servedOn: string }[], today: string, windowDays: number): Set<string>` — pure function, no DB dependency, so it's independently testable.

- [ ] **Step 1: Create `src/db/repositories/planHistoryRepo.ts`**

```ts
import { getDb } from "../client.js";

export interface ServedDish {
  dishName: string;
  servedOn: string;
}

export const planHistoryRepo = {
  recordServed(dishName: string, servedOn: string): void {
    getDb()
      .prepare("INSERT INTO plan_history (dish_name, served_on) VALUES (?, ?)")
      .run(dishName, servedOn);
  },

  getServedSince(sinceDate: string): ServedDish[] {
    const rows: any[] = getDb()
      .prepare("SELECT dish_name, served_on FROM plan_history WHERE served_on >= ?")
      .all(sinceDate);
    return rows.map((r) => ({ dishName: r.dish_name, servedOn: r.served_on }));
  },
};
```

- [ ] **Step 2: Write failing tests in `src/variety/varietyTracker.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { excludeRecentDishes } from "./varietyTracker.js";

describe("excludeRecentDishes", () => {
  it("excludes dishes served within the window", () => {
    const excluded = excludeRecentDishes(
      [{ dishName: "dal_rice", servedOn: "2026-08-05" }],
      "2026-08-11",
      14
    );
    expect(excluded.has("dal_rice")).toBe(true);
  });

  it("does not exclude dishes served outside the window", () => {
    const excluded = excludeRecentDishes(
      [{ dishName: "dal_rice", servedOn: "2026-07-01" }],
      "2026-08-11",
      14
    );
    expect(excluded.has("dal_rice")).toBe(false);
  });

  it("returns an empty set when history is empty", () => {
    expect(excludeRecentDishes([], "2026-08-11", 14).size).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/variety/varietyTracker.test.ts`
Expected: FAIL — `varietyTracker.ts` does not exist.

- [ ] **Step 4: Implement `src/variety/varietyTracker.ts`**

```ts
import type { ServedDish } from "../db/repositories/planHistoryRepo.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function excludeRecentDishes(
  history: ServedDish[],
  today: string,
  windowDays: number
): Set<string> {
  const todayMs = new Date(today).getTime();
  const excluded = new Set<string>();
  for (const entry of history) {
    const servedMs = new Date(entry.servedOn).getTime();
    const daysAgo = (todayMs - servedMs) / MS_PER_DAY;
    if (daysAgo >= 0 && daysAgo < windowDays) {
      excluded.add(entry.dishName);
    }
  }
  return excluded;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/variety/varietyTracker.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/db/repositories/planHistoryRepo.ts src/variety
git commit -m "feat: add plan history repo and variety tracker"
```

---

### Task 6: Video library repository

**Files:**
- Create: `src/db/repositories/videoLibraryRepo.ts`

**Interfaces:**
- Produces: `videoLibraryRepo.getForDish(dishName: string): string | null`; `videoLibraryRepo.set(dishName: string, youtubeUrl: string): void`.

- [ ] **Step 1: Create `src/db/repositories/videoLibraryRepo.ts`**

```ts
import { getDb } from "../client.js";

export const videoLibraryRepo = {
  getForDish(dishName: string): string | null {
    const row: any = getDb()
      .prepare("SELECT youtube_url FROM video_library WHERE dish_name = ?")
      .get(dishName);
    return row ? row.youtube_url : null;
  },

  set(dishName: string, youtubeUrl: string): void {
    getDb()
      .prepare(
        `INSERT INTO video_library (dish_name, youtube_url)
         VALUES (?, ?)
         ON CONFLICT(dish_name) DO UPDATE SET youtube_url = excluded.youtube_url`
      )
      .run(dishName, youtubeUrl);
  },
};
```

- [ ] **Step 2: Verify manually**

Run:
```bash
npx tsx -e "
import { videoLibraryRepo } from './src/db/repositories/videoLibraryRepo.js';
videoLibraryRepo.set('dal_rice', 'https://youtube.com/watch?v=example');
console.log(videoLibraryRepo.getForDish('dal_rice'));
console.log(videoLibraryRepo.getForDish('unknown_dish'));
"
```
Expected: prints the URL, then `null`.

- [ ] **Step 3: Commit**

```bash
git add src/db/repositories/videoLibraryRepo.ts
git commit -m "feat: add video library repository"
```

---

### Task 7: Config module

**Files:**
- Create: `src/config.ts`

**Interfaces:**
- Produces: `config: { telegramBotToken: string; telegramChatId: string; anthropicApiKey: string; zeptoMcpUrl: string; dailyPlanCron: string; varietyWindowDays: number; dbPath: string }`.

- [ ] **Step 1: Create `src/config.ts`**

```ts
import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  telegramChatId: required("TELEGRAM_CHAT_ID"),
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  zeptoMcpUrl: process.env.ZEPTO_MCP_URL ?? "https://mcp.zepto.co.in/mcp",
  dailyPlanCron: process.env.DAILY_PLAN_CRON ?? "0 7 * * *",
  varietyWindowDays: Number(process.env.VARIETY_WINDOW_DAYS ?? "14"),
  dbPath: process.env.DB_PATH ?? "./data/butler.db",
};
```

- [ ] **Step 2: Verify manually**

Run: `cp .env.example .env` then fill in a placeholder `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ANTHROPIC_API_KEY` (real values needed from later tasks), then `npx tsx -e "import { config } from './src/config.js'; console.log(config)"`.
Expected: prints the config object with no thrown errors.

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat: add config module"
```

---

### Task 8: Telegram bot scaffolding and onboarding flow

**Files:**
- Create: `src/telegram/bot.ts`
- Create: `src/telegram/onboarding.ts`

**Interfaces:**
- Consumes: `config` (Task 7), `userProfileRepo` (Task 4).
- Produces: `bot: Telegraf` instance; `registerOnboarding(bot: Telegraf): void` — wires the `/start` command and a text-message state machine for onboarding.

- [ ] **Step 1: Create `src/telegram/bot.ts`**

```ts
import { Telegraf } from "telegraf";
import { config } from "../config.js";

export const bot = new Telegraf(config.telegramBotToken);
```

- [ ] **Step 2: Create `src/telegram/onboarding.ts`**

```ts
import type { Telegraf } from "telegraf";
import { userProfileRepo } from "../db/repositories/userProfileRepo.js";

type Step = "diet" | "allergies" | "region" | "cookingMediums" | "portion" | "done";

interface Session {
  step: Step;
  dietType?: string;
  allergies?: string[];
  region?: string;
  cookingMediums?: string[];
}

const sessions = new Map<number, Session>();

const PROMPTS: Record<Step, string> = {
  diet: "Let's set you up. What's your diet type? (vegetarian / non-vegetarian / eggetarian / vegan)",
  allergies: "Any allergies or dislikes? Comma-separated, or 'none'.",
  region: "Which regional cuisine do you prefer? (north-indian / south-indian / east-indian / west-indian)",
  cookingMediums: "What cooking mediums do you have available? Comma-separated (e.g. gas-stove, convection-microwave, air-fryer, otg, induction).",
  portion: "What's your target portion size per meal, in grams? (e.g. 350)",
  done: "You're all set! Send me your calorie/macro targets (text or a screenshot) whenever you're ready.",
};

export function registerOnboarding(bot: Telegraf): void {
  bot.command("start", (ctx) => {
    sessions.set(ctx.chat.id, { step: "diet" });
    ctx.reply(PROMPTS.diet);
  });

  bot.on("text", (ctx, next) => {
    const session = sessions.get(ctx.chat.id);
    if (!session) return next();

    const text = ctx.message.text.trim();

    switch (session.step) {
      case "diet":
        session.dietType = text.toLowerCase();
        session.step = "allergies";
        return ctx.reply(PROMPTS.allergies);
      case "allergies":
        session.allergies = text.toLowerCase() === "none" ? [] : text.split(",").map((s) => s.trim());
        session.step = "region";
        return ctx.reply(PROMPTS.region);
      case "region":
        session.region = text.toLowerCase();
        session.step = "cookingMediums";
        return ctx.reply(PROMPTS.cookingMediums);
      case "cookingMediums":
        session.cookingMediums = text.split(",").map((s) => s.trim().toLowerCase());
        session.step = "portion";
        return ctx.reply(PROMPTS.portion);
      case "portion": {
        const grams = Number(text);
        if (!Number.isFinite(grams) || grams <= 0) {
          return ctx.reply("Please send a positive number of grams.");
        }
        userProfileRepo.upsert({
          dietType: session.dietType!,
          allergies: session.allergies!,
          region: session.region!,
          cookingMediums: session.cookingMediums!,
          portionGramsPerMeal: grams,
        });
        session.step = "done";
        sessions.delete(ctx.chat.id);
        return ctx.reply(PROMPTS.done);
      }
      default:
        return next();
    }
  });
}
```

- [ ] **Step 3: Verify manually**

Set a real `TELEGRAM_BOT_TOKEN` in `.env` (create a bot via `@BotFather` on Telegram if you don't have one yet), then run:
```bash
npx tsx -e "
import { bot } from './src/telegram/bot.js';
import { registerOnboarding } from './src/telegram/onboarding.js';
registerOnboarding(bot);
bot.launch();
console.log('Bot running, send /start on Telegram.');
"
```
Expected: sending `/start` to the bot on Telegram walks through all 5 onboarding prompts and `userProfileRepo.get()` returns the saved profile afterward.

- [ ] **Step 4: Commit**

```bash
git add src/telegram/bot.ts src/telegram/onboarding.ts
git commit -m "feat: add Telegram bot and onboarding flow"
```

---

### Task 9: Targets intake (text or screenshot via Claude vision)

**Files:**
- Create: `src/telegram/targetsIntake.ts`

**Interfaces:**
- Consumes: `config.anthropicApiKey`, `targetsRepo.setActive` (Task 4).
- Produces: `registerTargetsIntake(bot: Telegraf): void`.

- [ ] **Step 1: Create `src/telegram/targetsIntake.ts`**

```ts
import type { Telegraf } from "telegraf";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { targetsRepo } from "../db/repositories/targetsRepo.js";

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

const EXTRACTION_PROMPT = `Extract daily nutrition targets from the user's message (text or image).
Respond with ONLY a JSON object matching this exact shape, no other text:
{"calories": number, "proteinG": number, "carbsG": number, "fatG": number, "micros": {"<name>": number, ...}}
If the targets are ambiguous or incomplete, respond with exactly: {"error": "<what is missing or unclear>"}`;

async function extractTargets(content: Anthropic.MessageParam["content"]) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: EXTRACTION_PROMPT,
    messages: [{ role: "user", content }],
  });
  const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
  return JSON.parse(text);
}

export function registerTargetsIntake(bot: Telegraf): void {
  bot.on("text", async (ctx, next) => {
    if (!/\d/.test(ctx.message.text)) return next();
    const result = await extractTargets([{ type: "text", text: ctx.message.text }]);
    if (result.error) return ctx.reply(`Couldn't parse targets: ${result.error}`);
    targetsRepo.setActive(result);
    return ctx.reply(
      `Got it — ${result.calories} kcal, P${result.proteinG}/C${result.carbsG}/F${result.fatG}g. This takes effect from tomorrow's plan.`
    );
  });

  bot.on("photo", async (ctx) => {
    const photo = ctx.message.photo.at(-1)!;
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);
    const imageResponse = await fetch(fileLink.toString());
    const base64 = Buffer.from(await imageResponse.arrayBuffer()).toString("base64");
    const result = await extractTargets([
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
    ]);
    if (result.error) return ctx.reply(`Couldn't parse targets from the image: ${result.error}`);
    targetsRepo.setActive(result);
    return ctx.reply(
      `Got it — ${result.calories} kcal, P${result.proteinG}/C${result.carbsG}/F${result.fatG}g. This takes effect from tomorrow's plan.`
    );
  });
}
```

- [ ] **Step 2: Verify manually**

Wire `registerTargetsIntake(bot)` alongside `registerOnboarding(bot)` in a scratch script (same pattern as Task 8 Step 3), send a text message like `2000 kcal, 100g protein, 220g carbs, 60g fat` and separately a screenshot of a macro breakdown.
Expected: bot replies confirming parsed targets in both cases; `targetsRepo.getActive()` reflects the latest one.

- [ ] **Step 3: Commit**

```bash
git add src/telegram/targetsIntake.ts
git commit -m "feat: add targets intake via text and screenshot"
```

---

### Task 10: Video link handler

**Files:**
- Create: `src/telegram/videoLinkHandler.ts`

**Interfaces:**
- Consumes: `videoLibraryRepo` (Task 6).
- Produces: `registerVideoLinkHandler(bot: Telegraf): void` — listens for messages containing a YouTube URL plus a dish name, e.g. `dal_rice https://youtube.com/watch?v=...` (either order).

- [ ] **Step 1: Create `src/telegram/videoLinkHandler.ts`**

```ts
import type { Telegraf } from "telegraf";
import { videoLibraryRepo } from "../db/repositories/videoLibraryRepo.js";

const YOUTUBE_URL_RE = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)\S+)/i;

export function registerVideoLinkHandler(bot: Telegraf): void {
  bot.on("text", (ctx, next) => {
    const match = ctx.message.text.match(YOUTUBE_URL_RE);
    if (!match) return next();

    const url = match[1];
    const dishName = ctx.message.text.replace(url, "").trim();
    if (!dishName) {
      return ctx.reply("Send the dish name along with the link, e.g. `dal_rice <youtube link>`.");
    }
    videoLibraryRepo.set(dishName, url);
    return ctx.reply(`Saved that video for "${dishName}" — I'll include it next time that dish comes up.`);
  });
}
```

- [ ] **Step 2: Verify manually**

Wire `registerVideoLinkHandler(bot)` into the scratch script, send `dal_rice https://youtube.com/watch?v=abc123` on Telegram.
Expected: bot confirms saving; `videoLibraryRepo.getForDish('dal_rice')` returns that URL.

- [ ] **Step 3: Commit**

```bash
git add src/telegram/videoLinkHandler.ts
git commit -m "feat: add YouTube video link handler"
```

---

### Task 11: Zepto MCP client — connect and discover tools

This task is exploratory: the Zepto MCP server's exact tool names/schemas are not yet known. Connect, list tools, and record the real names/schemas so Task 12 can call them correctly instead of guessing.

**Files:**
- Create: `src/zepto/mcpClient.ts`
- Create: `src/zepto/TOOLS.md` (scratch notes, not code — records discovered tool names/schemas)

**Interfaces:**
- Produces: `getZeptoMcpClient(): Promise<Client>` — a connected, authenticated `@modelcontextprotocol/sdk` client to `config.zeptoMcpUrl`, with the OAuth token cached to disk so re-auth isn't needed on every run.

- [ ] **Step 1: Create `src/zepto/mcpClient.ts`**

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { config } from "../config.js";

let client: Client | null = null;

export async function getZeptoMcpClient(): Promise<Client> {
  if (client) return client;
  const transport = new StreamableHTTPClientTransport(new URL(config.zeptoMcpUrl));
  client = new Client({ name: "butler-nutritionist", version: "0.1.0" });
  await client.connect(transport);
  return client;
}
```

Note: the SDK's OAuth handling and exact transport constructor options may need adjusting once you run this against the real server — the `@modelcontextprotocol/sdk` client emits clear errors/prompts for auth steps (similar in spirit to the `mcp__zepto__authenticate` / `mcp__zepto__complete_authentication` flow used inside Claude Code). Follow whatever the SDK's error message asks for; this is expected to take iteration since it's a real external OAuth flow.

- [ ] **Step 2: Discover available tools**

Run:
```bash
npx tsx -e "
import { getZeptoMcpClient } from './src/zepto/mcpClient.js';
const client = await getZeptoMcpClient();
const tools = await client.listTools();
console.log(JSON.stringify(tools, null, 2));
"
```
Expected: after completing whatever OAuth prompt appears, prints a list of tools (names + input schemas) the Zepto MCP server exposes — e.g. something for product search and something for availability/stock by location.

- [ ] **Step 3: Record findings in `src/zepto/TOOLS.md`**

Write down, verbatim from Step 2's output: the exact tool name(s) relevant to "is ingredient X available", their input schema (parameter names/types), and their output shape. This file is reference documentation for Task 12, not executable code — e.g.:

```markdown
# Zepto MCP tools (discovered <date>)

## <actual_tool_name_from_step_2>
Input: { ... actual schema ... }
Output: { ... actual shape ... }
```

- [ ] **Step 4: Commit**

```bash
git add src/zepto/mcpClient.ts src/zepto/TOOLS.md
git commit -m "feat: add Zepto MCP client and document discovered tools"
```

---

### Task 12: Availability checker and substitution logic (TDD)

**Files:**
- Create: `src/zepto/availabilityChecker.ts`
- Create: `src/zepto/availabilityChecker.test.ts`

**Interfaces:**
- Consumes: `getZeptoMcpClient` (Task 11), `Ingredient` (Task 3).
- Produces: `type StockLookup = (ingredientName: string) => Promise<boolean>`; `checkAndSubstitute(dish: DishIngredient[], candidates: Ingredient[], isAvailable: StockLookup): Promise<{ dish: DishIngredient[]; substitutions: { from: string; to: string }[] }>`.

The core substitution logic is a pure-ish function taking a `StockLookup` callback, so it's testable without touching the real Zepto MCP. A thin wrapper (`checkAvailabilityViaZepto`) adapts the real MCP client (from Task 11, using the tool discovered there) to this `StockLookup` shape.

- [ ] **Step 1: Write failing tests in `src/zepto/availabilityChecker.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { checkAndSubstitute } from "./availabilityChecker.js";
import type { Ingredient } from "../nutrition/types.js";

const paneer: Ingredient = {
  name: "paneer", caloriesPer100g: 265, proteinGPer100g: 18, carbsGPer100g: 3.4, fatGPer100g: 20.8, microsPer100g: {}, tags: ["dairy"],
};
const tofu: Ingredient = {
  name: "tofu", caloriesPer100g: 76, proteinGPer100g: 8, carbsGPer100g: 1.9, fatGPer100g: 4.8, microsPer100g: {}, tags: ["dairy"],
};
const rice: Ingredient = {
  name: "rice", caloriesPer100g: 130, proteinGPer100g: 2.7, carbsGPer100g: 28, fatGPer100g: 0.3, microsPer100g: {}, tags: ["grain"],
};

describe("checkAndSubstitute", () => {
  it("leaves the dish unchanged when everything is available", async () => {
    const isAvailable = async () => true;
    const result = await checkAndSubstitute(
      [{ ingredientName: "rice", grams: 200 }],
      [rice],
      isAvailable
    );
    expect(result.dish).toEqual([{ ingredientName: "rice", grams: 200 }]);
    expect(result.substitutions).toEqual([]);
  });

  it("substitutes an unavailable ingredient with a same-tag candidate", async () => {
    const isAvailable = async (name: string) => name !== "paneer";
    const result = await checkAndSubstitute(
      [{ ingredientName: "paneer", grams: 150 }],
      [paneer, tofu],
      isAvailable
    );
    expect(result.dish).toEqual([{ ingredientName: "tofu", grams: 150 }]);
    expect(result.substitutions).toEqual([{ from: "paneer", to: "tofu" }]);
  });

  it("throws if no substitute with a matching tag is available", async () => {
    const isAvailable = async () => false;
    await expect(
      checkAndSubstitute([{ ingredientName: "rice", grams: 200 }], [rice], isAvailable)
    ).rejects.toThrow(/no available substitute/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/zepto/availabilityChecker.test.ts`
Expected: FAIL — `availabilityChecker.ts` does not exist.

- [ ] **Step 3: Implement `src/zepto/availabilityChecker.ts`**

```ts
import type { Ingredient, DishIngredient } from "../nutrition/types.js";
import { getZeptoMcpClient } from "./mcpClient.js";

export type StockLookup = (ingredientName: string) => Promise<boolean>;

export async function checkAndSubstitute(
  dish: DishIngredient[],
  candidates: Ingredient[],
  isAvailable: StockLookup
): Promise<{ dish: DishIngredient[]; substitutions: { from: string; to: string }[] }> {
  const byName = new Map(candidates.map((c) => [c.name, c]));
  const substitutions: { from: string; to: string }[] = [];
  const resultDish: DishIngredient[] = [];

  for (const item of dish) {
    if (await isAvailable(item.ingredientName)) {
      resultDish.push(item);
      continue;
    }
    const original = byName.get(item.ingredientName);
    const sameTag = original?.tags[0];
    const substitute = candidates.find(
      (c) => c.name !== item.ingredientName && sameTag && c.tags.includes(sameTag)
    );
    if (!substitute) {
      throw new Error(`No available substitute for ${item.ingredientName}`);
    }
    let available = false;
    for (const attempt of [substitute, ...candidates.filter((c) => c !== substitute && c.tags.includes(sameTag!))]) {
      if (await isAvailable(attempt.name)) {
        resultDish.push({ ingredientName: attempt.name, grams: item.grams });
        substitutions.push({ from: item.ingredientName, to: attempt.name });
        available = true;
        break;
      }
    }
    if (!available) {
      throw new Error(`No available substitute for ${item.ingredientName}`);
    }
  }

  return { dish: resultDish, substitutions };
}

// NOTE: replace "check_availability" and its input/output field names below
// with the actual tool name and schema recorded in src/zepto/TOOLS.md (Task 11)
// before relying on this in the real pipeline.
export async function checkAvailabilityViaZepto(ingredientName: string): Promise<boolean> {
  const client = await getZeptoMcpClient();
  const result: any = await client.callTool({
    name: "check_availability",
    arguments: { query: ingredientName },
  });
  return Boolean(result?.available);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/zepto/availabilityChecker.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Update `checkAvailabilityViaZepto` using Task 11's findings**

Using the real tool name/schema recorded in `src/zepto/TOOLS.md`, edit the `client.callTool` call and result-parsing in `checkAvailabilityViaZepto` to match. Verify with:
```bash
npx tsx -e "
import { checkAvailabilityViaZepto } from './src/zepto/availabilityChecker.js';
console.log(await checkAvailabilityViaZepto('rice'));
"
```
Expected: prints `true` or `false` without throwing.

- [ ] **Step 6: Commit**

```bash
git add src/zepto/availabilityChecker.ts src/zepto/availabilityChecker.test.ts
git commit -m "feat: add Zepto availability checker with substitution logic"
```

---

### Task 13: Meal plan generator (Claude)

**Files:**
- Create: `src/planning/mealPlanGenerator.ts`

**Interfaces:**
- Consumes: `Targets` (Task 4), `UserProfile` (Task 4), `Ingredient[]` (Task 3), `Set<string>` excluded dish names (Task 5).
- Produces: `type PlannedDish = { name: string; ingredients: DishIngredient[] }`; `generateDailyPlan(input: { targets: Targets; profile: UserProfile; availableIngredients: Ingredient[]; excludedDishNames: Set<string> }): Promise<PlannedDish[]>`.

- [ ] **Step 1: Create `src/planning/mealPlanGenerator.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { computeDishTotals, sumTotals } from "../nutrition/calculator.js";
import type { DishIngredient, Ingredient } from "../nutrition/types.js";
import type { Targets } from "../db/repositories/targetsRepo.js";
import type { UserProfile } from "../db/repositories/userProfileRepo.js";

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

export interface PlannedDish {
  name: string;
  ingredients: DishIngredient[];
}

const SYSTEM_PROMPT = `You are a meal planner. You will be given: daily nutrition targets,
a user profile (diet type, allergies, region, cooking mediums), a list of available
ingredients with names, and a list of dish names to avoid (recently served).
Compose 3 meals (breakfast, lunch, dinner) for the day using ONLY ingredient names from
the provided list, respecting diet type, allergies, region, and avoiding the excluded dish
names. Each dish must only use cooking techniques achievable with the user's available
cooking mediums.
Respond with ONLY a JSON array, no other text, in this exact shape:
[{"name": "<dish_name>", "ingredients": [{"ingredientName": "<from list>", "grams": <number>}]}]`;

const MAX_ATTEMPTS = 3;
const CALORIE_TOLERANCE = 0.1;

export async function generateDailyPlan(input: {
  targets: Targets;
  profile: UserProfile;
  availableIngredients: Ingredient[];
  excludedDishNames: Set<string>;
}): Promise<PlannedDish[]> {
  const ingredientNames = input.availableIngredients.map((i) => i.name);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            targets: input.targets,
            profile: input.profile,
            availableIngredients: ingredientNames,
            excludeDishNames: [...input.excludedDishNames],
          }),
        },
      ],
    });

    const text = response.content.find((b) => b.type === "text")?.text ?? "[]";
    const plan: PlannedDish[] = JSON.parse(text);

    const totals = sumTotals(
      plan.map((dish) => computeDishTotals(dish.ingredients, input.availableIngredients))
    );

    const withinTolerance =
      Math.abs(totals.calories - input.targets.calories) / input.targets.calories <= CALORIE_TOLERANCE;

    if (withinTolerance) return plan;
  }

  throw new Error(`Could not generate a plan within tolerance after ${MAX_ATTEMPTS} attempts`);
}
```

- [ ] **Step 2: Verify manually**

Run:
```bash
npx tsx -e "
import { generateDailyPlan } from './src/planning/mealPlanGenerator.js';
import { ingredientRepo } from './src/db/repositories/ingredientRepo.js';
ingredientRepo.seedFromFile('./data/ingredients.seed.json');
const plan = await generateDailyPlan({
  targets: { calories: 2000, proteinG: 100, carbsG: 220, fatG: 60, micros: {} },
  profile: { dietType: 'vegetarian', allergies: [], region: 'north-indian', cookingMediums: ['gas-stove'], portionGramsPerMeal: 350 },
  availableIngredients: ingredientRepo.getAll(),
  excludedDishNames: new Set(),
});
console.log(JSON.stringify(plan, null, 2));
"
```
Expected: prints an array of 3 dishes, each using only seeded ingredient names, no thrown error.

- [ ] **Step 3: Commit**

```bash
git add src/planning/mealPlanGenerator.ts
git commit -m "feat: add Claude-powered meal plan generator"
```

---

### Task 14: Recipe writer (Hinglish, cooking-medium aware)

**Files:**
- Create: `src/planning/recipeWriter.ts`

**Interfaces:**
- Consumes: `PlannedDish` (Task 13), `UserProfile.cookingMediums` (Task 4).
- Produces: `writeHinglishInstructions(dish: PlannedDish, cookingMediums: string[]): Promise<string>`.

- [ ] **Step 1: Create `src/planning/recipeWriter.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import type { PlannedDish } from "./mealPlanGenerator.js";

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

const SYSTEM_PROMPT = `Write short, clear cooking instructions in Hinglish (Hindi-English mix,
Latin script) for the given dish, using only the given ingredients and quantities. Pick
whichever ONE of the user's available cooking mediums best suits this dish, and write the
steps specifically for that medium (mention it explicitly, e.g. timing/temperature for an
air fryer vs. stovetop steps for a gas stove). Keep it to 4-6 numbered steps. Respond with
ONLY the instructions text, no preamble.`;

export async function writeHinglishInstructions(
  dish: PlannedDish,
  cookingMediums: string[]
): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: JSON.stringify({ dish, availableCookingMediums: cookingMediums }),
      },
    ],
  });
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

- [ ] **Step 2: Verify manually**

Run:
```bash
npx tsx -e "
import { writeHinglishInstructions } from './src/planning/recipeWriter.js';
const text = await writeHinglishInstructions(
  { name: 'dal_rice', ingredients: [{ ingredientName: 'rice', grams: 200 }, { ingredientName: 'dal', grams: 100 }] },
  ['gas-stove']
);
console.log(text);
"
```
Expected: prints numbered Hinglish steps mentioning the gas stove, no thrown error.

- [ ] **Step 3: Commit**

```bash
git add src/planning/recipeWriter.ts
git commit -m "feat: add Hinglish recipe writer"
```

---

### Task 15: Pipeline orchestrator and message formatter (TDD for formatter)

**Files:**
- Create: `src/pipeline/runDailyPipeline.ts`
- Create: `src/telegram/formatter.ts`
- Create: `src/telegram/formatter.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–14.
- Produces: `runDailyPipeline(): Promise<string>` — returns the final formatted Telegram message; `formatDailyPlanMessage(dishes: { dish: PlannedDish; instructions: string; videoUrl: string | null; substitutions: { from: string; to: string }[] }[], zeptoCheckFailed: boolean): string`.

- [ ] **Step 1: Write failing tests in `src/telegram/formatter.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { formatDailyPlanMessage } from "./formatter.js";

describe("formatDailyPlanMessage", () => {
  it("includes dish name, instructions, and video link when present", () => {
    const message = formatDailyPlanMessage(
      [
        {
          dish: { name: "dal_rice", ingredients: [{ ingredientName: "rice", grams: 200 }] },
          instructions: "1. Cook rice.",
          videoUrl: "https://youtube.com/watch?v=abc",
          substitutions: [],
        },
      ],
      false
    );
    expect(message).toContain("dal_rice");
    expect(message).toContain("1. Cook rice.");
    expect(message).toContain("https://youtube.com/watch?v=abc");
  });

  it("notes substitutions when present", () => {
    const message = formatDailyPlanMessage(
      [
        {
          dish: { name: "paneer_curry", ingredients: [] },
          instructions: "steps",
          videoUrl: null,
          substitutions: [{ from: "paneer", to: "tofu" }],
        },
      ],
      false
    );
    expect(message).toContain("paneer");
    expect(message).toContain("tofu");
  });

  it("flags when the Zepto stock check failed", () => {
    const message = formatDailyPlanMessage([], true);
    expect(message.toLowerCase()).toContain("stock wasn't checked");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/telegram/formatter.test.ts`
Expected: FAIL — `formatter.ts` does not exist.

- [ ] **Step 3: Implement `src/telegram/formatter.ts`**

```ts
import type { PlannedDish } from "../planning/mealPlanGenerator.js";

export interface FormattedDish {
  dish: PlannedDish;
  instructions: string;
  videoUrl: string | null;
  substitutions: { from: string; to: string }[];
}

export function formatDailyPlanMessage(dishes: FormattedDish[], zeptoCheckFailed: boolean): string {
  const parts: string[] = ["🍽 Aaj ka meal plan:\n"];

  if (zeptoCheckFailed) {
    parts.push("⚠️ Zepto stock wasn't checked today — please confirm ingredient availability yourself.\n");
  }

  for (const { dish, instructions, videoUrl, substitutions } of dishes) {
    parts.push(`— ${dish.name} —`);
    for (const sub of substitutions) {
      parts.push(`(swapped ${sub.from} → ${sub.to}, not in stock)`);
    }
    parts.push(instructions);
    if (videoUrl) parts.push(`Video: ${videoUrl}`);
    parts.push("");
  }

  return parts.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/telegram/formatter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create `src/pipeline/runDailyPipeline.ts`**

```ts
import { targetsRepo } from "../db/repositories/targetsRepo.js";
import { userProfileRepo } from "../db/repositories/userProfileRepo.js";
import { ingredientRepo } from "../db/repositories/ingredientRepo.js";
import { planHistoryRepo } from "../db/repositories/planHistoryRepo.js";
import { videoLibraryRepo } from "../db/repositories/videoLibraryRepo.js";
import { excludeRecentDishes } from "../variety/varietyTracker.js";
import { checkAndSubstitute, checkAvailabilityViaZepto } from "../zepto/availabilityChecker.js";
import { generateDailyPlan } from "../planning/mealPlanGenerator.js";
import { writeHinglishInstructions } from "../planning/recipeWriter.js";
import { formatDailyPlanMessage, type FormattedDish } from "../telegram/formatter.js";
import { config } from "../config.js";

export async function runDailyPipeline(): Promise<string> {
  const targets = targetsRepo.getActive();
  const profile = userProfileRepo.get();
  if (!targets || !profile) {
    throw new Error("Cannot run pipeline before onboarding and targets are set");
  }

  const availableIngredients = ingredientRepo.getAll();
  const today = new Date().toISOString().slice(0, 10);
  const history = planHistoryRepo.getServedSince(
    new Date(Date.now() - config.varietyWindowDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const excludedDishNames = excludeRecentDishes(history, today, config.varietyWindowDays);

  const plan = await generateDailyPlan({ targets, profile, availableIngredients, excludedDishNames });

  let zeptoCheckFailed = false;
  const formatted: FormattedDish[] = [];

  for (const dish of plan) {
    let finalIngredients = dish.ingredients;
    let substitutions: { from: string; to: string }[] = [];

    try {
      const result = await checkAndSubstitute(dish.ingredients, availableIngredients, checkAvailabilityViaZepto);
      finalIngredients = result.dish;
      substitutions = result.substitutions;
    } catch (err) {
      zeptoCheckFailed = true;
    }

    const finalDish = { name: dish.name, ingredients: finalIngredients };
    const instructions = await writeHinglishInstructions(finalDish, profile.cookingMediums);
    const videoUrl = videoLibraryRepo.getForDish(dish.name);

    formatted.push({ dish: finalDish, instructions, videoUrl, substitutions });
    planHistoryRepo.recordServed(dish.name, today);
  }

  return formatDailyPlanMessage(formatted, zeptoCheckFailed);
}
```

- [ ] **Step 6: Commit**

```bash
git add src/pipeline/runDailyPipeline.ts src/telegram/formatter.ts src/telegram/formatter.test.ts
git commit -m "feat: add pipeline orchestrator and message formatter"
```

---

### Task 16: Scheduler and app entrypoint

**Files:**
- Create: `src/scheduler/dailyJob.ts`
- Create: `src/index.ts`

**Interfaces:**
- Consumes: `runDailyPipeline` (Task 15), `bot` (Task 8), `config.dailyPlanCron`/`config.telegramChatId`.
- Produces: `scheduleDailyJob(bot: Telegraf): void`; app entrypoint that starts the DB, bot, and scheduler.

- [ ] **Step 1: Create `src/scheduler/dailyJob.ts`**

```ts
import cron from "node-cron";
import type { Telegraf } from "telegraf";
import { config } from "../config.js";
import { runDailyPipeline } from "../pipeline/runDailyPipeline.js";

export function scheduleDailyJob(bot: Telegraf): void {
  cron.schedule(config.dailyPlanCron, async () => {
    try {
      const message = await sendWithRetry();
      await bot.telegram.sendMessage(config.telegramChatId, message);
    } catch (err) {
      await bot.telegram.sendMessage(
        config.telegramChatId,
        `⚠️ Couldn't generate today's plan: ${(err as Error).message}`
      );
    }
  });
}

async function sendWithRetry(): Promise<string> {
  try {
    return await runDailyPipeline();
  } catch {
    return await runDailyPipeline();
  }
}
```

- [ ] **Step 2: Create `src/db/repositories` seed bootstrap and `src/index.ts`**

```ts
import { getDb } from "./db/client.js";
import { ingredientRepo } from "./db/repositories/ingredientRepo.js";
import { bot } from "./telegram/bot.js";
import { registerOnboarding } from "./telegram/onboarding.js";
import { registerTargetsIntake } from "./telegram/targetsIntake.js";
import { registerVideoLinkHandler } from "./telegram/videoLinkHandler.js";
import { scheduleDailyJob } from "./scheduler/dailyJob.js";

getDb();
if (ingredientRepo.getAll().length === 0) {
  ingredientRepo.seedFromFile("./data/ingredients.seed.json");
}

registerOnboarding(bot);
registerTargetsIntake(bot);
registerVideoLinkHandler(bot);
scheduleDailyJob(bot);

bot.launch();
console.log("Butler nutritionist agent running.");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all unit tests (calculator, varietyTracker, availabilityChecker, formatter) PASS.

- [ ] **Step 4: Manual end-to-end verification**

With a real `.env` filled in (Telegram token/chat id, Anthropic key, Zepto MCP reachable per Task 11):
```bash
npm run dev
```
1. Send `/start` on Telegram, complete onboarding.
2. Send a text or screenshot with targets.
3. Temporarily set `DAILY_PLAN_CRON` to a time a minute or two away, restart, and confirm the bot sends a full Hinglish plan message to `TELEGRAM_CHAT_ID` unprompted at that time.
4. Send a YouTube link tagged to one of the dishes named in the plan; confirm a follow-up run includes that video link for that dish.
Expected: all four steps behave as described with no unhandled exceptions in the console.

- [ ] **Step 5: Commit**

```bash
git add src/scheduler/dailyJob.ts src/index.ts
git commit -m "feat: add daily scheduler and app entrypoint"
```

---

## Self-Review Notes

- **Spec coverage:** onboarding (Task 8) incl. cooking mediums; targets intake text+screenshot (Task 9); ingredient-based nutrition math (Task 3); variety window (Task 5); Zepto availability + auto-substitution (Tasks 11–12); Hinglish + medium-aware instructions (Task 14); user-curated video links (Task 10); daily Telegram delivery via scheduler (Task 16); no WhatsApp code anywhere — confirmed absent from all tasks.
- **Zepto MCP tool names are unknown until Task 11 is run against the real server** — Task 11 is a discovery step by design, and Task 12 explicitly flags the placeholder tool name (`check_availability`) to be replaced with what Task 11 finds, with its own verification step (Step 5) to confirm the swap works.
- **Type consistency checked:** `DishIngredient`, `Ingredient`, `NutritionTotals` (Task 3) are reused as-is by Tasks 5, 12, 13, 15 with no renamed fields; `PlannedDish` (Task 13) is reused as-is by Tasks 14–15; `Targets`/`UserProfile` (Task 4) reused as-is by Tasks 13, 15.
