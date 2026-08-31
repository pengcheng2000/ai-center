import { describe, expect, it } from "vitest";
import { parseRssXml } from "./rss";

describe("parseRssXml", () => {
  it("parses AIHOT-style RSS items, keeps the in-feed reader link, and preserves the original entry in content", () => {
    const entries = parseRssXml(`<?xml version="1.0"?><rss><channel><item><title><![CDATA[GPT-5.6 登陆 Kiro]]></title><link>https://aihot.virxact.com/items/demo</link><description><![CDATA[<p>一段可供员工快速阅读的 AI 资讯摘要。</p><p>🔗 <a href="https://openai.com/index/demo">阅读原文</a></p>]]></description><category>AI 模型</category><pubDate>Mon, 24 Aug 2026 12:00:00 GMT</pubDate></item></channel></rss>`);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ title: "GPT-5.6 登陆 Kiro", summary: "一段可供员工快速阅读的 AI 资讯摘要。", link: "https://aihot.virxact.com/items/demo", categories: ["AI 模型"] });
    expect(entries[0]?.content).toContain("原文入口：https://openai.com/index/demo");
    expect(entries[0]?.publishedAt).toEqual(new Date("2026-08-24T12:00:00.000Z"));
  });

  it("drops incomplete items and honors the requested import limit", () => {
    const xml = `<rss><channel>${["一", "二", "三"].map((title, index) => `<item><title>${title}</title><link>https://example.com/${index}</link><description>摘要 ${title}</description></item>`).join("")}<item><title>无链接</title><description>不应导入</description></item></channel></rss>`;
    expect(parseRssXml(xml, 2).map(entry => entry.title)).toEqual(["一", "二"]);
  });
});
