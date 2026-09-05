import { getDb } from "../client.js";

export interface Targets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
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
      fiberG: row.fiber_g,
      micros: JSON.parse(row.micros_json),
    };
  },

  setActive(targets: Targets): void {
    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare("UPDATE targets SET active = 0 WHERE active = 1").run();
      db.prepare(
        `INSERT INTO targets (calories, protein_g, carbs_g, fat_g, fiber_g, micros_json, active)
         VALUES (@calories, @proteinG, @carbsG, @fatG, @fiberG, @microsJson, 1)`
      ).run({ ...targets, microsJson: JSON.stringify(targets.micros) });
    });
    tx();
  },
};
