import { describe, expect, it } from "vitest";
import { resolveNewsArticlePresentation } from "../client/src/lib/newsArticle";
import { extractOriginalSourceUrl, stripAggregatorFootnotes } from "../shared/news";

describe("news article presentation", () => {
  it("strips the aggregator footnote, keeps the body clean, and promotes the original entry URL over the feed link", () => {
    const presentation = resolveNewsArticlePresentation({
      content: "这是允许再分发的完整正文。\n\n原文入口：https://example.com/original",
      summary: "简短摘要",
      sourceUrl: "https://aihot.virxact.com/items/full-text",
    });
    expect(presentation).toEqual({ body: "这是允许再分发的完整正文。", sourceUrl: "https://example.com/original" });
  });

  it("falls back to the RSS feed link when the content has no original entry marker", () => {
    const presentation = resolveNewsArticlePresentation({ content: "普通正文，没有聚合样板行。", summary: "简短摘要", sourceUrl: "https://aihot.virxact.com/items/plain" });
    expect(presentation).toEqual({ body: "普通正文，没有聚合样板行。", sourceUrl: "https://aihot.virxact.com/items/plain" });
  });

  it("falls back to the summary when a source only permits excerpt delivery", () => {
    expect(resolveNewsArticlePresentation({ content: "   ", summary: "只提供摘要与阅读入口的条目。", sourceUrl: null })).toEqual({ body: "只提供摘要与阅读入口的条目。", sourceUrl: null });
  });

  it("removes inline AIHOT aggregator footnotes from the body", () => {
    const stripped = stripAggregatorFootnotes("腾讯混元 3 正式版上线第一周，Token 调用量增长 68 倍。 🔗 阅读原文 via AIHOT · https://aihot.virxact.com/items/x\n\n原文入口：https://www.ithome.com/0/995/136.htm");
    expect(stripped).toBe("腾讯混元 3 正式版上线第一周，Token 调用量增长 68 倍。");
    expect(extractOriginalSourceUrl(stripped)).toBeNull();
  });

  it("extracts the original entry URL from raw aggregator content", () => {
    const raw = "Ox Alpha = GLM-5.3 Flash AA = 57。 —— 本文由 AIHOT 聚合整理，完整版与更多 AI 动态见 https://aihot.virxact.com/items/a\n\n原文入口：https://x.com/jietang/status/1";
    expect(extractOriginalSourceUrl(raw)).toBe("https://x.com/jietang/status/1");
    expect(stripAggregatorFootnotes(raw)).toBe("Ox Alpha = GLM-5.3 Flash AA = 57。");
  });

  it("decodes HTML-escaped entities in the original entry URL so the link stays accessible", () => {
    const raw = "正文。\n\n原文入口：https://mp.weixin.qq.com/s?__biz=MzkwODU2OTQyNQ%3D%3D&amp;mid=2247498484&amp;idx=1&amp;sn=0db140a12b8e18601ac933788045c831";
    expect(extractOriginalSourceUrl(raw)).toBe("https://mp.weixin.qq.com/s?__biz=MzkwODU2OTQyNQ%3D%3D&mid=2247498484&idx=1&sn=0db140a12b8e18601ac933788045c831");
  });

  it("ignores truncated or non-http entry markers", () => {
    expect(extractOriginalSourceUrl("正文。\n\n原文入口：待补充")).toBeNull();
    expect(extractOriginalSourceUrl("没有入口标记的正文。")).toBeNull();
  });
});
