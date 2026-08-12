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

registerOnboarding(bot);
registerTargetsIntake(bot);
registerVideoLinkHandler(bot);
scheduleDailyJob(bot);

bot.launch();
console.log("Butler nutritionist agent running.");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
