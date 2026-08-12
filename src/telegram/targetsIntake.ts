import type { Telegraf } from "telegraf";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { targetsRepo } from "../db/repositories/targetsRepo.js";

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

const RETRY_MESSAGE = "Sorry, couldn't read that — please try again.";

const EXTRACTION_PROMPT = `Extract daily nutrition targets from the user's message (text or image).
Respond with ONLY a JSON object matching this exact shape, no other text:
{"calories": number, "proteinG": number, "carbsG": number, "fatG": number, "micros": {"<name>": number, ...}}
If the targets are ambiguous or incomplete, respond with exactly: {"error": "<what is missing or unclear>"}`;

interface ExtractedTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  micros: Record<string, number>;
}

interface ExtractionError {
  error: string;
}

async function extractTargets(
  content: Anthropic.MessageParam["content"]
): Promise<ExtractedTargets | ExtractionError> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: EXTRACTION_PROMPT,
    messages: [{ role: "user", content }],
  });
  const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
  return JSON.parse(text);
}

export function registerTargetsIntake(bot: Telegraf): void {
  bot.on("text", async (ctx, next) => {
    if (!/\d/.test(ctx.message.text)) return next();
    try {
      const result = await extractTargets([{ type: "text", text: ctx.message.text }]);
      if ("error" in result) return ctx.reply(`Couldn't parse targets: ${result.error}`);
      targetsRepo.setActive(result);
      return ctx.reply(
        `Got it — ${result.calories} kcal, P${result.proteinG}/C${result.carbsG}/F${result.fatG}g. This takes effect from tomorrow's plan.`
      );
    } catch (err) {
      console.error("Failed to process targets text:", err);
      return ctx.reply(RETRY_MESSAGE);
    }
  });

  bot.on("photo", async (ctx) => {
    try {
      const photo = ctx.message.photo.at(-1)!;
      const fileLink = await ctx.telegram.getFileLink(photo.file_id);
      const imageResponse = await fetch(fileLink.toString());
      const base64 = Buffer.from(await imageResponse.arrayBuffer()).toString("base64");
      const result = await extractTargets([
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
      ]);
      if ("error" in result) return ctx.reply(`Couldn't parse targets from the image: ${result.error}`);
      targetsRepo.setActive(result);
      return ctx.reply(
        `Got it — ${result.calories} kcal, P${result.proteinG}/C${result.carbsG}/F${result.fatG}g. This takes effect from tomorrow's plan.`
      );
    } catch (err) {
      console.error("Failed to process targets photo:", err);
      return ctx.reply(RETRY_MESSAGE);
    }
  });
}
