import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getPersonalSpaceByUserId: vi.fn(),
  deleteWorkspaceForUser: vi.fn(),
  discardDraftAttachmentForUser: vi.fn(),
  storagePut: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  invokeLLM: vi.fn(),
  listLLMModels: vi.fn(),
  fetchRssEntries: vi.fn(),
  createHeartbeatJob: vi.fn(),
  updateHeartbeatJob: vi.fn(),
  capturePublicDocument: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: mocks.getDb,
  getOperationsData: vi.fn(),
  getPersonalSpaceByUserId: mocks.getPersonalSpaceByUserId,
  deleteWorkspaceForUser: mocks.deleteWorkspaceForUser,
  discardDraftAttachmentForUser: mocks.discardDraftAttachmentForUser,
  getPublicCatalog: vi.fn(),
  tables: {},
}));
vi.mock("./_core/env", async importOriginal => ({
  ENV: {
    ...(await importOriginal<typeof import("./_core/env")>()).ENV,
    llmBaseUrl: "https://ai-model.chint.com/api",
  },
}));
vi.mock("./_core/llm", () => ({ invokeLLM: mocks.invokeLLM, listLLMModels: mocks.listLLMModels }));
vi.mock("./_core/heartbeat", () => ({ createHeartbeatJob: mocks.createHeartbeatJob, updateHeartbeatJob: mocks.updateHeartbeatJob }));
vi.mock("./rss", () => ({ fetchRssEntries: mocks.fetchRssEntries }));
vi.mock("./storage", () => ({ storagePut: mocks.storagePut, storageGetSignedUrl: mocks.storageGetSignedUrl, storageDelete: vi.fn() }));
vi.mock("./courseCapture", () => ({ capturePublicDocument: mocks.capturePublicDocument }));

import { decodeSkillPackageUpload, ownedWorkspaceScope, platformRouter } from "./routers/platform";

const ctx = (role: "user" | "admin"): TrpcContext => ({
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  user: { id: 7, openId: "mock-user", name: "Mock User", email: "mock@example.com", loginMethod: "local", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
});

describe("personal mutation routes", () => {
  it("passes only the authenticated user context into personal reads", async () => {
    mocks.getPersonalSpaceByUserId.mockResolvedValue({ profile: { userId: 7 }, progress: [{ userId: 7 }], favorites: [{ userId: 7 }], likedPosts: [], workspace: [{ userId: 7 }], recommendations: [] });
    const caller = platformRouter.createCaller(ctx("user"));
    await expect(caller.personal.get()).resolves.toMatchObject({ profile: { userId: 7 }, progress: [{ userId: 7 }], favorites: [{ userId: 7 }], workspace: [{ userId: 7 }] });
    expect(mocks.getPersonalSpaceByUserId).toHaveBeenCalledWith(7);
  });

  it("writes progress, favorites and Workspace rows using the authenticated identity", async () => {
    const captured: unknown[] = [];
    const overwrite = vi.fn();
    const db = {
      insert: vi.fn(() => ({ values: vi.fn((value: unknown) => { captured.push(value); return { onDuplicateKeyUpdate: overwrite.mockResolvedValue(undefined) }; }) })),
      select: vi.fn((selection?: unknown) => ({ from: () => ({ where: () => selection ? Promise.resolve([{ orderIndex: 4 }]) : { limit: async () => [] } }) })),
    };
    mocks.getDb.mockResolvedValue(db);
    const caller = platformRouter.createCaller(ctx("user"));
    await caller.personal.updateProgress({ courseId: 2, progress: 50 });
    await caller.personal.toggleFavorite({ newsId: 8 });
    await caller.personal.addWorkspaceItem({ title: "周报模板", description: "生成周报初稿", destination: "/#learn", icon: "sparkles", color: "violet" });
    expect(captured).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: 7, courseId: 2, progress: 50 }),
      expect.objectContaining({ userId: 7, newsId: 8 }),
      expect.objectContaining({ userId: 7, title: "周报模板", orderIndex: 5 }),
    ]));
    expect(overwrite).toHaveBeenCalledWith(expect.objectContaining({ set: expect.objectContaining({ progress: 50 }) }));
  });

  it("scopes Workspace deletion to the authenticated identity", async () => {
    mocks.deleteWorkspaceForUser.mockResolvedValue({ success: true });
    const caller = platformRouter.createCaller(ctx("user"));
    await expect(caller.personal.removeWorkspaceItem({ id: 6 })).resolves.toEqual({ success: true });
    expect(mocks.deleteWorkspaceForUser).toHaveBeenCalledWith(7, 6);
    expect(ownedWorkspaceScope(7, 6)).toEqual({ userId: 7, id: 6 });
  });

  it("removes an existing favorite instead of creating a duplicate", async () => {
    const removeWhere = vi.fn(async () => undefined);
    mocks.getDb.mockResolvedValue({
      select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 81, userId: 7, newsId: 8 }] }) }) })),
      delete: vi.fn(() => ({ where: removeWhere })),
    });
    const caller = platformRouter.createCaller(ctx("user"));
    await expect(caller.personal.toggleFavorite({ newsId: 8 })).resolves.toEqual({ favorited: false });
    expect(removeWhere).toHaveBeenCalledOnce();
  });
});

