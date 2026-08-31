import { isFullTextNews } from "./news";

export type NewsSignalInput = { content: string | null; summary: string; isFeatured: number; publishedAt: Date | null; createdAt: Date };
export type NewsFreshness = "今日" | "近 7 天" | "近期" | "历史";
export type NewsValueTier = "运营精选" | "全文解读" | "精选资讯";

export function deriveNewsSignals(item: NewsSignalInput, now = new Date()) {
  const publishedAt = item.publishedAt ?? item.createdAt;
  const ageHours = Math.max(0, (now.getTime() - publishedAt.getTime()) / 3_600_000);
  const freshness: NewsFreshness = ageHours < 24 ? "今日" : ageHours < 24 * 7 ? "近 7 天" : ageHours < 24 * 30 ? "近期" : "历史";
  const valueTier: NewsValueTier = item.isFeatured ? "运营精选" : isFullTextNews(item) ? "全文解读" : "精选资讯";
  return { publishedAt, freshness, valueTier, isNew: ageHours < 24 };
}

export type TimelineSignal = { publishedAt: Date; valueTier: NewsValueTier; readCount: number; favoriteCount: number };
const valueRank: Record<NewsValueTier, number> = { "运营精选": 3, "全文解读": 2, "精选资讯": 1 };
export function sortNewsTimeline<T extends TimelineSignal>(rows: T[], mode: "latest" | "value") {
  return [...rows].sort((a, b) => mode === "latest" ? b.publishedAt.getTime() - a.publishedAt.getTime() : (valueRank[b.valueTier] - valueRank[a.valueTier]) || (b.readCount + b.favoriteCount * 2) - (a.readCount + a.favoriteCount * 2));
}
