import fs from "node:fs/promises";
import type { Telegraf } from "telegraf";
import { runClaude } from "../anthropic/client.js";
import { userProfileRepo } from "../db/repositories/userProfileRepo.js";
import { downloadTelegramPhotoToTempFile } from "./downloadPhoto.js";

type Step = "diet" | "allergies" | "region" | "cookingMediums" | "mealsPerDay" | "snacksPerDay" | "existingPlan" | "done";

interface Session {
  step: Step;
  dietType?: string;
  allergies?: string[];
  region?: string;
  cookingMediums?: string[];
  mealsPerDay?: number;
  snacksPerDay?: number;
  processing?: boolean;
}

const RETRY_MESSAGE = "Sorry, couldn't process that — please try again or type 'skip'.";
const STILL_PROCESSING_MESSAGE = "Still processing your last message, one sec...";

const sessions = new Map<number, Session>();

const PROMPTS: Record<Step, string> = {
  diet: "Let's set you up. What's your diet type? (vegetarian / non-vegetarian / eggetarian / vegan)",
  allergies: "Any allergies or dislikes? Comma-separated, or 'none'.",
  region: "Which regional cuisine do you prefer? (north-indian / south-indian / east-indian / west-indian)",
  cookingMediums: "What cooking mediums do you have available? Comma-separated (e.g. gas-stove, convection-microwave, air-fryer, otg, induction).",
  mealsPerDay: "How many meals do you want per day? (e.g. 3)",
  snacksPerDay: "Any snacks in between? How many per day? (e.g. 0, 1, 2)",
  existingPlan: "Do you have an existing meal plan (e.g. from a previous dietician)? Send it as text or a screenshot, or type 'skip'.",
  done: "You're all set! Send me your calorie/macro targets (text or a screenshot) whenever you're ready.",
};

const PREFERENCE_EXTRACTION_PROMPT = `The user is sharing a previous meal plan. Extract general taste/style
preference signals from it as a short free-text note (2-4 sentences): favorite ingredients,
cuisines, typical macro split, meal style. Do NOT list it as dishes to repeat verbatim — this
is soft guidance for a future planner, not a plan to copy. Respond with ONLY the note text,
no preamble.`;

async function extractPreferenceNotes(input: { text: string } | { imagePath: string }): Promise<string> {
  return runClaude({
    model: "claude-sonnet-5",
    systemPrompt: PREFERENCE_EXTRACTION_PROMPT,
    userText: "text" in input ? input.text : undefined,
    imagePath: "imagePath" in input ? input.imagePath : undefined,
  });
}

function completeOnboarding(chatId: number, session: Session, preferenceNotes: string, ctx: any) {
  userProfileRepo.upsert({
    dietType: session.dietType!,
    allergies: session.allergies!,
    region: session.region!,
    cookingMediums: session.cookingMediums!,
    mealsPerDay: session.mealsPerDay!,
    snacksPerDay: session.snacksPerDay!,
    preferenceNotes,
  });
  sessions.delete(chatId);
  return ctx.reply(PROMPTS.done);
}

export function registerOnboarding(bot: Telegraf): void {
  bot.command("start", (ctx) => {
    sessions.set(ctx.chat.id, { step: "diet" });
    ctx.reply(PROMPTS.diet);
  });

  bot.on("photo", (ctx, next) => {
    const session = sessions.get(ctx.chat.id);
    if (!session || session.step !== "existingPlan") return next();

    if (session.processing) {
      return ctx.reply(STILL_PROCESSING_MESSAGE);
    }

    session.processing = true;
    (async () => {
      let imagePath: string | undefined;
      try {
        imagePath = await downloadTelegramPhotoToTempFile(ctx);
        const notes = await extractPreferenceNotes({ imagePath });
        completeOnboarding(ctx.chat.id, session, notes, ctx);
      } catch (err) {
        console.error("Failed to process existing-plan photo:", err);
        session.processing = false;
        await ctx.reply(RETRY_MESSAGE);
      } finally {
        if (imagePath) await fs.unlink(imagePath).catch(() => {});
      }
    })();
  });

  bot.on("text", (ctx, next) => {
    const session = sessions.get(ctx.chat.id);
    if (!session) return next();

    const text = ctx.message.text.trim();

    switch (session.step) {
      case "diet":
        session.dietType = text.toLowerCase();
        session.step = "allergies";
        return ctx.reply(PROMPTS.allergies);
      case "allergies":
        session.allergies = text.toLowerCase() === "none" ? [] : text.split(",").map((s) => s.trim());
        session.step = "region";
        return ctx.reply(PROMPTS.region);
      case "region":
        session.region = text.toLowerCase();
        session.step = "cookingMediums";
        return ctx.reply(PROMPTS.cookingMediums);
      case "cookingMediums":
        session.cookingMediums = text.split(",").map((s) => s.trim().toLowerCase());
        session.step = "mealsPerDay";
        return ctx.reply(PROMPTS.mealsPerDay);
      case "mealsPerDay": {
        const count = Number(text);
        if (!Number.isInteger(count) || count <= 0) {
          return ctx.reply("Please send a positive whole number of meals.");
        }
        session.mealsPerDay = count;
        session.step = "snacksPerDay";
        return ctx.reply(PROMPTS.snacksPerDay);
      }
      case "snacksPerDay": {
        const count = Number(text);
        if (!Number.isInteger(count) || count < 0) {
          return ctx.reply("Please send a whole number of snacks (0 or more).");
        }
        session.snacksPerDay = count;
        session.step = "existingPlan";
        return ctx.reply(PROMPTS.existingPlan);
      }
      case "existingPlan": {
        if (session.processing) {
          return ctx.reply(STILL_PROCESSING_MESSAGE);
        }
        if (text.toLowerCase() === "skip") {
          return completeOnboarding(ctx.chat.id, session, "", ctx);
        }
        session.processing = true;
        return (async () => {
          try {
            const notes = await extractPreferenceNotes({ text });
            return completeOnboarding(ctx.chat.id, session, notes, ctx);
          } catch (err) {
            console.error("Failed to process existing-plan text:", err);
            session.processing = false;
            return ctx.reply(RETRY_MESSAGE);
          }
        })();
      }
      default:
        return next();
    }
  });
}
