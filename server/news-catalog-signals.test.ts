import { describe, expect, it } from "vitest";
import { filterApprovedNews, shapeCatalogNews } from "./db";
import { sortNewsTimeline } from "../shared/newsSignals";

describe("资讯目录时间线与聚合信号", () => {
  const now = new Date("2026-08-25T08:00:00.000Z");
  const rows = [
    { item: { id: 1, content: "这是比摘要更长的正文，用于说明实现背景、操作步骤、实际结果和复盘建议，确保全文识别阈值成立。", summary: "摘要", isFeatured: 1, publishedAt: new Date("2026-08-25T06:00:00.000Z"), createdAt: now }, sourceName: "AIHOT" },
    { item: { id: 2, content: null, summary: "旧资讯摘要", isFeatured: 0, publishedAt: new Date("2026-07-01T08:00:00.000Z"), createdAt: now }, sourceName: "运营台" },
  ];
  it("聚合阅读和收藏次数，并输出时间和价值字段", () => {
    const catalog = shapeCatalogNews(rows, [{ newsId: 1, count: 4 }], [{ newsId: 1, count: 2 }], now);
    expect(catalog[0].item).toMatchObject({ freshness: "今日", valueTier: "运营精选", readCount: 4, favoriteCount: 2, isNew: true });
    expect(catalog[1].item).toMatchObject({ freshness: "历史", valueTier: "精选资讯", readCount: 0, favoriteCount: 0 });
  });
  it("为最新优先和价值优先提供稳定的时间线排序契约", () => {
    const catalog = shapeCatalogNews(rows, [{ newsId: 1, count: 4 }], [{ newsId: 1, count: 2 }], now).map(row => ({ ...row, publishedAt: row.item.publishedAt, valueTier: row.item.valueTier, readCount: row.item.readCount, favoriteCount: row.item.favoriteCount }));
    expect(sortNewsTimeline(catalog, "latest").map(row => row.item.id)).toEqual([1, 2]);
    expect(sortNewsTimeline(catalog, "value").map(row => row.item.id)).toEqual([1, 2]);
  });
  it("仅返回审核通过且未删除的资讯，避免导入草稿在员工端提前展示", () => {
    expect(filterApprovedNews([{ id: 1, reviewStatus: "approved", isDeleted: 0 }, { id: 2, reviewStatus: "pending", isDeleted: 0 }, { id: 3, reviewStatus: "approved", isDeleted: 1 }]).map(item => item.id)).toEqual([1]);
  });
});
