import "dotenv/config";
import { userProfileRepo } from "../src/db/repositories/userProfileRepo.js";
import { writeHinglishInstructions } from "../src/planning/recipeWriter.js";
import type { DishIngredient } from "../src/nutrition/types.js";

const USAGE = `Usage:
  npm run recipe -- "<dish name>" "<ingredient>:<grams>,..." [--meal-type "Dinner"] [--mediums "gas stove,air fryer"]

Example:
  npm run recipe -- "Paneer Bhurji" "paneer:150,onion:80,tomato:70" --meal-type Dinner`;

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      flags[arg.slice(2)] = argv[++i] ?? "";
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function parseIngredients(spec: string): DishIngredient[] {
  return spec
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.lastIndexOf(":");
      if (idx === -1) throw new Error(`Bad ingredient "${part}" — expected "name:grams"`);
      const ingredientName = part.slice(0, idx).trim();
      const grams = Number(part.slice(idx + 1).trim());
      if (!ingredientName || !Number.isFinite(grams)) {
        throw new Error(`Bad ingredient "${part}" — expected "name:grams"`);
      }
      return { ingredientName, grams };
    });
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [name, ingredientSpec] = positional;

  if (!name || !ingredientSpec) {
    console.error(USAGE);
    process.exit(1);
  }

  const mediums = flags.mediums
    ? flags.mediums.split(",").map((m) => m.trim()).filter(Boolean)
    : userProfileRepo.get()?.cookingMediums;

  if (!mediums?.length) {
    console.error("No cooking mediums found — onboard a profile first or pass --mediums.");
    process.exit(1);
  }

  const dish = {
    name,
    mealType: flags["meal-type"] ?? "Meal",
    ingredients: parseIngredients(ingredientSpec),
  };

  console.log(`Writing instructions for "${dish.name}" (mediums: ${mediums.join(", ")})...\n`);
  console.log(await writeHinglishInstructions(dish, mediums));
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
