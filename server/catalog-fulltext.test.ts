import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPublicCatalog: vi.fn() }));
vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  getDb: vi.fn(), getOperationsData: vi.fn(), getPersonalSpaceByUserId: vi.fn(), deleteWorkspaceForUser: vi.fn(), discardDraftAttachmentForUser: vi.fn(), getPublicCatalog: mocks.getPublicCatalog, tables: {},
}));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn(), listLLMModels: vi.fn() }));
vi.mock("./rss", () => ({ fetchRssEntries: vi.fn() }));
vi.mock("./_core/heartbeat", () => ({ createHeartbeatJob: vi.fn(), updateHeartbeatJob: vi.fn() }));
vi.mock("./storage", () => ({ storagePut: vi.fn(), storageGetSignedUrl: vi.fn() }));

import { countResourceGaps, filterCatalogNews, filterPublishedCourses } from "./db";
import { platformRouter } from "./routers/platform";

describe("精选全文资讯目录筛选", () => {
  it("在全文筛选开启时仅保留正文显著长于摘要的资讯，关闭时保留两类内容", () => {
    const rows = [
      { item: { id: 1, summary: "摘要", content: "摘要".repeat(50) }, sourceName: "全文源" },
      { item: { id: 2, summary: "摘要", content: "摘要补充" }, sourceName: "摘要源" },
    ];
    expect(filterCatalogNews(rows, true).map(row => row.item.id)).toEqual([1]);
    expect(filterCatalogNews(rows, false).map(row => row.item.id)).toEqual([1, 2]);
  });

  it("将 fullTextOnly 查询参数传递给服务端资讯目录", async () => {
    mocks.getPublicCatalog.mockResolvedValue({ paths: [], courses: [], news: [], newsCategories: [], modules: [], posts: [] });
    const caller = platformRouter.createCaller({ req: {} as never, res: {} as never, user: { id: 7, role: "user" } } as never);
    await caller.catalog({ fullTextOnly: true });
    expect(mocks.getPublicCatalog).toHaveBeenCalledWith(undefined, true);
  });

  it("仅将已发布课程返回给员工端学习目录与推荐计算", () => {
    expect(filterPublishedCourses([{ id: 1, lifecycleStatus: "published" as const }, { id: 2, lifecycleStatus: "draft" as const }, { id: 3, lifecycleStatus: "archived" as const }]).map(item => item.id)).toEqual([1]);
  });

  it("资源缺口同时识别课程级 URL 与结构化素材", () => {
    const courses = [{ id: 1, resourceUrl: null }, { id: 2, resourceUrl: "https://example.com/course" }, { id: 3, resourceUrl: null }];
    expect(countResourceGaps(courses, [{ courseId: 1 }])).toBe(1);
  });
});