describe("community attachment routes", () => {
  it("passes only the authenticated user id when discarding an unposted attachment", async () => {
    mocks.discardDraftAttachmentForUser.mockResolvedValue({ success: true });
    const caller = platformRouter.createCaller(ctx("user"));
    await expect(caller.community.discardAttachment({ id: 12 })).resolves.toEqual({ success: true });
    expect(mocks.discardDraftAttachmentForUser).toHaveBeenCalledWith(7, 12);
  });

  it("stores a valid image and returns a signed preview URL while rejecting invalid image payloads", async () => {
    mocks.getDb.mockResolvedValue({ insert: vi.fn(() => ({ values: vi.fn(() => ({ $returningId: async () => [{ id: 44 }] })) })) });
    mocks.storagePut.mockResolvedValue({ key: "community/7/example.png", url: "/api/files/private" });
    mocks.storageGetSignedUrl.mockResolvedValue("https://signed.example/image");
    const caller = platformRouter.createCaller(ctx("user"));
    await expect(caller.community.uploadImage({ dataUrl: "data:image/png;base64,aGVsbG8=", fileName: "demo.png", mimeType: "image/png" })).resolves.toMatchObject({ id: 44, url: "https://signed.example/image", fileName: "demo.png" });
    expect(mocks.storagePut).toHaveBeenCalledWith(expect.stringContaining("community/7/"), expect.any(Buffer), "image/png");
    await expect(caller.community.uploadImage({ dataUrl: "data:text/plain;base64,aGVsbG8=", fileName: "bad.txt", mimeType: "image/png" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("community interaction routes", () => {
  it("creates a comment and adds a first like for the authenticated employee", async () => {
    const inserts: unknown[] = []; const updates: unknown[] = [];
    let selectCount = 0;
    mocks.getDb.mockResolvedValue({
      select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => { selectCount += 1; return selectCount === 1 ? [{ replyPolicy: "all" }] : []; } }) }) })),
      insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserts.push(value); }) })),
      update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: async () => { updates.push(value); } })) })),
    });
    const caller = platformRouter.createCaller(ctx("user"));
    await expect(caller.community.createComment({ postId: 5, content: "建议补充实际的复盘指标。" })).resolves.toEqual({ success: true });
    await expect(caller.community.toggleLike({ postId: 5 })).resolves.toEqual({ liked: true });
    expect(inserts).toEqual(expect.arrayContaining([expect.objectContaining({ authorId: 7, postId: 5 }), expect.objectContaining({ userId: 7, postId: 5 })]));
    expect(updates).toHaveLength(2);
  });

  it("stores a private practice favorite against only the authenticated employee", async () => {
    const inserts: unknown[] = [];
    mocks.getDb.mockResolvedValue({
      select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) })),
      insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserts.push(value); }) })),
    });
    const caller = platformRouter.createCaller(ctx("user"));
    await expect(caller.community.toggleFavorite({ postId: 8 })).resolves.toEqual({ favorited: true });
    expect(inserts).toEqual([expect.objectContaining({ userId: 7, postId: 8 })]);
  });

  it("creates a quoted practice only when the quoted source exists", async () => {
    const inserted: unknown[] = [];
    mocks.getDb.mockResolvedValue({
      select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 4 }] }) }) })),
      insert: vi.fn(() => ({ values: vi.fn((value: unknown) => { inserted.push(value); return { $returningId: async () => [{ id: 19 }] }; }) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: async () => undefined })) })),
    });
    const caller = platformRouter.createCaller(ctx("user"));
    await expect(caller.community.create({ postType: "experience", title: "引用后的实践复盘", markdown: "引用前序方法并补充本团队的验证结果。", tags: ["复盘"], quotePostId: 4, replyPolicy: "all" })).resolves.toEqual({ success: true, postId: 19 });
    expect(inserted).toEqual([expect.objectContaining({ authorId: 7, quotePostId: 4, replyPolicy: "all" })]);
    mocks.getDb.mockResolvedValue({ select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) })) });
    await expect(caller.community.create({ postType: "experience", title: "不存在的引用", markdown: "尝试引用不存在实践应该被拒绝。", tags: [], quotePostId: 999, replyPolicy: "all" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("AI audit route", () => {
  it("records the structured result and writes the resulting status back to the news item", async () => {
    const inserts: unknown[] = [];
    const updates: unknown[] = [];
    const rows = [
      [{ id: 21, title: "待审资讯", summary: "摘要", content: "正文" }],
      [{ id: 3, name: "审核员", modelPreference: "gpt-5-mini", isEnabled: 1 }],
      [{ id: 1, name: "事实与来源可追溯", description: "需要来源", riskLevel: "medium", keywords: ["保证"], isEnabled: 1 }],
    ];
    const query = (value: unknown) => {
      const promise = Promise.resolve(value) as Promise<unknown> & { limit: (size: number) => Promise<unknown> };
      promise.limit = async () => value;
      return promise;
    };
    mocks.getDb.mockResolvedValue({
      select: vi.fn(() => ({ from: () => ({ where: () => query(rows.shift() ?? []) }) })),
      insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserts.push(value); }) })),
      update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: async () => { updates.push(value); } })) })),
    });
    mocks.invokeLLM.mockResolvedValue({ choices: [{ message: { content: '{"decision":"needs_review","riskLevel":"medium","confidence":82,"reason":"缺少可核验来源","matchedRules":["事实与来源可追溯"]}' } }] });
    const caller = platformRouter.createCaller(ctx("admin"));
    await expect(caller.operations.runAudit({ newsId: 21 })).resolves.toMatchObject({ decision: "needs_review", confidence: 82 });
    expect(inserts).toEqual(expect.arrayContaining([expect.objectContaining({ newsId: 21, decision: "needs_review", riskLevel: "medium" })]));
    expect(updates).toEqual(expect.arrayContaining([expect.objectContaining({ reviewStatus: "needs_review", riskLevel: "medium" })]));
  });
});

