import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import type { PlannedDish } from "./mealPlanGenerator.js";

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

const SYSTEM_PROMPT = `Write short, clear cooking instructions in Hinglish (Hindi-English mix,
Latin script) for the given dish, using only the given ingredients and quantities. Pick
whichever ONE of the user's available cooking mediums best suits this dish, and write the
steps specifically for that medium (mention it explicitly, e.g. timing/temperature for an
air fryer vs. stovetop steps for a gas stove). Keep it to 4-6 numbered steps. Respond with
ONLY the instructions text, no preamble.`;

export async function writeHinglishInstructions(
  dish: PlannedDish,
  cookingMediums: string[]
): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: JSON.stringify({ dish, availableCookingMediums: cookingMediums }),
      },
    ],
  });
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
