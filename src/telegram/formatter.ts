import type { PlannedDish } from "../planning/mealPlanGenerator.js";
import type { NutritionTotals } from "../nutrition/types.js";
import type { Targets } from "../db/repositories/targetsRepo.js";

export interface FormattedDish {
  dish: PlannedDish;
  instructions: string;
  videoUrl: string | null;
  substitutions: { from: string; to: string }[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatDailyPlanMessage(
  dishes: FormattedDish[],
  zeptoCheckFailed: boolean,
  totals: NutritionTotals,
  targets: Targets
): string {
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

  parts.push("📊 Din ka total (target):");
  parts.push(`Calories: ${Math.round(totals.calories)} kcal (${Math.round(targets.calories)} kcal)`);
  parts.push(`Protein: ${round1(totals.proteinG)}g (${round1(targets.proteinG)}g)`);
  parts.push(`Carbs: ${round1(totals.carbsG)}g (${round1(targets.carbsG)}g)`);
  parts.push(`Fat: ${round1(totals.fatG)}g (${round1(targets.fatG)}g)`);
  parts.push(`Fiber: ${round1(totals.fiberG)}g (${round1(targets.fiberG)}g)`);

  return parts.join("\n");
}
