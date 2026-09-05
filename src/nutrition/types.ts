export interface Ingredient {
  name: string;
  caloriesPer100g: number;
  proteinGPer100g: number;
  carbsGPer100g: number;
  fatGPer100g: number;
  fiberGPer100g: number;
  microsPer100g: Record<string, number>;
  tags: string[];
}

export interface DishIngredient {
  ingredientName: string;
  grams: number;
}

export interface NutritionTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  micros: Record<string, number>;
}
