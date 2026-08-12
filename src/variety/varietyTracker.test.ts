import { describe, expect, it } from "vitest";
import { excludeRecentDishes } from "./varietyTracker.js";

describe("excludeRecentDishes", () => {
  it("excludes dishes served within the window", () => {
    const excluded = excludeRecentDishes(
      [{ dishName: "dal_rice", servedOn: "2026-08-05" }],
      "2026-08-11",
      14
    );
    expect(excluded.has("dal_rice")).toBe(true);
  });

  it("does not exclude dishes served outside the window", () => {
    const excluded = excludeRecentDishes(
      [{ dishName: "dal_rice", servedOn: "2026-07-01" }],
      "2026-08-11",
      14
    );
    expect(excluded.has("dal_rice")).toBe(false);
  });

  it("returns an empty set when history is empty", () => {
    expect(excludeRecentDishes([], "2026-08-11", 14).size).toBe(0);
  });
});
