import { describe, expect, it } from "vitest";
import { deriveNewsSignals } from "../shared/newsSignals";

describe("资讯时间与价值信号", () => {
  const now = new Date("2026-08-25T08:00:00.000Z");
  it("将 24 小时内资讯标记为今日和新内容", () => {
    expect(deriveNewsSignals({ content: null, summary: "摘要", isFeatured: 0, publishedAt: new Date("2026-08-25T04:00:00.000Z"), createdAt: now }, now)).toMatchObject({ freshness: "今日", valueTier: "精选资讯", isNew: true });
  });
  it("将运营精选和完整正文提升为可解释的价值层级", () => {
    expect(deriveNewsSignals({ content: "这是足够长的正文内容，用于说明企业案例的上下文、实施过程、结果和可复用方法。", summary: "简短摘要", isFeatured: 1, publishedAt: new Date("2026-08-20T08:00:00.000Z"), createdAt: now }, now)).toMatchObject({ freshness: "近 7 天", valueTier: "运营精选", isNew: false });
    expect(deriveNewsSignals({ content: "这是足够长的正文内容，用于说明企业案例的上下文、实施过程、结果和可复用方法，并补充团队角色、数据边界、验证指标、异常处理和持续复盘安排，确保内容长度明显超过摘要并可以被识别为完整解读。", summary: "简短摘要", isFeatured: 0, publishedAt: new Date("2026-07-01T08:00:00.000Z"), createdAt: now }, now)).toMatchObject({ freshness: "历史", valueTier: "全文解读" });
  });
});
