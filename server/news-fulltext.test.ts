import { describe, expect, it } from "vitest";
import { isFullTextNews } from "../shared/news";

describe("精选全文识别", () => {
  it("仅将明显长于摘要的内联正文标为精选全文", () => {
    expect(isFullTextNews({ summary: "简短摘要", content: "简短摘要".repeat(40) })).toBe(true);
  });

  it("不会将空正文或接近摘要长度的内容误标为全文", () => {
    expect(isFullTextNews({ summary: "简短摘要", content: null })).toBe(false);
    expect(isFullTextNews({ summary: "简短摘要", content: "简短摘要补充信息" })).toBe(false);
  });
});
