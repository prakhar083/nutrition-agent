import { afterEach, describe, expect, it, vi } from "vitest";
import { generateDailyPlan, withinTolerance } from "./mealPlanGenerator.js";
import type { Ingredient } from "../nutrition/types.js";
import type { Targets } from "../db/repositories/targetsRepo.js";
import type { UserProfile } from "../db/repositories/userProfileRepo.js";

describe("withinTolerance", () => {
  it("accepts a value within the tolerance band", () => {
    expect(withinTolerance(105, 100, 0.1)).toBe(true);
    expect(withinTolerance(95, 100, 0.1)).toBe(true);
  });

  it("rejects a value outside the tolerance band", () => {
    expect(withinTolerance(115, 100, 0.1)).toBe(false);
    expect(withinTolerance(85, 100, 0.1)).toBe(false);
  });

  it("treats a zero target as requiring the actual value to be near zero", () => {
    expect(withinTolerance(0, 0, 0.1)).toBe(true);
    expect(withinTolerance(0.05, 0, 0.1)).toBe(true);
    expect(withinTolerance(5, 0, 0.1)).toBe(false);
  });
});

const runClaude = vi.fn();

vi.mock("../anthropic/client.js", () => ({
  runClaude: (...args: unknown[]) => runClaude(...args),
}));

function claudeResponse(plan: unknown): string {
  return JSON.stringify(plan);
}

const rice: Ingredient = {
  name: "rice",
  caloriesPer100g: 130,
  proteinGPer100g: 2.7,
  carbsGPer100g: 28,
  fatGPer100g: 0.3,
  microsPer100g: {},
  tags: [],
};

const chicken: Ingredient = {
  name: "chicken_breast",
  caloriesPer100g: 165,
  proteinGPer100g: 31,
  carbsGPer100g: 0,
  fatGPer100g: 3.6,
  microsPer100g: {},
  tags: [],
};

// Targets set to exactly match onTargetPlan's totals (rice 100g + chicken 200g),
// so it's unambiguous which plan should be accepted.
const targets: Targets = { calories: 460, proteinG: 64.7, carbsG: 28, fatG: 7.5, micros: {} };

const profile: UserProfile = {
  dietType: "non-vegetarian",
  allergies: [],
  region: "north-indian",
  cookingMediums: ["gas-stove"],
  portionGramsPerMeal: 300,
  preferenceNotes: "",
};

const onTargetPlan = [
  { name: "chicken_rice_bowl", ingredients: [{ ingredientName: "rice", grams: 100 }, { ingredientName: "chicken_breast", grams: 200 }] },
];

// Same total calories as onTargetPlan (460) via a different rice/chicken ratio, but
// protein/carbs/fat land far outside tolerance — the old calories-only check would
// have accepted this; the macro-aware check must reject it.
const caloriesOkMacrosOffPlan = [
  { name: "rice_heavy_bowl", ingredients: [{ ingredientName: "rice", grams: 300 }, { ingredientName: "chicken_breast", grams: 42.42 }] },
];

describe("generateDailyPlan macro gating", () => {
  afterEach(() => {
    runClaude.mockReset();
  });

  it("rejects a plan whose calories are within tolerance but macros are not, and retries", async () => {
    runClaude
      .mockResolvedValueOnce(claudeResponse(caloriesOkMacrosOffPlan))
      .mockResolvedValueOnce(claudeResponse(caloriesOkMacrosOffPlan))
      .mockResolvedValueOnce(claudeResponse(caloriesOkMacrosOffPlan));

    await expect(
      generateDailyPlan({
        targets,
        profile,
        availableIngredients: [rice, chicken],
        excludedDishNames: new Set(),
      })
    ).rejects.toThrow(/Could not generate a plan within tolerance/);

    expect(runClaude).toHaveBeenCalledTimes(3);
  });

  it("accepts a plan once calories, protein, carbs, and fat are all within tolerance", async () => {
    runClaude
      .mockResolvedValueOnce(claudeResponse(caloriesOkMacrosOffPlan))
      .mockResolvedValueOnce(claudeResponse(onTargetPlan));

    const plan = await generateDailyPlan({
      targets,
      profile,
      availableIngredients: [rice, chicken],
      excludedDishNames: new Set(),
    });

    expect(plan).toEqual(onTargetPlan);
    expect(runClaude).toHaveBeenCalledTimes(2);
  });
});
