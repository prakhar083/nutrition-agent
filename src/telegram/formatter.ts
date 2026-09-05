import type { PlannedDish } from "../planning/mealPlanGenerator.js";
import type { DishIngredient, NutritionTotals } from "../nutrition/types.js";
import type { Targets } from "../db/repositories/targetsRepo.js";

export interface FormattedDish {
  /** Per-person dish (name, mealType, ingredients) — the basis for the day's totals. */
  dish: PlannedDish;
  /** Same ingredients scaled for household size — the basis for instructions and the shopping list. */
  scaledIngredients: DishIngredient[];
  instructions: string;
  videoUrl: string | null;
  substitutions: { from: string; to: string }[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function mealEmoji(mealType: string): string {
  const lower = mealType.toLowerCase();
  if (lower.includes("breakfast") || lower.includes("brunch")) return "🌅";
  if (lower.includes("lunch")) return "🍛";
  if (lower.includes("dinner")) return "🌙";
  if (lower.includes("morning") && lower.includes("snack")) return "🍎";
  if (lower.includes("evening") && lower.includes("snack")) return "☕";
  if (lower.includes("night") && lower.includes("snack")) return "🌃";
  if (lower.includes("snack")) return "🍿";
  return "🍽️";
}

export function formatMealMessage(formatted: FormattedDish): string {
  const { dish, instructions, videoUrl, substitutions } = formatted;
  const parts: string[] = [`${mealEmoji(dish.mealType)} ${dish.mealType}: ${dish.name}\n`];

  for (const sub of substitutions) {
    parts.push(`🔄 Swapped ${sub.from} → ${sub.to} (not in stock)`);
  }

  parts.push(instructions);
  if (videoUrl) parts.push(`\n🎥 Video: ${videoUrl}`);

  return parts.join("\n");
}

export function formatIngredientListMessage(
  dishes: FormattedDish[],
  householdSize: number,
  zeptoCheckFailed: boolean
): string {
  const totalsByIngredient = new Map<string, number>();
  for (const { scaledIngredients } of dishes) {
    for (const item of scaledIngredients) {
      totalsByIngredient.set(item.ingredientName, (totalsByIngredient.get(item.ingredientName) ?? 0) + item.grams);
    }
  }

  const parts: string[] = [`🛒 Shopping list for today (serves ${householdSize}):\n`];

  if (zeptoCheckFailed) {
    parts.push("⚠️ Zepto stock wasn't checked today — please confirm availability yourself.\n");
  }

  const sortedNames = [...totalsByIngredient.keys()].sort((a, b) => a.localeCompare(b));
  for (const name of sortedNames) {
    parts.push(`• ${name}: ${totalsByIngredient.get(name)}g`);
  }

  return parts.join("\n");
}

export function formatSummaryMessage(totals: NutritionTotals, targets: Targets): string {
  const parts: string[] = ["📊 Nutrition Summary (per person):\n"];
  parts.push(`🔥 Calories: ${Math.round(totals.calories)} kcal (target ${Math.round(targets.calories)} kcal)`);
  parts.push(`💪 Protein: ${round1(totals.proteinG)}g (target ${round1(targets.proteinG)}g)`);
  parts.push(`🍞 Carbs: ${round1(totals.carbsG)}g (target ${round1(targets.carbsG)}g)`);
  parts.push(`🧈 Fat: ${round1(totals.fatG)}g (target ${round1(targets.fatG)}g)`);
  parts.push(`🌾 Fiber: ${round1(totals.fiberG)}g (target ${round1(targets.fiberG)}g)`);

  return parts.join("\n");
}
