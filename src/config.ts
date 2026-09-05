import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  telegramChatId: required("TELEGRAM_CHAT_ID"),
  zeptoMcpUrl: process.env.ZEPTO_MCP_URL ?? "https://mcp.zepto.co.in/mcp",
  dailyPlanCron: process.env.DAILY_PLAN_CRON ?? "0 7 * * *",
  varietyWindowDays: Number(process.env.VARIETY_WINDOW_DAYS ?? "14"),
  dbPath: process.env.DB_PATH ?? "./data/butler.db",
};
