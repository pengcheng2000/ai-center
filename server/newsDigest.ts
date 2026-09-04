import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  newsDigests,
  newsDigestSettings,
  newsItems,
} from "../drizzle/schema";
import { getDb } from "./db";

export const RSS_SYNC_INTERVALS = [1, 2, 4, 6, 12, 24] as const;
export const NEWS_DIGEST_INTERVALS = [4, 8, 12, 24] as const;
export const DEFAULT_SYNC_INTERVAL_HOURS = 24;
export const DEFAULT_DIGEST_INTERVAL_HOURS = 24;

/**
 * 以北京时间 09:00 为周期锚点生成 UTC 六段 cron。
 * 例如 24 小时 => UTC 01:00，8 小时 => UTC 01:00/09:00/17:00。
 */
export function intervalHoursToCron(intervalHours: number) {
  if (!Number.isInteger(intervalHours) || intervalHours < 1 || 24 % intervalHours !== 0)
    throw new Error("同步间隔必须是 24 小时的整数因子");
  const utcAnchorHour = 1;
  const hours = Array.from(
    { length: 24 / intervalHours },
    (_, index) => (utcAnchorHour + index * intervalHours) % 24
  ).sort((a, b) => a - b);
  return `0 0 ${hours.join(",")} * * *`;
}

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function getNewsDigestSettings(database?: Database) {
  const db = database ?? (await getDb());
  if (!db) throw new Error("数据库暂不可用");
  await db
    .insert(newsDigestSettings)
    .values({ id: 1 })
    .onDuplicateKeyUpdate({ set: { id: 1 } });
  const [settings] = await db
    .select()
    .from(newsDigestSettings)
    .where(eq(newsDigestSettings.id, 1))
    .limit(1);
  if (!settings) throw new Error("资讯摘要配置初始化失败");
  return settings;
}

function digestTitle(now: Date) {
  const date = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return `AI 资讯摘要 · ${date}`;
}

export function buildNewsDigestSummary(
  items: Array<{ title: string; category: string }>
) {
  const categoryCounts = new Map<string, number>();
  for (const item of items)
    categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
  const categories = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .slice(0, 3)
    .map(([category]) => category);
  const highlights = items
    .slice(0, 3)
    .map(item => `《${item.title}》`)
    .join("、");
  return `本期收录 ${items.length} 条已审核资讯${categories.length ? `，重点覆盖${categories.join("、")}` : ""}${highlights ? `；建议优先阅读${highlights}` : ""}。`;
}

export async function generateNewsDigest(now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用");
  try {
    const result = await db.transaction(async tx => {
      const candidates = await tx
        .select({
          id: newsItems.id,
          title: newsItems.title,
          category: newsItems.category,
        })
        .from(newsItems)
        .where(
          and(
            eq(newsItems.reviewStatus, "approved"),
            eq(newsItems.isDeleted, 0),
            isNull(newsItems.digestId)
          )
        )
        .orderBy(desc(newsItems.publishedAt), desc(newsItems.createdAt))
        .limit(50);

      if (!candidates.length)
        return { created: false, itemCount: 0 } as const;

      const [digest] = await tx
        .insert(newsDigests)
        .values({
          title: digestTitle(now),
          summary: buildNewsDigestSummary(candidates),
          itemCount: candidates.length,
          generatedAt: now,
        })
        .$returningId();
      await tx
        .update(newsItems)
        .set({ digestId: digest.id })
        .where(inArray(newsItems.id, candidates.map(item => item.id)));
      return {
        created: true,
        digestId: digest.id,
        itemCount: candidates.length,
      } as const;
    });

    if (!result.created) {
      await db
        .update(newsDigestSettings)
        .set({ lastRunAt: now, lastError: null })
        .where(eq(newsDigestSettings.id, 1));
      return { success: true, created: false, itemCount: 0 } as const;
    }
    await db
      .update(newsDigestSettings)
      .set({ lastRunAt: now, lastGeneratedAt: now, lastError: null })
      .where(eq(newsDigestSettings.id, 1));
    return {
      success: true,
      created: true,
      digestId: result.digestId,
      itemCount: result.itemCount,
    } as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : "资讯摘要生成失败";
    await db
      .update(newsDigestSettings)
      .set({ lastRunAt: now, lastError: message.slice(0, 1000) })
      .where(eq(newsDigestSettings.id, 1));
    throw error;
  }
}
