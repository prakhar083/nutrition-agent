import { describe, expect, it } from "vitest";
import { formatDailyPlanMessage } from "./formatter.js";
import type { NutritionTotals } from "../nutrition/types.js";
import type { Targets } from "../db/repositories/targetsRepo.js";

const zeroTotals: NutritionTotals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, micros: {} };
const zeroTargets: Targets = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, micros: {} };

const sampleTotals: NutritionTotals = {
  calories: 2195.6,
  proteinG: 154.3,
  carbsG: 228.7,
  fatG: 72.9,
  fiberG: 29.8,
  micros: {},
};

const sampleTargets: Targets = { calories: 2200, proteinG: 154, carbsG: 231, fatG: 73.3, fiberG: 30, micros: {} };

describe("formatDailyPlanMessage", () => {
  it("includes dish name, instructions, and video link when present", () => {
    const message = formatDailyPlanMessage(
      [
        {
          dish: { name: "dal_rice", ingredients: [{ ingredientName: "rice", grams: 200 }] },
          instructions: "1. Cook rice.",
          videoUrl: "https://youtube.com/watch?v=abc",
          substitutions: [],
        },
      ],
      false,
      zeroTotals,
      zeroTargets
    );
    expect(message).toContain("dal_rice");
    expect(message).toContain("1. Cook rice.");
    expect(message).toContain("https://youtube.com/watch?v=abc");
  });

  it("notes substitutions when present", () => {
    const message = formatDailyPlanMessage(
      [
        {
          dish: { name: "paneer_curry", ingredients: [] },
          instructions: "steps",
          videoUrl: null,
          substitutions: [{ from: "paneer", to: "tofu" }],
        },
      ],
      false,
      zeroTotals,
      zeroTargets
    );
    expect(message).toContain("paneer");
    expect(message).toContain("tofu");
  });

  it("flags when the Zepto stock check failed", () => {
    const message = formatDailyPlanMessage([], true, zeroTotals, zeroTargets);
    expect(message.toLowerCase()).toContain("stock wasn't checked");
  });

  it("appends a totals-vs-targets summary for calories, protein, carbs, fat, and fiber", () => {
    const message = formatDailyPlanMessage([], false, sampleTotals, sampleTargets);
    expect(message).toContain("2196 kcal (2200 kcal)");
    expect(message).toContain("Protein: 154.3g (154g)");
    expect(message).toContain("Carbs: 228.7g (231g)");
    expect(message).toContain("Fat: 72.9g (73.3g)");
    expect(message).toContain("Fiber: 29.8g (30g)");
  });
});
