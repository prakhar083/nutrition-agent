import { describe, expect, it } from "vitest";
import { formatDailyPlanMessage } from "./formatter.js";

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
      false
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
      false
    );
    expect(message).toContain("paneer");
    expect(message).toContain("tofu");
  });

  it("flags when the Zepto stock check failed", () => {
    const message = formatDailyPlanMessage([], true);
    expect(message.toLowerCase()).toContain("stock wasn't checked");
  });
});
