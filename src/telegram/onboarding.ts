import type { Telegraf } from "telegraf";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { userProfileRepo } from "../db/repositories/userProfileRepo.js";

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

type Step = "diet" | "allergies" | "region" | "cookingMediums" | "portion" | "existingPlan" | "done";

interface Session {
  step: Step;
  dietType?: string;
  allergies?: string[];
  region?: string;
  cookingMediums?: string[];
  portionGramsPerMeal?: number;
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
  portion: "What's your target portion size per meal, in grams? (e.g. 350)",
  existingPlan: "Do you have an existing meal plan (e.g. from a previous dietician)? Send it as text or a screenshot, or type 'skip'.",
  done: "You're all set! Send me your calorie/macro targets (text or a screenshot) whenever you're ready.",
};

const PREFERENCE_EXTRACTION_PROMPT = `The user is sharing a previous meal plan. Extract general taste/style
preference signals from it as a short free-text note (2-4 sentences): favorite ingredients,
cuisines, typical macro split, meal style. Do NOT list it as dishes to repeat verbatim — this
is soft guidance for a future planner, not a plan to copy. Respond with ONLY the note text,
no preamble.`;

async function extractPreferenceNotes(content: Anthropic.MessageParam["content"]): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 512,
    system: PREFERENCE_EXTRACTION_PROMPT,
    messages: [{ role: "user", content }],
  });
  return response.content.find((b) => b.type === "text")?.text ?? "";
}

function completeOnboarding(chatId: number, session: Session, preferenceNotes: string, ctx: any) {
  userProfileRepo.upsert({
    dietType: session.dietType!,
    allergies: session.allergies!,
    region: session.region!,
    cookingMediums: session.cookingMediums!,
    portionGramsPerMeal: session.portionGramsPerMeal!,
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
      try {
        const photo = ctx.message.photo.at(-1)!;
        const fileLink = await ctx.telegram.getFileLink(photo.file_id);
        const imageResponse = await fetch(fileLink.toString());
        const base64 = Buffer.from(await imageResponse.arrayBuffer()).toString("base64");
        const notes = await extractPreferenceNotes([
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
        ]);
        completeOnboarding(ctx.chat.id, session, notes, ctx);
      } catch (err) {
        console.error("Failed to process existing-plan photo:", err);
        session.processing = false;
        await ctx.reply(RETRY_MESSAGE);
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
        session.step = "portion";
        return ctx.reply(PROMPTS.portion);
      case "portion": {
        const grams = Number(text);
        if (!Number.isFinite(grams) || grams <= 0) {
          return ctx.reply("Please send a positive number of grams.");
        }
        session.portionGramsPerMeal = grams;
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
            const notes = await extractPreferenceNotes([{ type: "text", text }]);
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
