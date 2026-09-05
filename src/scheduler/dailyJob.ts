import cron from "node-cron";
import type { Telegraf } from "telegraf";
import { config } from "../config.js";
import { runDailyPipeline } from "../pipeline/runDailyPipeline.js";

const MESSAGE_SEND_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function scheduleDailyJob(bot: Telegraf): void {
  cron.schedule(config.dailyPlanCron, async () => {
    try {
      const messages = await sendWithRetry();
      for (const message of messages) {
        await bot.telegram.sendMessage(config.telegramChatId, message);
        await sleep(MESSAGE_SEND_DELAY_MS);
      }
    } catch (err) {
      await bot.telegram.sendMessage(
        config.telegramChatId,
        `⚠️ Couldn't generate today's plan: ${(err as Error).message}`
      );
    }
  });
}

async function sendWithRetry(): Promise<string[]> {
  try {
    return await runDailyPipeline();
  } catch {
    return await runDailyPipeline();
  }
}
