import { eq, sql } from "drizzle-orm";
import { newsItems, newsSources } from "../drizzle/schema";
import { extractOriginalSourceUrl, stripAggregatorFootnotes } from "../shared/news";
import { getDb } from "./db";
import { fetchRssEntries } from "./rss";

export type RssSyncResult = { success: true; sourceId: number; sourceName: string; fetched: number; created: number; updated: number; skipped: number };

export async function syncRssSourceById(sourceId: number, maxItems = 50): Promise<RssSyncResult> {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用");
  const [source] = await db.select().from(newsSources).where(eq(newsSources.id, sourceId)).limit(1);
  if (!source) throw new Error("资讯源不存在");
  if (!source.isEnabled) throw new Error("资讯源已归档，请恢复启用后再同步");
  if (source.sourceType !== "rss") throw new Error("当前仅支持 RSS 类型资讯源的同步");
  const entries = await fetchRssEntries(source.url, maxItems);
  const existing = await db.select({ id: newsItems.id, title: newsItems.title, sourceUrl: newsItems.sourceUrl, content: newsItems.content }).from(newsItems).where(eq(newsItems.sourceId, source.id));
  const existingByUrl = new Map(existing.filter((item): item is { id: number; title: string; sourceUrl: string; content: string | null } => Boolean(item.sourceUrl)).map(item => [item.sourceUrl, item]));
  const existingByTitle = new Map(existing.map(item => [item.title, item]));
  // 去重双保险：既匹配 RSS 条目链接，也匹配标题——sourceUrl 升级为真实原文地址后，
  // 条目链接可能不再与库存一致，标题匹配可避免同一篇文章被重复导入。
  const findExisting = (entry: { link: string; title: string }) => existingByUrl.get(entry.link) ?? existingByTitle.get(entry.title);
  // 聚合源正文尾部的“原文入口：URL”指向真实原文地址，优先于 RSS 条目的聚合页链接；
  // 样板行（AIHOT 聚合整理声明等）不入库，避免阅读页出现重复的原文链接。
  const resolveSourceUrl = (entryContent: string, fallback: string) => extractOriginalSourceUrl(entryContent) ?? fallback;
  const imported = entries.filter(entry => !findExisting(entry)).map(entry => ({
    sourceId: source.id,
    title: entry.title,
    summary: entry.summary,
    content: entry.content ? stripAggregatorFootnotes(entry.content) || null : null,
    sourceUrl: entry.content ? resolveSourceUrl(entry.content, entry.link) : entry.link,
    category: source.category,
    tags: Array.from(new Set([source.category, ...entry.categories])).slice(0, 12),
    reviewStatus: "pending" as const,
    riskLevel: "low" as const,
    publishedAt: entry.publishedAt ?? new Date(),
  }));
  const upgrades = entries.flatMap(entry => {
    const current = findExisting(entry);
    if (!current || entry.content.length <= (current.content?.length ?? 0)) return [];
    return [{ id: current.id, summary: entry.summary, content: stripAggregatorFootnotes(entry.content), sourceUrl: resolveSourceUrl(entry.content, current.sourceUrl ?? entry.link), tags: Array.from(new Set([source.category, ...entry.categories])).slice(0, 12), publishedAt: entry.publishedAt ?? new Date() }];
  });
  if (imported.length) await db.insert(newsItems).values(imported);
  for (const upgrade of upgrades) await db.update(newsItems).set({ summary: upgrade.summary, content: upgrade.content, sourceUrl: upgrade.sourceUrl, tags: upgrade.tags, publishedAt: upgrade.publishedAt }).where(eq(newsItems.id, upgrade.id));
  await db.update(newsSources).set({ lastProcessedAt: new Date(), totalProcessed: sql`${newsSources.totalProcessed} + ${imported.length}` }).where(eq(newsSources.id, source.id));
  return { success: true, sourceId: source.id, sourceName: source.name, fetched: entries.length, created: imported.length, updated: upgrades.length, skipped: entries.length - imported.length - upgrades.length };
}
