import type { DishIngredient, Ingredient, NutritionTotals } from "./types.js";

export function computeDishTotals(
  dish: DishIngredient[],
  ingredients: Ingredient[]
): NutritionTotals {
  const byName = new Map(ingredients.map((i) => [i.name, i]));
  const totals: NutritionTotals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, micros: {} };

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
    totals.fiberG += ingredient.fiberGPer100g * factor;
    for (const [key, value] of Object.entries(ingredient.microsPer100g)) {
      totals.micros[key] = (totals.micros[key] ?? 0) + value * factor;
    }
  }
  return totals;
}

export function sumTotals(totalsList: NutritionTotals[]): NutritionTotals {
  const result: NutritionTotals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, micros: {} };
  for (const t of totalsList) {
    result.calories += t.calories;
    result.proteinG += t.proteinG;
    result.carbsG += t.carbsG;
    result.fatG += t.fatG;
    result.fiberG += t.fiberG;
    for (const [key, value] of Object.entries(t.micros)) {
      result.micros[key] = (result.micros[key] ?? 0) + value;
    }
  }
  return result;
}