describe("AI decision governance routes", () => {
  it("allows a high-confidence low-risk AI result to directly approve content while high-risk items remain manual", async () => {
    const inserts: unknown[] = []; const updates: unknown[] = [];
    const rows = [[{ id: 22, title: "低风险资讯", summary: "摘要", content: "正文", isDeleted: 0 }], [{ id: 3, name: "审核员", modelPreference: "gpt-5-mini", confidenceThreshold: 75, isEnabled: 1 }], []];
    const query = (value: unknown) => { const promise = Promise.resolve(value) as Promise<unknown> & { limit: (size: number) => Promise<unknown> }; promise.limit = async () => value; return promise; };
    mocks.getDb.mockResolvedValue({ select: vi.fn(() => ({ from: () => ({ where: () => query(rows.shift() ?? []) }) })), insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserts.push(value); }) })), update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: async () => { updates.push(value); } })) })) });
    mocks.invokeLLM.mockResolvedValue({ choices: [{ message: { content: '{"decision":"approved","riskLevel":"low","confidence":90,"reason":"来源完整","matchedRules":[]}' } }] });
    const caller = platformRouter.createCaller(ctx("admin"));
    await expect(caller.operations.runAudit({ newsId: 22 })).resolves.toMatchObject({ decision: "approved" });
    expect(inserts).toEqual([expect.objectContaining({ decision: "approved", confidence: 90 })]); expect(updates).toEqual([expect.objectContaining({ reviewStatus: "approved" })]);
  });

  it("routes even high-confidence high-risk AI results to manual review", async () => {
    const updates: unknown[] = [];
    const rows = [[{ id: 23, title: "高风险资讯", summary: "摘要", content: "正文", isDeleted: 0 }], [{ id: 3, name: "审核员", modelPreference: "gpt-5-mini", confidenceThreshold: 75, isEnabled: 1 }], []];
    const query = (value: unknown) => { const promise = Promise.resolve(value) as Promise<unknown> & { limit: (size: number) => Promise<unknown> }; promise.limit = async () => value; return promise; };
    mocks.getDb.mockResolvedValue({ select: vi.fn(() => ({ from: () => ({ where: () => query(rows.shift() ?? []) }) })), insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })), update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: async () => { updates.push(value); } })) })) });
    mocks.invokeLLM.mockResolvedValue({ choices: [{ message: { content: '{"decision":"rejected","riskLevel":"high","confidence":98,"reason":"涉及高风险断言","matchedRules":["高风险"]}' } }] });
    const caller = platformRouter.createCaller(ctx("admin"));
    await expect(caller.operations.runAudit({ newsId: 23 })).resolves.toMatchObject({ decision: "needs_review", confidence: 98 });
    expect(updates).toEqual([expect.objectContaining({ reviewStatus: "needs_review", riskLevel: "high" })]);
  });

  it("soft-deletes and restores news with a responsible admin, reason and audit record while rejecting employees", async () => {
    const inserts: unknown[] = []; const updates: unknown[] = []; const rows = [[{ id: 61, isDeleted: 0 }], [{ id: 61, isDeleted: 1 }]];
    const query = (value: unknown) => { const promise = Promise.resolve(value) as Promise<unknown> & { limit: (size: number) => Promise<unknown> }; promise.limit = async () => value; return promise; };
    mocks.getDb.mockResolvedValue({ select: vi.fn(() => ({ from: () => ({ where: () => query(rows.shift() ?? []) }) })), insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserts.push(value); }) })), update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: async () => { updates.push(value); } })) })) });
    const admin = platformRouter.createCaller(ctx("admin"));
    await expect(admin.operations.deleteNews({ newsId: 61, reason: "重复转载且来源失效" })).resolves.toEqual({ success: true, newsId: 61 });
    await expect(admin.operations.restoreNews({ newsId: 61, reason: "来源已重新核验" })).resolves.toEqual({ success: true, newsId: 61 });
    expect(updates).toEqual(expect.arrayContaining([expect.objectContaining({ isDeleted: 1, deletedBy: 7, reviewStatus: "rejected" }), expect.objectContaining({ isDeleted: 0, deletedBy: null, reviewStatus: "needs_review" })]));
    expect(inserts).toEqual(expect.arrayContaining([expect.objectContaining({ reason: expect.stringContaining("人工删除"), reviewerId: 7 }), expect.objectContaining({ reason: expect.stringContaining("人工恢复"), reviewerId: 7 })]));
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.operations.deleteNews({ newsId: 61, reason: "普通员工无权删除" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(employee.operations.restoreNews({ newsId: 61, reason: "普通员工无权恢复" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("batch AI pre-audit route", () => {
  it("batch pre-audits pending entries, rejects high-confidence low-quality content, and preserves failed entries", async () => {
    const inserts: unknown[] = [];
    const updates: unknown[] = [];
    let selectCount = 0;
    mocks.getDb.mockResolvedValue({
      select: vi.fn(() => ({ from: () => ({ where: () => {
        selectCount += 1;
        if (selectCount === 1) return { limit: async () => [{ id: 3, name: "审核员", modelPreference: "gpt-5-mini", confidenceThreshold: 75, isEnabled: 1 }] };
        if (selectCount === 2) return Promise.resolve([{ id: 1, name: "低质过滤", description: "无实质信息的营销内容", riskLevel: "medium", keywords: ["扫码"] }]);
        return { orderBy: () => ({ limit: async () => [{ id: 31, title: "低质资讯", summary: "重复营销", content: "重复营销正文" }, { id: 32, title: "调用失败资讯", summary: "等待重试", content: null }] }) };
      } }) })),
      insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserts.push(value); }) })),
      update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: async () => { updates.push(value); } })) })),
    });
    mocks.invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: '{"decision":"rejected","riskLevel":"medium","confidence":91,"reason":"重复营销且无实质内容","matchedRules":["低质过滤"]}' } }] }).mockRejectedValueOnce(new Error("上游暂不可用"));
    const admin = platformRouter.createCaller(ctx("admin"));
    await expect(admin.operations.runBatchAudit({ maxItems: 2 })).resolves.toMatchObject({ requested: 2, processed: 1, rejected: 1, failed: 1, failures: [32] });
    expect(inserts).toEqual([expect.objectContaining({ newsId: 31, decision: "rejected", confidence: 91 })]);
    expect(updates).toEqual([expect.objectContaining({ reviewStatus: "rejected", riskLevel: "medium" })]);
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.operations.runBatchAudit({ maxItems: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("daily RSS sync schedule route", () => {
  it("creates and pauses a project-level daily RSS sync only for administrators", async () => {
    const updates: unknown[] = [];
    const rows = [[{ id: 8, name: "AIHOT 全文", sourceType: "rss", scheduleCronTaskUid: null }], [{ id: 8, name: "AIHOT 全文", sourceType: "rss", scheduleCronTaskUid: "task_existing" }]];
    const query = (value: unknown) => { const promise = Promise.resolve(value) as Promise<unknown> & { limit: (size: number) => Promise<unknown> }; promise.limit = async () => value; return promise; };
    mocks.getDb.mockResolvedValue({
      select: vi.fn(() => ({ from: () => ({ where: () => query(rows.shift() ?? []) }) })),
      update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: async () => { updates.push(value); } })) })),
    });
    mocks.createHeartbeatJob.mockResolvedValue({ taskUid: "task_daily_aihot", nextExecutionAt: "2026-08-26T01:00:00Z" });
    mocks.updateHeartbeatJob.mockResolvedValue({ nextExecutionAt: "2026-08-26T01:00:00Z" });
    const admin = platformRouter.createCaller(ctx("admin"));
    const priorNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    await expect(admin.operations.configureDailySourceSync({ sourceId: 8, enabled: true })).resolves.toMatchObject({ success: true, enabled: true, nextExecutionAt: "2026-08-26T01:00:00Z" });
    expect(mocks.createHeartbeatJob).toHaveBeenCalledWith(expect.objectContaining({ name: "daily-rss-source-8", cron: "0 0 1 * * *", path: "/api/scheduled/rss-sync" }), "");
    expect(updates).toEqual(expect.arrayContaining([expect.objectContaining({ scheduleEnabled: 1, scheduleCronTaskUid: "task_daily_aihot" })]));
    await expect(admin.operations.configureDailySourceSync({ sourceId: 8, enabled: false })).resolves.toMatchObject({ success: true, enabled: false });
    expect(mocks.updateHeartbeatJob).toHaveBeenCalledWith("task_existing", { enable: false }, "");
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.operations.configureDailySourceSync({ sourceId: 8, enabled: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    process.env.NODE_ENV = priorNodeEnv;
  });
});

