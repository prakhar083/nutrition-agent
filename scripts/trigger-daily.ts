import { Telegraf } from "telegraf";
import { config } from "../src/config.js";
import { runDailyPipeline } from "../src/pipeline/runDailyPipeline.js";

async function main() {
  const bot = new Telegraf(config.telegramBotToken);
  console.log("Running daily pipeline...");
  try {
    const message = await runDailyPipeline();
    console.log("--- MESSAGE ---");
    console.log(message);
    console.log("--- SENDING ---");
    await bot.telegram.sendMessage(config.telegramChatId, message);
    console.log("Sent!");
  } catch (err) {
    console.error("Pipeline failed:", err);
    await bot.telegram.sendMessage(
      config.telegramChatId,
      `⚠️ Couldn't generate today's plan: ${(err as Error).message}`
    );
  }
}

main();
