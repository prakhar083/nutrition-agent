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
