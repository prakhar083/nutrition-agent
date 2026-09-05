import { getDb } from "../client.js";

export interface UserProfile {
  dietType: string;
  allergies: string[];
  region: string;
  cookingMediums: string[];
  mealsPerDay: number;
  snacksPerDay: number;
  preferenceNotes: string;
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
      mealsPerDay: row.meals_per_day,
      snacksPerDay: row.snacks_per_day,
      preferenceNotes: row.preference_notes,
    };
  },

  upsert(profile: UserProfile): void {
    getDb()
      .prepare(
        `INSERT INTO user_profile (id, diet_type, allergies, region, cooking_mediums, meals_per_day, snacks_per_day, preference_notes, updated_at)
         VALUES (1, @dietType, @allergies, @region, @cookingMediums, @mealsPerDay, @snacksPerDay, @preferenceNotes, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           diet_type = @dietType,
           allergies = @allergies,
           region = @region,
           cooking_mediums = @cookingMediums,
           meals_per_day = @mealsPerDay,
           snacks_per_day = @snacksPerDay,
           preference_notes = @preferenceNotes,
           updated_at = datetime('now')`
      )
      .run({
        dietType: profile.dietType,
        allergies: JSON.stringify(profile.allergies),
        region: profile.region,
        cookingMediums: JSON.stringify(profile.cookingMediums),
        mealsPerDay: profile.mealsPerDay,
        snacksPerDay: profile.snacksPerDay,
        preferenceNotes: profile.preferenceNotes,
      });
  },
};
