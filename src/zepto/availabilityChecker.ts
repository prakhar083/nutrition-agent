import type { Ingredient, DishIngredient } from "../nutrition/types.js";

export type StockLookup = (ingredientName: string) => Promise<boolean>;

export async function checkAndSubstitute(
  dish: DishIngredient[],
  candidates: Ingredient[],
  isAvailable: StockLookup
): Promise<{ dish: DishIngredient[]; substitutions: { from: string; to: string }[] }> {
  const byName = new Map(candidates.map((c) => [c.name, c]));
  const substitutions: { from: string; to: string }[] = [];
  const resultDish: DishIngredient[] = [];

  for (const item of dish) {
    if (await isAvailable(item.ingredientName)) {
      resultDish.push(item);
      continue;
    }
    const original = byName.get(item.ingredientName);
    const sameTag = original?.tags[0];
    const substitute = candidates.find(
      (c) => c.name !== item.ingredientName && sameTag && c.tags.includes(sameTag)
    );
    if (!substitute) {
      throw new Error(`No available substitute for ${item.ingredientName}`);
    }
    let available = false;
    for (const attempt of [substitute, ...candidates.filter((c) => c !== substitute && c.tags.includes(sameTag!))]) {
      if (await isAvailable(attempt.name)) {
        resultDish.push({ ingredientName: attempt.name, grams: item.grams });
        substitutions.push({ from: item.ingredientName, to: attempt.name });
        available = true;
        break;
      }
    }
    if (!available) {
      throw new Error(`No available substitute for ${item.ingredientName}`);
    }
  }

  return { dish: resultDish, substitutions };
}

/**
 * Adapts the real Zepto MCP client to the `StockLookup` shape.
 *
 * Task 11 (Zepto MCP tool discovery) is blocked: Zepto's own OAuth server
 * has an infrastructure outage (their Redis is out of memory), so we were
 * never able to authenticate, list tools, or discover the real tool
 * name/schema. There is no `src/zepto/TOOLS.md` and no confirmed tool name.
 *
 * Rather than guess a tool name and silently call `client.callTool` with
 * something that was never verified against the real server — which would
 * look like a working integration when it isn't — this throws clearly.
 * Callers (the pipeline, a later task) are expected to treat a thrown/failed
 * Zepto check as an expected fallback case: generate the plan without
 * availability filtering and flag it to the user.
 */
export async function checkAvailabilityViaZepto(_ingredientName: string): Promise<boolean> {
  throw new Error(
    "Zepto MCP integration not yet wired — pending Task 11 tool discovery (blocked by a Zepto-side outage)"
  );
}