describe("Skills 广场路由", () => {
  const skillPayload = { skillKey: "patent-research", name: "专利检索助手", summary: "将专利检索步骤沉淀为可复用的企业 Agent 工作法。", description: "用于受控地组织专利检索、初筛和结果归纳，不替代法务或知识产权结论。", category: "专业助手", tags: ["专利", "检索"], version: "v1.0", skillMd: "# 专利检索助手\n\n## 使用方法\n\n提交检索目标和边界。", usageGuide: "上传后等待运营审核；获准后从详情页复制安装指令。", packageFileName: "patent-research.zip", packageMimeType: "application/zip" as const, packageDataUrl: "data:application/zip;base64,UEsDBA==" };

  it("binds a submitted Skill package to the authenticated employee and rejects invalid archives", async () => {
    const inserted: unknown[] = [];
    mocks.getDb.mockResolvedValue({ select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) })), insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserted.push(value); }) })) });
    mocks.storagePut.mockResolvedValue({ key: "skills/7/patent.zip", url: "/api/files/skills/7/patent.zip" });
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.skills.submit(skillPayload)).resolves.toEqual({ success: true });
    expect(inserted).toEqual([expect.objectContaining({ authorId: 7, reviewStatus: "pending", packageStorageKey: "skills/7/patent.zip" })]);
    expect(() => decodeSkillPackageUpload("data:application/zip;base64,QUJDRA==", "application/zip")).toThrow("不是有效的 ZIP");
    await expect(employee.skills.submit({ ...skillPayload, packageFileName: "not-zip.txt" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("returns only approved catalog entries with keyword/category-compatible rating summaries and protected detail feedback", async () => {
    const approved = { id: 21, skillKey: "patent-research", name: "专利检索助手", summary: skillPayload.summary, description: skillPayload.description, category: "专业助手", tags: ["专利"], version: "v1.0", skillMd: skillPayload.skillMd, usageGuide: skillPayload.usageGuide, packageStorageKey: "skills/7/patent.zip", packageFileName: "patent.zip", packageSizeBytes: 4, authorId: 7, reviewStatus: "approved", createdAt: new Date(), updatedAt: new Date(), publishedAt: new Date() };
    const review = { id: 51, skillId: 21, userId: 7, rating: 5, comment: "已用于专利初筛，边界说明清晰。", createdAt: new Date(), updatedAt: new Date() };
    const results = [[{ skill: approved, authorName: "Mock User" }], [{ skillId: 21, averageRating: 5, reviewCount: 1 }], [{ skill: approved, authorName: "Mock User" }], [{ averageRating: 5, reviewCount: 1 }], [{ review, reviewerName: "Mock User" }], [review], [{ totalDownloads: 3 }], []];
    const query = (rows: unknown[]) => {
      const chain: Record<string, unknown> = { from: () => chain, leftJoin: () => chain, innerJoin: () => chain, where: () => chain, groupBy: () => chain, orderBy: () => chain, limit: async () => rows, then: (resolve: (value: unknown) => void) => resolve(rows) };
      return chain;
    };
    mocks.getDb.mockResolvedValue({ select: vi.fn(() => query(results.shift() ?? [])) });
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.skills.list({ keyword: "专利", category: "专业助手", sort: "rating" })).resolves.toEqual([expect.objectContaining({ skill: expect.objectContaining({ reviewStatus: "approved" }), averageRating: 5 })]);
    await expect(employee.skills.detail({ id: 21 })).resolves.toMatchObject({ reviews: [expect.objectContaining({ review: expect.objectContaining({ rating: 5 }) })], myReview: expect.objectContaining({ userId: 7 }), totalDownloads: 3, related: [] });
  });

  it("records a single employee download history and only signs the package after access validation", async () => {
    const writes: unknown[] = []; const approved = { id: 21, name: "专利检索助手", reviewStatus: "approved", authorId: 9, packageStorageKey: "skills/9/patent.zip" };
    mocks.getDb.mockResolvedValue({ select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [approved] }) }) })), insert: vi.fn(() => ({ values: vi.fn((value: unknown) => ({ onDuplicateKeyUpdate: async () => { writes.push(value); } })) })) });
    mocks.storageGetSignedUrl.mockResolvedValue("https://signed.example/skills/patent.zip");
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.skills.requestDownload({ skillId: 21 })).resolves.toMatchObject({ downloadUrl: "https://signed.example/skills/patent.zip", installCommand: expect.stringContaining("专利检索助手") });
    expect(writes).toEqual([expect.objectContaining({ userId: 7, skillId: 21, downloadCount: 1 })]);
  });

  it("upserts one review per employee and keeps personal Skills assets scoped to that employee", async () => {
    const reviewWrites: unknown[] = []; const queryRows = [[{ id: 21 }], [{ id: 21, authorId: 7, name: "我的专利助手", reviewStatus: "pending" }], [{ download: { id: 31, userId: 7, skillId: 22, downloadCount: 2, lastDownloadedAt: new Date() }, skill: { id: 22, name: "已下载助手", reviewStatus: "approved" } }]];
    const query = (rows: unknown[]) => ({ from: () => query(rows), innerJoin: () => query(rows), where: () => query(rows), orderBy: async () => rows, limit: async () => rows });
    mocks.getDb.mockResolvedValue({ select: vi.fn(() => query(queryRows.shift() ?? [])), insert: vi.fn(() => ({ values: vi.fn((value: unknown) => ({ onDuplicateKeyUpdate: async () => { reviewWrites.push(value); } })) })) });
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.skills.upsertReview({ skillId: 21, rating: 4, comment: "适合形成标准化初筛流程。" })).resolves.toEqual({ success: true });
    expect(reviewWrites).toEqual([expect.objectContaining({ userId: 7, skillId: 21, rating: 4 })]);
    await expect(employee.skills.myAssets()).resolves.toMatchObject({ submissions: [expect.objectContaining({ authorId: 7 })], downloads: [expect.objectContaining({ download: expect.objectContaining({ userId: 7 }) })] });
  });

  it("allows only administrators to review Skills submissions", async () => {
    const updates: unknown[] = [];
    mocks.getDb.mockResolvedValue({ update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: async () => { updates.push(value); } })) })) });
    const admin = platformRouter.createCaller(ctx("admin")); const employee = platformRouter.createCaller(ctx("user"));
    await expect(admin.skills.review({ id: 21, reviewStatus: "approved", reviewNote: "已核对 SKILL.md、安装包与外部依赖边界。" })).resolves.toEqual({ success: true });
    expect(updates).toEqual([expect.objectContaining({ reviewStatus: "approved", reviewedBy: 7, publishedAt: expect.any(Date) })]);
    await expect(employee.skills.review({ id: 21, reviewStatus: "approved", reviewNote: "越权操作" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("sustainable operations routes", () => {
  it("tests the enterprise gateway model with a minimal call, while rejecting providers whose Base URL does not match the deployment gateway", async () => {
    const updates: unknown[] = [];
    const rows = [
      [{ modelId: "deepseek-v4", modelEnabled: 1, providerId: 1, providerName: "企业模型网关", providerType: "custom", providerBaseUrl: "https://ai-model.chint.com/api", providerEnabled: 1, providerStatus: "healthy", gatewayStatus: "verified" }],
      [{ modelId: "external-model", modelEnabled: 1, providerId: 2, providerName: "外部模型服务", providerType: "custom", providerBaseUrl: "https://other-gateway.example.com/api", providerEnabled: 1, providerStatus: "healthy", gatewayStatus: "not_connected" }],
    ];
    mocks.getDb.mockResolvedValue({ select: vi.fn(() => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => rows.shift() ?? [] }) }) }) })), update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: async () => { updates.push(value); } })) })) });
    mocks.listLLMModels.mockResolvedValue({ data: [{ id: "deepseek-v4" }] });
    mocks.invokeLLM.mockResolvedValue({ model: "deepseek-v4", choices: [{ message: { content: "READY" } }] });
    const admin = platformRouter.createCaller(ctx("admin"));
    await expect(admin.operations.testModelConnection({ selectedModelId: 1 })).resolves.toMatchObject({ success: true, status: "verified" });
    expect(mocks.invokeLLM).toHaveBeenCalledWith(expect.objectContaining({ model: "deepseek-v4", maxTokens: 32 }));
    await expect(admin.operations.testModelConnection({ selectedModelId: 2 })).resolves.toMatchObject({ success: false, status: "gateway_not_connected" });
    expect(updates).toEqual(expect.arrayContaining([expect.objectContaining({ gatewayStatus: "verified" })]));
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.operations.testModelConnection({ selectedModelId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets administrators maintain enterprise application entries while employees only read enabled non-admin entries", async () => {
    const writes: unknown[] = [];
    mocks.getDb.mockResolvedValue({
      insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { writes.push(value); }) })),
      update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: async () => { writes.push(value); } })) })),
      select: vi.fn(() => ({ from: () => ({ where: () => ({ orderBy: async () => [{ id: 5, name: "公司 Agent 平台", appUrl: "https://agent.example.com", isEnabled: 1, audience: "employee" }] }) }) })),
    });
    const admin = platformRouter.createCaller(ctx("admin"));
    const payload = { name: "专利小匠", description: "面向专利检索与撰写辅助的受控工具。", appUrl: "https://patent.example.com", category: "专业助手", icon: "blocks", audience: "employee" as const, isEnabled: true, orderIndex: 8 };
    await expect(admin.operations.addEnterpriseApp(payload)).resolves.toEqual({ success: true });
    await expect(admin.operations.updateEnterpriseApp({ ...payload, id: 5, orderIndex: 9 })).resolves.toEqual({ success: true });
    await expect(admin.operations.toggleEnterpriseApp({ id: 5, isEnabled: false })).resolves.toEqual({ success: true });
    expect(writes).toEqual(expect.arrayContaining([expect.objectContaining({ name: "专利小匠", isEnabled: 1 }), expect.objectContaining({ orderIndex: 9, isEnabled: 1 }), expect.objectContaining({ isEnabled: 0 })]));
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.applications.list()).resolves.toEqual([expect.objectContaining({ name: "公司 Agent 平台" })]);
    await expect(employee.operations.addEnterpriseApp(payload)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("links an audit agent to an enabled catalog model and rejects disabled combinations", async () => {
    const updates: unknown[] = [];
    const rows = [[{ modelId: "gpt-5", modelEnabled: 1, providerEnabled: 1, providerStatus: "healthy", gatewayStatus: "verified" }], [{ modelId: "retired-model", modelEnabled: 0, providerEnabled: 1, providerStatus: "healthy", gatewayStatus: "verified" }]];
    mocks.getDb.mockResolvedValue({
      select: vi.fn(() => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => rows.shift() ?? [] }) }) }) })),
      update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: async () => { updates.push(value); } })) })),
    });
    const admin = platformRouter.createCaller(ctx("admin"));
    await expect(admin.operations.updateAgent({ id: 4, name: "资讯审核员", description: "负责低风险资讯的预审和人工分流。", selectedModelId: 17, confidenceThreshold: 76, isEnabled: true })).resolves.toEqual({ success: true });
    expect(updates).toEqual([expect.objectContaining({ selectedModelId: 17, modelPreference: "gpt-5", isEnabled: 1 })]);
    await expect(admin.operations.updateAgent({ id: 4, name: "资讯审核员", description: "负责低风险资讯的预审和人工分流。", selectedModelId: 18, confidenceThreshold: 76, isEnabled: true })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.operations.updateAgent({ id: 4, name: "资讯审核员", description: "负责低风险资讯的预审和人工分流。", selectedModelId: 17, confidenceThreshold: 76, isEnabled: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows only administrators to register a provider with a key alias rather than a raw key", async () => {
    const inserted: unknown[] = [];
    mocks.getDb.mockResolvedValue({ insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserted.push(value); }) })) });
    const admin = platformRouter.createCaller(ctx("admin"));
    await expect(admin.operations.addProvider({ name: "企业兼容网关", providerType: "custom", baseUrl: "https://llm.example.internal/v1", keyAlias: "ENTERPRISE_LLM_KEY", healthStatus: "unknown", isEnabled: true, orderIndex: 10 })).resolves.toEqual({ success: true });
    expect(inserted).toEqual([expect.objectContaining({ name: "企业兼容网关", keyAlias: "ENTERPRISE_LLM_KEY", isEnabled: 1 })]);
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.operations.addProvider({ name: "未授权", providerType: "custom", baseUrl: "https://example.invalid", keyAlias: "SHOULD_NOT_WRITE", healthStatus: "unknown", isEnabled: true, orderIndex: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("supports assigning another reviewer, claiming the review as current admin, and rejecting employees", async () => {
    const updates: unknown[] = [];
    mocks.getDb.mockResolvedValue({ update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: async () => { updates.push(value); } })) })) });
    const admin = platformRouter.createCaller(ctx("admin"));
    await expect(admin.operations.assignReview({ recordId: 12, assigneeId: 42 })).resolves.toEqual({ success: true });
    await expect(admin.operations.assignReview({ recordId: 12, assigneeId: 7 })).resolves.toEqual({ success: true });
    expect(updates).toEqual([expect.objectContaining({ reviewAssigneeId: 42 }), expect.objectContaining({ reviewAssigneeId: 7 })]);
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.operations.assignReview({ recordId: 12, assigneeId: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows the current authenticated administrator to claim a review using its own context id", async () => {
    const updates: unknown[] = [];
    mocks.getDb.mockResolvedValue({ update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: async () => { updates.push(value); } })) })) });
    const currentAdmin = ctx("admin");
    const caller = platformRouter.createCaller(currentAdmin);
    await expect(caller.operations.assignReview({ recordId: 13, assigneeId: currentAdmin.user!.id })).resolves.toEqual({ success: true });
    expect(updates).toEqual([expect.objectContaining({ reviewAssigneeId: currentAdmin.user!.id })]);
  });

  it("updates review status independently for source, provider and topic while rejecting employees", async () => {
    const updates: unknown[] = [];
    mocks.getDb.mockResolvedValue({ update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: async () => { updates.push(value); } })) })) });
    const admin = platformRouter.createCaller(ctx("admin"));
    await expect(admin.operations.setResourceReviewStatus({ resourceType: "source", id: 1, reviewStatus: "due" })).resolves.toEqual({ success: true });
    await expect(admin.operations.setResourceReviewStatus({ resourceType: "provider", id: 2, reviewStatus: "overdue" })).resolves.toEqual({ success: true });
    await expect(admin.operations.setResourceReviewStatus({ resourceType: "topic", id: 3, reviewStatus: "current" })).resolves.toEqual({ success: true });
    await expect(admin.operations.setResourceReviewStatus({ resourceType: "path", id: 4, reviewStatus: "due" })).resolves.toEqual({ success: true });
    await expect(admin.operations.setResourceReviewStatus({ resourceType: "course", id: 5, reviewStatus: "overdue" })).resolves.toEqual({ success: true });
    expect(updates).toEqual([expect.objectContaining({ reviewStatus: "due" }), expect.objectContaining({ reviewStatus: "overdue" }), expect.objectContaining({ reviewStatus: "current" }), expect.objectContaining({ reviewStatus: "due" }), expect.objectContaining({ reviewStatus: "overdue" })]);
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.operations.setResourceReviewStatus({ resourceType: "source", id: 1, reviewStatus: "current" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(employee.operations.setResourceReviewStatus({ resourceType: "course", id: 5, reviewStatus: "current" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("archives and restores sources, providers and topics only for administrators", async () => {
    const updates: unknown[] = [];
    mocks.getDb.mockResolvedValue({ update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: async () => { updates.push(value); } })) })) });
    const admin = platformRouter.createCaller(ctx("admin"));
    await expect(admin.operations.toggleSource({ id: 1, isEnabled: false })).resolves.toEqual({ success: true });
    await expect(admin.operations.toggleSource({ id: 1, isEnabled: true })).resolves.toEqual({ success: true });
    await expect(admin.operations.toggleProvider({ id: 2, isEnabled: false })).resolves.toEqual({ success: true });
    await expect(admin.operations.toggleProvider({ id: 2, isEnabled: true })).resolves.toEqual({ success: true });
    await expect(admin.operations.updateTopic({ id: 3, name: "业务实践", description: "业务问题与 AI 价值验证的案例。", color: "violet", isEnabled: false, reviewStatus: "current", isFeatured: false })).resolves.toEqual({ success: true });
    await expect(admin.operations.updateTopic({ id: 3, name: "业务实践", description: "业务问题与 AI 价值验证的案例。", color: "violet", isEnabled: true, reviewStatus: "current", isFeatured: false })).resolves.toEqual({ success: true });
    expect(updates).toEqual(expect.arrayContaining([expect.objectContaining({ isEnabled: 0 }), expect.objectContaining({ isEnabled: 1 })]));
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.operations.toggleSource({ id: 1, isEnabled: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(employee.operations.toggleProvider({ id: 2, isEnabled: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(employee.operations.updateTopic({ id: 3, name: "越权主题", description: "普通员工不应变更主题运营状态。", color: "violet", isEnabled: false, reviewStatus: "current", isFeatured: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("imports new RSS entries, skips existing links, and allows no employee-triggered synchronization", async () => {
    const inserted: unknown[] = [];
    const updates: unknown[] = [];
    const rows = [
      [{ id: 8, name: "AIHOT", url: "https://aihot.virxact.com/feed.xml", sourceType: "rss", category: "精选摘要", isEnabled: 1 }],
      [{ id: 71, sourceUrl: "https://aihot.virxact.com/items/existing", content: "旧摘要" }],
    ];
    const query = (value: unknown) => {
      const promise = Promise.resolve(value) as Promise<unknown> & { limit: (size: number) => Promise<unknown> };
      promise.limit = async () => value;
      return promise;
    };
    mocks.getDb.mockResolvedValue({
      select: vi.fn(() => ({ from: () => ({ where: () => query(rows.shift() ?? []) }) })),
      insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserted.push(value); }) })),
      update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: async () => { updates.push(value); } })) })),
    });
    mocks.fetchRssEntries.mockResolvedValue([
      { title: "已存在", summary: "重复内容", content: "重复内容", link: "https://aihot.virxact.com/items/existing", categories: ["模型趋势"], publishedAt: new Date("2026-08-24T12:00:00Z") },
      { title: "新条目", summary: "可导入摘要", content: "可导入摘要\n\n原文入口：https://example.com/original", link: "https://aihot.virxact.com/items/new", categories: ["AI 模型"], publishedAt: new Date("2026-08-25T12:00:00Z") },
    ]);
    const admin = platformRouter.createCaller(ctx("admin"));
    await expect(admin.operations.syncSource({ sourceId: 8 })).resolves.toMatchObject({ success: true, fetched: 2, created: 1, updated: 1, skipped: 0 });
    expect(inserted).toEqual([expect.arrayContaining([expect.objectContaining({ sourceId: 8, sourceUrl: "https://example.com/original", content: "可导入摘要", reviewStatus: "pending", tags: ["精选摘要", "AI 模型"] })])]);
    expect(updates).toEqual(expect.arrayContaining([expect.objectContaining({ content: "重复内容" }), expect.objectContaining({ lastProcessedAt: expect.any(Date) })]));
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.operations.syncSource({ sourceId: 8 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("protects learning-path creation and model routing policy changes behind administrator role", async () => {
    const inserts: unknown[] = [];
    mocks.getDb.mockResolvedValue({ insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserts.push(value); }) })) });
    const admin = platformRouter.createCaller(ctx("admin"));
    await expect(admin.operations.addPath({ title: "新员工 AI 上手", description: "覆盖安全、工具、提示词与真实业务任务。", level: "beginner", category: "通识", duration: "2 小时", lessonCount: 3, accent: "violet", tags: ["通识"], prerequisitePathIds: [], lifecycleStatus: "draft", contentOwner: "学习运营", businessOwner: "人力发展", reviewStatus: "due", reviewDueAt: "2026-12-31", version: "v1.2", changeNote: "补充企业提示词规范", isFeatured: false })).resolves.toEqual({ success: true });
    await expect(admin.operations.savePolicy({ name: "学习场景策略", scenario: "learning", primaryModelId: null, fallbackModelIds: [], isEnabled: true })).resolves.toEqual({ success: true });
    expect(inserts).toEqual(expect.arrayContaining([expect.objectContaining({ contentOwner: "学习运营", businessOwner: "人力发展", reviewStatus: "due", reviewDueAt: expect.any(Date), version: "v1.2", changeNote: "补充企业提示词规范" })]));
    expect(inserts).toHaveLength(2);
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.operations.savePolicy({ name: "越权策略", scenario: "content", primaryModelId: null, fallbackModelIds: [], isEnabled: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("persists course ledger owners, review date, version and change note for administrators", async () => {
    const inserts: unknown[] = []; const updates: unknown[] = [];
    mocks.getDb.mockResolvedValue({ insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserts.push(value); }) })), update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: async () => { updates.push(value); } })) })) });
    const payload = { pathId: 3, title: "企业提示词模板实战", summary: "使用受控模板完成真实业务提问、校验和复盘。", duration: "45 分钟", orderIndex: 8, resourceType: "template" as const, resourceUrl: "https://intranet.example.com/templates/prompt", tags: ["提示词", "模板"], prerequisiteCourseIds: [], lifecycleStatus: "published" as const, contentOwner: "知识运营", businessOwner: "销售赋能", reviewStatus: "due" as const, reviewDueAt: "2026-10-01", version: "v2.0", changeNote: "升级为销售场景模板" };
    const admin = platformRouter.createCaller(ctx("admin"));
    await expect(admin.operations.addCourse(payload)).resolves.toEqual({ success: true });
    await expect(admin.operations.updateCourse({ ...payload, id: 19, version: "v2.1", changeNote: "补充审批案例" })).resolves.toEqual({ success: true });
    expect(inserts).toEqual([expect.objectContaining({ contentOwner: "知识运营", businessOwner: "销售赋能", reviewStatus: "due", reviewDueAt: expect.any(Date), version: "v2.0", changeNote: "升级为销售场景模板" })]);
    expect(updates).toEqual([expect.objectContaining({ contentOwner: "知识运营", businessOwner: "销售赋能", reviewStatus: "due", reviewDueAt: expect.any(Date), version: "v2.1", changeNote: "补充审批案例" })]);
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.operations.addCourse(payload)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("records one anonymous reading relationship per employee and updates repeat reads", async () => {
    const inserts: unknown[] = []; const duplicateUpdates: unknown[] = [];
    mocks.getDb.mockResolvedValue({ select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 42 }] }) }) })), insert: vi.fn(() => ({ values: vi.fn((value: unknown) => { inserts.push(value); return { onDuplicateKeyUpdate: async ({ set }: { set: unknown }) => { duplicateUpdates.push(set); } }; }) })) });
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.personal.recordNewsRead({ newsId: 42 })).resolves.toEqual({ success: true });
    expect(inserts).toEqual([expect.objectContaining({ userId: 7, newsId: 42, firstReadAt: expect.any(Date), lastReadAt: expect.any(Date) })]);
    expect(duplicateUpdates).toEqual([expect.objectContaining({ lastReadAt: expect.any(Date) })]);
    const anonymous = platformRouter.createCaller({ user: null } as never);
    await expect(anonymous.personal.recordNewsRead({ newsId: 42 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("allows only administrators to maintain typed course resources and keeps video comments bound to the employee", async () => {
    const inserts: unknown[] = []; let selectCount = 0;
    mocks.getDb.mockResolvedValue({ select: vi.fn(() => { selectCount += 1; if (selectCount === 1) return { from: () => ({ where: () => ({ limit: async () => [{ id: 3 }] }) }) }; return { from: () => ({ leftJoin: () => ({ where: () => ({ limit: async () => [{ material: { materialType: "video" }, lifecycleStatus: "published" }] }) }) }) }; }), insert: vi.fn(() => ({ values: vi.fn((value: unknown) => { inserts.push(value); return { $returningId: async () => [{ id: 27 }] }; }) })) });
    const material = { courseId: 3, materialType: "document" as const, sourceType: "inline" as const, title: "提示词标准", description: "企业提示词规范文档", sourceUrl: null, storageKey: null, mimeType: "text/markdown", content: "# 规范\n\n可直接阅读。", config: {}, orderIndex: 1 };
    const admin = platformRouter.createCaller(ctx("admin")); const employee = platformRouter.createCaller(ctx("user"));
    await expect(admin.operations.addCourseMaterial(material)).resolves.toEqual({ success: true });
    await expect(employee.operations.addCourseMaterial(material)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(employee.learning.addComment({ materialId: 9, content: "这个案例很实用", videoSecond: 42 })).resolves.toMatchObject({ comment: { id: 27, materialId: 9, content: "这个案例很实用", videoSecond: 42, isDanmaku: 0 }, authorName: "Mock User" });
    expect(inserts).toEqual(expect.arrayContaining([expect.objectContaining({ courseId: 3, materialType: "document", content: "# 规范\n\n可直接阅读。" }), expect.objectContaining({ materialId: 9, userId: 7, videoSecond: 42 })]));
  });

  it("runs practice only for published practice material, saves the employee result and applies daily limit", async () => {
    const inserts: unknown[] = []; let countQuery = 0;
    mocks.getDb.mockResolvedValue({ select: vi.fn(() => { countQuery += 1; if (countQuery === 1) return { from: () => ({ leftJoin: () => ({ where: () => ({ limit: async () => [{ material: { materialType: "practice", config: { instruction: "生成一份可审阅的客户回复。" } }, lifecycleStatus: "published" }] }) }) }) }; return { from: () => ({ where: () => Promise.resolve([{ count: 0 }]) }) }; }), insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserts.push(value); }) })) });
    mocks.invokeLLM.mockResolvedValue({ model: "deepseek-v4", choices: [{ message: { content: "这是受控实操结果" } }] });
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.learning.runPractice({ materialId: 11, prompt: "为客户解释新的 AI 审核流程" })).resolves.toEqual({ output: "这是受控实操结果", modelId: "deepseek-v4" });
    expect(inserts).toEqual([expect.objectContaining({ materialId: 11, userId: 7, modelId: "deepseek-v4", prompt: "为客户解释新的 AI 审核流程" })]);
  });

  it("protects URL capture and file upload behind administrator role while validating upload MIME payload", async () => {
    mocks.capturePublicDocument.mockResolvedValue({ title: "公开指南", summary: "摘要", content: "正文", sourceUrl: "https://example.com/guide", mimeType: "text/html" }); mocks.storagePut.mockResolvedValue({ key: "course-materials/guide.md", url: "/api/files/course-materials/guide.md" });
    const admin = platformRouter.createCaller(ctx("admin")); const employee = platformRouter.createCaller(ctx("user")); const markdown = "data:text/markdown;base64,IyDmiJHnmoTmoIflhYg=";
    await expect(admin.operations.captureDocumentUrl({ url: "https://example.com/guide" })).resolves.toMatchObject({ title: "公开指南" });
    await expect(admin.operations.uploadCourseMaterialFile({ fileName: "guide.md", mimeType: "text/markdown", dataUrl: markdown })).resolves.toMatchObject({ storageKey: "course-materials/guide.md" });
    await expect(admin.operations.uploadCourseMaterialFile({ fileName: "wrong.md", mimeType: "text/markdown", dataUrl: "data:text/plain;base64,SGVsbG8=" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(employee.operations.captureDocumentUrl({ url: "https://example.com/guide" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(employee.operations.uploadCourseMaterialFile({ fileName: "guide.md", mimeType: "text/markdown", dataUrl: markdown })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects files beyond 12MB after decoding even when their base64 payload is structurally valid", async () => {
    const oversized = `data:text/markdown;base64,${Buffer.alloc(12 * 1024 * 1024 + 1).toString("base64")}`; const admin = platformRouter.createCaller(ctx("admin"));
    await expect(admin.operations.uploadCourseMaterialFile({ fileName: "large.md", mimeType: "text/markdown", dataUrl: oversized })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("12MB") });
  });

  it("rejects timestamp comments on non-video resources and blocks unpublished or over-limit practice runs", async () => {
    const employee = platformRouter.createCaller(ctx("user"));
    mocks.getDb.mockResolvedValue({ select: vi.fn(() => ({ from: () => ({ leftJoin: () => ({ where: () => ({ limit: async () => [{ material: { materialType: "document", config: {} }, lifecycleStatus: "published" }] }) }) }) })) });
    await expect(employee.learning.addComment({ materialId: 12, content: "不应带时间戳", videoSecond: 10 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    mocks.getDb.mockResolvedValue({ select: vi.fn(() => ({ from: () => ({ leftJoin: () => ({ where: () => ({ limit: async () => [{ material: { materialType: "practice", config: {} }, lifecycleStatus: "draft" }] }) }) }) })) });
    await expect(employee.learning.runPractice({ materialId: 13, prompt: "不能运行草稿" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    let queryCount = 0; mocks.getDb.mockResolvedValue({ select: vi.fn(() => { queryCount += 1; if (queryCount === 1) return { from: () => ({ leftJoin: () => ({ where: () => ({ limit: async () => [{ material: { materialType: "practice", config: {} }, lifecycleStatus: "published" }] }) }) }) }; return { from: () => ({ where: () => Promise.resolve([{ count: 5 }]) }) }; }) });
    await expect(employee.learning.runPractice({ materialId: 14, prompt: "超过日限额" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("binds topic follows to the current user and blocks operations-only discussion for employees", async () => {
    const inserts: unknown[] = [];
    let selectCount = 0;
    mocks.getDb.mockResolvedValue({
      select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => { selectCount += 1; return selectCount === 1 ? [] : [{ replyPolicy: "operations" }]; } }) }) })),
      insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserts.push(value); }) })),
    });
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.community.toggleTopicFollow({ topicId: 3 })).resolves.toEqual({ followed: true });
    await expect(employee.community.createComment({ postId: 9, content: "我想补充一个案例。" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(inserts).toEqual([expect.objectContaining({ userId: 7, topicId: 3 })]);
  });

  it("only lets an administrator issue a scoped Agent import token and persists its hash rather than the raw token", async () => {
    const inserted: unknown[] = [];
    mocks.getDb.mockResolvedValue({ insert: vi.fn(() => ({ values: vi.fn((value: unknown) => { inserted.push(value); return { $returningId: async () => [{ id: 88 }] }; }) })) });
    const admin = platformRouter.createCaller(ctx("admin")); const employee = platformRouter.createCaller(ctx("user"));
    const result = await admin.operations.createAgentImportKey({ name: "运营文章采集 Agent", allowedTargets: ["news"], expiresAt: null });
    expect(result).toMatchObject({ id: 88, tokenPrefix: expect.stringMatching(/^aeh_imp_/), token: expect.stringMatching(/^aeh_imp_/) });
    expect(inserted).toEqual([expect.objectContaining({ name: "运营文章采集 Agent", allowedTargets: ["news"], createdBy: 7, tokenHash: expect.any(String), tokenPrefix: result.tokenPrefix })]);
    expect(inserted[0]).not.toHaveProperty("token");
    await expect(employee.operations.createAgentImportKey({ name: "越权令牌", allowedTargets: ["news"], expiresAt: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
