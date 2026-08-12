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
