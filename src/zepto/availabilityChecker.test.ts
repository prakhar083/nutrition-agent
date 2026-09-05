import { describe, expect, it } from "vitest";
import { checkAndSubstitute } from "./availabilityChecker.js";
import type { Ingredient } from "../nutrition/types.js";

const paneer: Ingredient = {
  name: "paneer", caloriesPer100g: 265, proteinGPer100g: 18, carbsGPer100g: 3.4, fatGPer100g: 20.8, fiberGPer100g: 0, microsPer100g: {}, tags: ["dairy"],
};
const tofu: Ingredient = {
  name: "tofu", caloriesPer100g: 76, proteinGPer100g: 8, carbsGPer100g: 1.9, fatGPer100g: 4.8, fiberGPer100g: 0.3, microsPer100g: {}, tags: ["dairy"],
};
const rice: Ingredient = {
  name: "rice", caloriesPer100g: 130, proteinGPer100g: 2.7, carbsGPer100g: 28, fatGPer100g: 0.3, fiberGPer100g: 0.4, microsPer100g: {}, tags: ["grain"],
};

describe("checkAndSubstitute", () => {
  it("leaves the dish unchanged when everything is available", async () => {
    const isAvailable = async () => true;
    const result = await checkAndSubstitute(
      [{ ingredientName: "rice", grams: 200 }],
      [rice],
      isAvailable
    );
    expect(result.dish).toEqual([{ ingredientName: "rice", grams: 200 }]);
    expect(result.substitutions).toEqual([]);
  });

  it("substitutes an unavailable ingredient with a same-tag candidate", async () => {
    const isAvailable = async (name: string) => name !== "paneer";
    const result = await checkAndSubstitute(
      [{ ingredientName: "paneer", grams: 150 }],
      [paneer, tofu],
      isAvailable
    );
    expect(result.dish).toEqual([{ ingredientName: "tofu", grams: 150 }]);
    expect(result.substitutions).toEqual([{ from: "paneer", to: "tofu" }]);
  });

  it("throws if no substitute with a matching tag is available", async () => {
    const isAvailable = async () => false;
    await expect(
      checkAndSubstitute([{ ingredientName: "rice", grams: 200 }], [rice], isAvailable)
    ).rejects.toThrow(/no available substitute/i);
  });
});
