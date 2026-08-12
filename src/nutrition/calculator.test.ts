import { describe, expect, it } from "vitest";
import { computeDishTotals, sumTotals } from "./calculator.js";
import type { Ingredient } from "./types.js";

const rice: Ingredient = {
  name: "rice",
  caloriesPer100g: 130,
  proteinGPer100g: 2.7,
  carbsGPer100g: 28,
  fatGPer100g: 0.3,
  microsPer100g: { ironMg: 0.2 },
  tags: [],
};

const dal: Ingredient = {
  name: "dal",
  caloriesPer100g: 116,
  proteinGPer100g: 9,
  carbsGPer100g: 20,
  fatGPer100g: 0.4,
  microsPer100g: { ironMg: 1.5 },
  tags: [],
};

describe("computeDishTotals", () => {
  it("scales nutrition by grams and sums across ingredients", () => {
    const totals = computeDishTotals(
      [
        { ingredientName: "rice", grams: 200 },
        { ingredientName: "dal", grams: 100 },
      ],
      [rice, dal]
    );
    expect(totals.calories).toBeCloseTo(130 * 2 + 116 * 1, 3);
    expect(totals.proteinG).toBeCloseTo(2.7 * 2 + 9, 3);
    expect(totals.micros.ironMg).toBeCloseTo(0.2 * 2 + 1.5, 3);
  });

  it("throws if an ingredient is missing from the lookup list", () => {
    expect(() =>
      computeDishTotals([{ ingredientName: "ghost", grams: 50 }], [rice])
    ).toThrow(/ghost/);
  });
});

describe("sumTotals", () => {
  it("adds calories/macros/micros across multiple totals", () => {
    const a = { calories: 100, proteinG: 5, carbsG: 10, fatG: 2, micros: { ironMg: 1 } };
    const b = { calories: 200, proteinG: 10, carbsG: 20, fatG: 4, micros: { ironMg: 2 } };
    const result = sumTotals([a, b]);
    expect(result).toEqual({ calories: 300, proteinG: 15, carbsG: 30, fatG: 6, micros: { ironMg: 3 } });
  });
});
