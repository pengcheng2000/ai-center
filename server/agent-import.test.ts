import { describe, expect, it } from "vitest";
import { agentCoursePayloadSchema, agentNewsPayloadSchema, hashAgentImportToken, isSafeExternalLink, issueAgentImportToken, replaceAssetTokens, sanitizeImportedMarkdown } from "./agentImport";

describe("外部 Agent 内容导入安全契约", () => {
  it("签发不可预测令牌，并且仅存储可校验哈希", () => {
    const issued = issueAgentImportToken();
    expect(issued.token).toMatch(/^aeh_imp_[A-Za-z0-9_-]{40,}$/);
    expect(issued.tokenPrefix).toBe(issued.token.slice(0, 20));
    expect(hashAgentImportToken(issued.token)).toBe(issued.tokenHash);
  });

  it("拒绝私网、凭据 URL 和非 HTTP(S) 来源", () => {
    expect(isSafeExternalLink("https://example.com/article")).toBe(true);
    expect(isSafeExternalLink("http://127.0.0.1/secret")).toBe(false);
    expect(isSafeExternalLink("http://[::1]/secret")).toBe(false);
    expect(isSafeExternalLink("http://user:pass@example.com/private")).toBe(false);
    expect(isSafeExternalLink("file:///etc/passwd")).toBe(false);
  });

  it("清理原始 HTML 与危险链接，并且仅允许托管图片占位符转换", () => {
    expect(sanitizeImportedMarkdown("正文<script>alert(1)</script> [危险](javascript:alert(1))")).toContain("正文");
    const imported = replaceAssetTokens("## 说明\n\n![流程图]({{asset:12}})", [{ id: 12, storageUrl: "/api/files/agent-image", assetType: "image" }]);
    expect(imported.content).toContain("/api/files/agent-image");
    expect(imported.referencedAssetIds).toEqual([12]);
    expect(() => replaceAssetTokens("![绕过](https://external.example/image.png)", [])).toThrow("必须先通过平台代理下载");
    expect(() => replaceAssetTokens("![错误]({{asset:99}})", [])).toThrow("不存在或非图片类型");
  });

  it("要求资讯正文满足最小长度，并强制课程资源声明目标课程", () => {
    expect(agentNewsPayloadSchema.safeParse({ title: "文章", summary: "简短摘要内容", contentMarkdown: "过短", category: "AI" }).success).toBe(false);
    expect(agentCoursePayloadSchema.safeParse({ title: "资料", materialType: "document" }).success).toBe(false);
    expect(agentCoursePayloadSchema.safeParse({ courseId: 3, title: "资料", materialType: "document", contentMarkdown: "已整理的课程内容" }).success).toBe(true);
  });
});
