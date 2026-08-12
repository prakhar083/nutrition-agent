import { getDb } from "./db/client.js";
import { ingredientRepo } from "./db/repositories/ingredientRepo.js";
import { bot } from "./telegram/bot.js";
import { registerOnboarding } from "./telegram/onboarding.js";
import { registerTargetsIntake } from "./telegram/targetsIntake.js";
import { registerVideoLinkHandler } from "./telegram/videoLinkHandler.js";
import { scheduleDailyJob } from "./scheduler/dailyJob.js";

getDb();
if (ingredientRepo.getAll().length === 0) {
  ingredientRepo.seedFromFile("./data/ingredients.seed.json");
}

// Order matters. Onboarding first: its numeric "portion" step must win over targets
// intake. Video links next: targets intake claims any message containing a digit, and a
// "dish_name <youtube link>" message usually does, so the video handler must see it first.
registerOnboarding(bot);
registerVideoLinkHandler(bot);
registerTargetsIntake(bot);
scheduleDailyJob(bot);

bot.launch();
console.log("Butler nutritionist agent running.");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
