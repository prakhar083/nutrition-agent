import { targetsRepo } from "../db/repositories/targetsRepo.js";
import { userProfileRepo } from "../db/repositories/userProfileRepo.js";
import { ingredientRepo } from "../db/repositories/ingredientRepo.js";
import { planHistoryRepo } from "../db/repositories/planHistoryRepo.js";
import { videoLibraryRepo } from "../db/repositories/videoLibraryRepo.js";
import { excludeRecentDishes } from "../variety/varietyTracker.js";
import { checkAndSubstitute, checkAvailabilityViaZepto } from "../zepto/availabilityChecker.js";
import { generateDailyPlan } from "../planning/mealPlanGenerator.js";
import { writeHinglishInstructions } from "../planning/recipeWriter.js";
import { formatDailyPlanMessage, type FormattedDish } from "../telegram/formatter.js";
import { config } from "../config.js";

export async function runDailyPipeline(): Promise<string> {
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

    const finalDish = { name: dish.name, ingredients: finalIngredients };
    const instructions = await writeHinglishInstructions(finalDish, profile.cookingMediums);
    const videoUrl = videoLibraryRepo.getForDish(dish.name);

    formatted.push({ dish: finalDish, instructions, videoUrl, substitutions });
    planHistoryRepo.recordServed(dish.name, today);
  }

  return formatDailyPlanMessage(formatted, zeptoCheckFailed);
}
