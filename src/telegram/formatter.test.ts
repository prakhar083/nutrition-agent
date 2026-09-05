import { describe, expect, it } from "vitest";
import { formatIngredientListMessage, formatMealMessage, formatSummaryMessage } from "./formatter.js";
import type { FormattedDish } from "./formatter.js";
import type { NutritionTotals } from "../nutrition/types.js";
import type { Targets } from "../db/repositories/targetsRepo.js";

describe("formatMealMessage", () => {
  it("includes meal type, dish name, instructions, and video link when present", () => {
    const message = formatMealMessage({
      dish: { name: "dal_rice", mealType: "Lunch", ingredients: [{ ingredientName: "rice", grams: 200 }] },
      scaledIngredients: [{ ingredientName: "rice", grams: 200 }],
      instructions: "1. Cook rice.",
      videoUrl: "https://youtube.com/watch?v=abc",
      substitutions: [],
    });
    expect(message).toContain("Lunch");
    expect(message).toContain("dal_rice");
    expect(message).toContain("1. Cook rice.");
    expect(message).toContain("https://youtube.com/watch?v=abc");
  });

  it("notes substitutions when present", () => {
    const message = formatMealMessage({
      dish: { name: "paneer_curry", mealType: "Dinner", ingredients: [] },
      scaledIngredients: [],
      instructions: "steps",
      videoUrl: null,
      substitutions: [{ from: "paneer", to: "tofu" }],
    });
    expect(message).toContain("paneer");
    expect(message).toContain("tofu");
  });
});

describe("formatIngredientListMessage", () => {
  const twoDishes: FormattedDish[] = [
    {
      dish: { name: "dish_a", mealType: "Breakfast", ingredients: [] },
      scaledIngredients: [{ ingredientName: "rice", grams: 200 }, { ingredientName: "dal", grams: 50 }],
      instructions: "",
      videoUrl: null,
      substitutions: [],
    },
    {
      dish: { name: "dish_b", mealType: "Lunch", ingredients: [] },
      scaledIngredients: [{ ingredientName: "rice", grams: 100 }],
      instructions: "",
      videoUrl: null,
      substitutions: [],
    },
  ];

  it("aggregates the same ingredient across dishes and shows household size", () => {
    const message = formatIngredientListMessage(twoDishes, 2, false);
    expect(message).toContain("serves 2");
    expect(message).toContain("rice: 300g");
    expect(message).toContain("dal: 50g");
  });

  it("flags when the Zepto stock check failed", () => {
    const message = formatIngredientListMessage(twoDishes, 1, true);
    expect(message.toLowerCase()).toContain("stock wasn't checked");
  });
});

describe("formatSummaryMessage", () => {
  it("shows totals vs targets for calories, protein, carbs, fat, and fiber", () => {
    const totals: NutritionTotals = { calories: 2195.6, proteinG: 154.3, carbsG: 228.7, fatG: 72.9, fiberG: 29.8, micros: {} };
    const targets: Targets = { calories: 2200, proteinG: 154, carbsG: 231, fatG: 73.3, fiberG: 30, micros: {} };

    const message = formatSummaryMessage(totals, targets);

    expect(message).toContain("2196 kcal (target 2200 kcal)");
    expect(message).toContain("Protein: 154.3g (target 154g)");
    expect(message).toContain("Carbs: 228.7g (target 231g)");
    expect(message).toContain("Fat: 72.9g (target 73.3g)");
    expect(message).toContain("Fiber: 29.8g (target 30g)");
  });
});
