import { describe, expect, it } from "vitest";
import {
  buildNewsDigestSummary,
  intervalHoursToCron,
} from "./newsDigest";

describe("news scheduling intervals", () => {
  it("anchors interval cron expressions at 09:00 China Standard Time", () => {
    expect(intervalHoursToCron(24)).toBe("0 0 1 * * *");
    expect(intervalHoursToCron(12)).toBe("0 0 1,13 * * *");
    expect(intervalHoursToCron(8)).toBe("0 0 1,9,17 * * *");
    expect(intervalHoursToCron(4)).toBe("0 0 1,5,9,13,17,21 * * *");
  });

  it("rejects intervals that cannot evenly divide one day", () => {
    expect(() => intervalHoursToCron(0)).toThrow("同步间隔");
    expect(() => intervalHoursToCron(5)).toThrow("同步间隔");
    expect(() => intervalHoursToCron(2.5)).toThrow("同步间隔");
  });
});

describe("employee news digest copy", () => {
  it("summarizes item count, leading categories, and reading highlights", () => {
    const summary = buildNewsDigestSummary([
      { title: "模型能力更新", category: "模型趋势" },
      { title: "企业落地案例", category: "企业实践" },
      { title: "推理成本观察", category: "模型趋势" },
      { title: "提示词教程", category: "学习资源" },
    ]);
    expect(summary).toContain("本期收录 4 条已审核资讯");
    expect(summary).toContain("模型趋势、企业实践、学习资源");
    expect(summary).toContain("《模型能力更新》");
  });
});
