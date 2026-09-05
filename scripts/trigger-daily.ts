import { Telegraf } from "telegraf";
import { config } from "../src/config.js";
import { runDailyPipeline } from "../src/pipeline/runDailyPipeline.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const bot = new Telegraf(config.telegramBotToken);
  console.log("Running daily pipeline...");
  try {
    const messages = await runDailyPipeline();
    for (const [i, message] of messages.entries()) {
      console.log(`--- MESSAGE ${i + 1}/${messages.length} ---`);
      console.log(message);
      console.log("--- SENDING ---");
      await bot.telegram.sendMessage(config.telegramChatId, message);
      await sleep(400);
    }
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
