// 课程详情错误态回归契约：接口失败不能伪装成“暂无/维护中”资源。
// 这样数据库迁移或服务异常会给用户可操作的重试入口，而不是误导内容运营排查方向。
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(import.meta.dirname, "CourseDetail.tsx"), "utf8");

describe("课程详情资源错误态契约", () => {
  it("显式区分加载失败、重试与真正的空资源状态", () => {
    expect(source).toContain("experienceIsError");
    expect(source).toContain("refetchExperience");
    expect(source).toContain("课程资源加载失败");
    expect(source).toContain("本课程暂无可学习资源");
    expect(source).not.toContain("课程资源正在复审或维护中");
  });
});
