import cron from "node-cron";
import type { Telegraf } from "telegraf";
import { config } from "../config.js";
import { runDailyPipeline } from "../pipeline/runDailyPipeline.js";

export function scheduleDailyJob(bot: Telegraf): void {
  cron.schedule(config.dailyPlanCron, async () => {
    try {
      const message = await sendWithRetry();
      await bot.telegram.sendMessage(config.telegramChatId, message);
    } catch (err) {
      await bot.telegram.sendMessage(
        config.telegramChatId,
        `⚠️ Couldn't generate today's plan: ${(err as Error).message}`
      );
    }
  });
}

async function sendWithRetry(): Promise<string> {
  try {
    return await runDailyPipeline();
  } catch {
    return await runDailyPipeline();
  }
}
