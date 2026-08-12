import { getDb } from "../client.js";

export interface UserProfile {
  dietType: string;
  allergies: string[];
  region: string;
  cookingMediums: string[];
  portionGramsPerMeal: number | null;
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
      portionGramsPerMeal: row.portion_grams_per_meal,
      preferenceNotes: row.preference_notes,
    };
  },

  upsert(profile: UserProfile): void {
    getDb()
      .prepare(
        `INSERT INTO user_profile (id, diet_type, allergies, region, cooking_mediums, portion_grams_per_meal, preference_notes, updated_at)
         VALUES (1, @dietType, @allergies, @region, @cookingMediums, @portionGramsPerMeal, @preferenceNotes, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           diet_type = @dietType,
           allergies = @allergies,
           region = @region,
           cooking_mediums = @cookingMediums,
           portion_grams_per_meal = @portionGramsPerMeal,
           preference_notes = @preferenceNotes,
           updated_at = datetime('now')`
      )
      .run({
        dietType: profile.dietType,
        allergies: JSON.stringify(profile.allergies),
        region: profile.region,
        cookingMediums: JSON.stringify(profile.cookingMediums),
        portionGramsPerMeal: profile.portionGramsPerMeal,
        preferenceNotes: profile.preferenceNotes,
      });
  },
};
