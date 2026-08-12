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
a user profile (diet type, allergies, region, cooking mediums, and optional free-text
preference notes extracted from a previous meal plan), a list of available ingredients
with names, and a list of dish names to avoid (recently served).
Compose 3 meals (breakfast, lunch, dinner) for the day using ONLY ingredient names from
the provided list, respecting diet type, allergies, region, and avoiding the excluded dish
names. Each dish must only use cooking techniques achievable with the user's available
cooking mediums. Treat preference notes as soft style guidance (favor similar ingredients/
cuisines/macro balance) — do NOT treat them as specific dishes to repeat.
Respond with ONLY a JSON array, no other text, in this exact shape:
[{"name": "<dish_name>", "ingredients": [{"ingredientName": "<from list>", "grams": <number>}]}]`;

const MAX_ATTEMPTS = 3;
const CALORIE_TOLERANCE = 0.1;

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
  const ingredientNames = input.availableIngredients.map((i) => i.name);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
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
      const plan = parsePlan(text);
      if (plan === null) {
        // Malformed response from this attempt — try again rather than throwing.
        continue;
      }

      const totals = sumTotals(
        plan.map((dish) => computeDishTotals(dish.ingredients, input.availableIngredients))
      );

      const withinTolerance =
        Math.abs(totals.calories - input.targets.calories) / input.targets.calories <=
        CALORIE_TOLERANCE;

      if (withinTolerance) return plan;
    } catch {
      // A failure on this attempt (API error, unknown ingredient, etc.) should not
      // crash the whole function — fall through and retry, up to MAX_ATTEMPTS.
      continue;
    }
  }

  throw new Error(`Could not generate a plan within tolerance after ${MAX_ATTEMPTS} attempts`);
}
