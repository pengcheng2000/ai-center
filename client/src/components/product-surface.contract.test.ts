import { describe, expect, it } from "vitest";
import { PRODUCT_TONE_CLASSES } from "./ProductSurface";

describe("product surface tone contract", () => {
  it("keeps every product area on the coordinated low-saturation palette", () => {
    expect(Object.keys(PRODUCT_TONE_CLASSES)).toEqual(["neutral", "learning", "work", "community", "news", "graphite"]);
    expect(PRODUCT_TONE_CLASSES.learning.icon).toContain("indigo-100");
    expect(PRODUCT_TONE_CLASSES.work.icon).toContain("orange-100");
    expect(PRODUCT_TONE_CLASSES.community.icon).toContain("emerald-100");
    expect(PRODUCT_TONE_CLASSES.news.icon).toContain("blue-100");
  });
});
