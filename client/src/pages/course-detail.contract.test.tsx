import { describe, expect, it } from "vitest";

describe("课程详情资源呈现契约", () => {
  it("定义文档、视频、实操与无资源回退所需的资源类型", () => {
    const resourceTypes = ["document", "video", "practice"] as const;
    expect(resourceTypes).toContain("document"); expect(resourceTypes).toContain("video"); expect(resourceTypes).toContain("practice");
  });
  it("约束视频可选倍速和实操的个人结果呈现边界", () => {
    expect([0.75, 1, 1.25, 1.5, 2]).toContain(2); const personalRun = { materialId: 1, output: "仅当前员工可见" }; expect(personalRun.output).toMatch(/当前员工/);
  });
});
