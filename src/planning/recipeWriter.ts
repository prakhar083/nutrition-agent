import { runClaude } from "../anthropic/client.js";
import type { PlannedDish } from "./mealPlanGenerator.js";

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
  return runClaude({
    model: "claude-opus-5",
    systemPrompt: SYSTEM_PROMPT,
    userText: JSON.stringify({ dish, availableCookingMediums: cookingMediums }),
  });
}
