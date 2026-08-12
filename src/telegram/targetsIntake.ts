import type { Telegraf } from "telegraf";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, firstText } from "../anthropic/client.js";
import { targetsRepo } from "../db/repositories/targetsRepo.js";
import { YOUTUBE_URL_RE } from "./videoLinkHandler.js";

const RETRY_MESSAGE = "Sorry, couldn't read that — please try again.";
const INVALID_TARGETS_MESSAGE =
  "Couldn't parse valid targets from that — please send calories plus protein/carbs/fat and try again.";

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
    max_tokens: 8000,
    system: EXTRACTION_PROMPT,
    messages: [{ role: "user", content }],
  });
  return JSON.parse(firstText(response, "{}"));
}

function isPositiveNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Guards the DB against malformed Claude output: all four macro fields must be
 * finite positive numbers, and `micros` (if present) must be a plain object of numbers.
 */
export function isValidTargets(obj: unknown): obj is ExtractedTargets {
  if (typeof obj !== "object" || obj === null) return false;
  const candidate = obj as Record<string, unknown>;

  for (const key of ["calories", "proteinG", "carbsG", "fatG"] as const) {
    if (!isPositiveNumber(candidate[key])) return false;
  }

  const micros = candidate.micros;
  if (micros !== undefined) {
    if (typeof micros !== "object" || micros === null || Array.isArray(micros)) return false;
    for (const value of Object.values(micros as Record<string, unknown>)) {
      if (typeof value !== "number" || !Number.isFinite(value)) return false;
    }
  }

  return true;
}

export function registerTargetsIntake(bot: Telegraf): void {
  bot.on("text", async (ctx, next) => {
    // A dish-name + YouTube link message contains digits but belongs to the video
    // handler, so hand it on rather than treating it as targets text.
    if (YOUTUBE_URL_RE.test(ctx.message.text)) return next();
    if (!/\d/.test(ctx.message.text)) return next();
    try {
      const result = await extractTargets([{ type: "text", text: ctx.message.text }]);
      if ("error" in result) return ctx.reply(`Couldn't parse targets: ${result.error}`);
      if (!isValidTargets(result)) return ctx.reply(INVALID_TARGETS_MESSAGE);
      targetsRepo.setActive({ ...result, micros: result.micros ?? {} });
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
      if (!isValidTargets(result)) return ctx.reply(INVALID_TARGETS_MESSAGE);
      targetsRepo.setActive({ ...result, micros: result.micros ?? {} });
      return ctx.reply(
        `Got it — ${result.calories} kcal, P${result.proteinG}/C${result.carbsG}/F${result.fatG}g. This takes effect from tomorrow's plan.`
      );
    } catch (err) {
      console.error("Failed to process targets photo:", err);
      return ctx.reply(RETRY_MESSAGE);
    }
  });
}
