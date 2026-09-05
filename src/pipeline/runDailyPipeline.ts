import { targetsRepo } from "../db/repositories/targetsRepo.js";
import { userProfileRepo } from "../db/repositories/userProfileRepo.js";
import { ingredientRepo } from "../db/repositories/ingredientRepo.js";
import { planHistoryRepo } from "../db/repositories/planHistoryRepo.js";
import { videoLibraryRepo } from "../db/repositories/videoLibraryRepo.js";
import { excludeRecentDishes } from "../variety/varietyTracker.js";
import { checkAndSubstitute, checkAvailabilityViaZepto } from "../zepto/availabilityChecker.js";
import { generateDailyPlan } from "../planning/mealPlanGenerator.js";
import { writeHinglishInstructions } from "../planning/recipeWriter.js";
import {
  formatIngredientListMessage,
  formatMealMessage,
  formatSummaryMessage,
  type FormattedDish,
} from "../telegram/formatter.js";
import { computeDishTotals, scaleIngredients, sumTotals } from "../nutrition/calculator.js";
import { config } from "../config.js";

/**
 * Builds the day's plan and returns it as an ordered list of Telegram messages to send:
 * one per meal/snack, then a consolidated shopping list, then a per-person nutrition summary.
 */
export async function runDailyPipeline(): Promise<string[]> {
  const targets = targetsRepo.getActive();
  const profile = userProfileRepo.get();
  if (!targets || !profile) {
    throw new Error("Cannot run pipeline before onboarding and targets are set");
  }

  const availableIngredients = ingredientRepo.getAll();
  const today = new Date().toISOString().slice(0, 10);
  const history = planHistoryRepo.getServedSince(
    new Date(Date.now() - config.varietyWindowDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const excludedDishNames = excludeRecentDishes(history, today, config.varietyWindowDays);

  const plan = await generateDailyPlan({ targets, profile, availableIngredients, excludedDishNames });

  let zeptoCheckFailed = false;
  const formatted: FormattedDish[] = [];

  for (const dish of plan) {
    let finalIngredients = dish.ingredients;
    let substitutions: { from: string; to: string }[] = [];

    try {
      const result = await checkAndSubstitute(dish.ingredients, availableIngredients, checkAvailabilityViaZepto);
      finalIngredients = result.dish;
      substitutions = result.substitutions;
    } catch (err) {
      zeptoCheckFailed = true;
    }

    // Per-person basis — this is what the day's nutrition totals are computed from.
    const finalDish = { name: dish.name, mealType: dish.mealType, ingredients: finalIngredients };

    // Household-scaled basis — this is what the cook actually needs to prepare/buy.
    const scaledIngredients = scaleIngredients(finalIngredients, profile.householdSize);
    const scaledDish = { name: dish.name, mealType: dish.mealType, ingredients: scaledIngredients };

    const instructions = await writeHinglishInstructions(scaledDish, profile.cookingMediums);
    const videoUrl = videoLibraryRepo.getForDish(dish.name);

    formatted.push({ dish: finalDish, scaledIngredients, instructions, videoUrl, substitutions });
  }

  const dayTotals = sumTotals(
    formatted.map((entry) => computeDishTotals(entry.dish.ingredients, availableIngredients))
  );

  const messages = [
    ...formatted.map((entry) => formatMealMessage(entry)),
    formatIngredientListMessage(formatted, profile.householdSize, zeptoCheckFailed),
    formatSummaryMessage(dayTotals, targets),
  ];

  // Only record variety history once every message has been successfully built. If
  // anything above threw, nothing was delivered, so nothing should count as
  // "recently served" on a retry.
  for (const entry of formatted) {
    planHistoryRepo.recordServed(entry.dish.name, today);
  }

  return messages;
}
