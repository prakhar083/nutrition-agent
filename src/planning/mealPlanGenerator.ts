import { runClaude } from "../anthropic/client.js";
import { computeDishTotals, sumTotals } from "../nutrition/calculator.js";
import type { DishIngredient, Ingredient } from "../nutrition/types.js";
import type { Targets } from "../db/repositories/targetsRepo.js";
import type { UserProfile } from "../db/repositories/userProfileRepo.js";

export interface PlannedDish {
  name: string;
  ingredients: DishIngredient[];
}

const SYSTEM_PROMPT = `You are a meal planner. You will be given: daily nutrition targets,
a user profile (diet type, allergies, region, cooking mediums, meals per day, snacks per
day, and optional free-text preference notes extracted from a previous meal plan), a list
of available ingredients — EACH WITH ITS EXACT calories/protein/carbs/fat/fiber PER 100
GRAMS — and a list of dish names to avoid (recently served).
Compose exactly profile.mealsPerDay meals plus profile.snacksPerDay snacks for the day
(e.g. mealsPerDay=3, snacksPerDay=1 means 3 meals + 1 snack = 4 total dishes), using ONLY
ingredient names from the provided list, respecting diet type, allergies, region, and
avoiding the excluded dish names.
Do the arithmetic explicitly: using each ingredient's given per-100g values and your chosen
gram amount, compute that ingredient's contribution (value * grams / 100), then sum across
every ingredient in every dish. Your final combined totals across all dishes MUST land
within 10% of every one of the daily targets (calories, protein, carbs, fat, AND fiber) —
not just calories. Do not rely on memorized/typical nutrition values for these
ingredients — use ONLY the exact per-100g figures given to you in this prompt, since those
are what your plan will actually be checked against. If a previous attempt's totals are
given below, they are wrong (missed the target) — adjust portions/ingredients from that
attempt rather than guessing fresh; do not repeat the same total.
Snacks should generally be smaller portions than meals, but the exact split is your
judgment. Each dish must only use cooking techniques achievable with the user's available
cooking mediums. Treat preference notes as soft style guidance (favor similar
ingredients/cuisines/macro balance) — do NOT treat them as specific dishes to repeat.
Respond with ONLY a JSON array, no other text, in this exact shape:
[{"name": "<dish_name>", "ingredients": [{"ingredientName": "<from list>", "grams": <number>}]}]`;

const MAX_ATTEMPTS = 5;
const TOLERANCE = 0.1;

export function withinTolerance(actual: number, target: number, tolerance: number): boolean {
  if (target === 0) return Math.abs(actual) <= tolerance;
  return Math.abs(actual - target) / target <= tolerance;
}

function parsePlan(text: string): PlannedDish[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) return null;

  for (const dish of parsed) {
    if (
      typeof dish !== "object" ||
      dish === null ||
      typeof (dish as any).name !== "string" ||
      !Array.isArray((dish as any).ingredients)
    ) {
      return null;
    }
    for (const ingredient of (dish as any).ingredients) {
      if (
        typeof ingredient !== "object" ||
        ingredient === null ||
        typeof ingredient.ingredientName !== "string" ||
        typeof ingredient.grams !== "number"
      ) {
        return null;
      }
    }
  }

  return parsed as PlannedDish[];
}

export async function generateDailyPlan(input: {
  targets: Targets;
  profile: UserProfile;
  availableIngredients: Ingredient[];
  excludedDishNames: Set<string>;
}): Promise<PlannedDish[]> {
  const availableIngredients = input.availableIngredients.map((i) => ({
    name: i.name,
    caloriesPer100g: i.caloriesPer100g,
    proteinGPer100g: i.proteinGPer100g,
    carbsGPer100g: i.carbsGPer100g,
    fatGPer100g: i.fatGPer100g,
    fiberGPer100g: i.fiberGPer100g,
  }));

  let previousAttemptTotals: ReturnType<typeof sumTotals> | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const resultText = await runClaude({
        model: "claude-opus-5",
        systemPrompt: SYSTEM_PROMPT,
        userText: JSON.stringify({
          targets: input.targets,
          profile: input.profile,
          availableIngredients,
          excludeDishNames: [...input.excludedDishNames],
          previousAttemptTotals,
        }),
      });

      const plan = parsePlan(resultText);
      if (plan === null) {
        // Malformed response from this attempt — try again rather than throwing.
        continue;
      }

      const totals = sumTotals(
        plan.map((dish) => computeDishTotals(dish.ingredients, input.availableIngredients))
      );

      const hitsTargets =
        withinTolerance(totals.calories, input.targets.calories, TOLERANCE) &&
        withinTolerance(totals.proteinG, input.targets.proteinG, TOLERANCE) &&
        withinTolerance(totals.carbsG, input.targets.carbsG, TOLERANCE) &&
        withinTolerance(totals.fatG, input.targets.fatG, TOLERANCE) &&
        withinTolerance(totals.fiberG, input.targets.fiberG, TOLERANCE);

      if (hitsTargets) return plan;

      previousAttemptTotals = totals;
      console.error(
        `Meal plan generation attempt ${attempt + 1}/${MAX_ATTEMPTS} missed tolerance.`,
        `targets=${JSON.stringify(input.targets)}`,
        `totals=${JSON.stringify(totals)}`
      );
    } catch (err) {
      // A failure on this attempt (API error, unknown ingredient, etc.) should not
      // crash the whole function — fall through and retry, up to MAX_ATTEMPTS.
      // Log it so an auth/rate-limit failure is distinguishable from a parse failure.
      console.error(`Meal plan generation attempt ${attempt + 1}/${MAX_ATTEMPTS} failed:`, err);
      continue;
    }
  }

  throw new Error(`Could not generate a plan within tolerance after ${MAX_ATTEMPTS} attempts`);
}
