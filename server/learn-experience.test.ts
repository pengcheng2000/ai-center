import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  storagePut: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  invokeLLM: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: mocks.getDb, getOperationsData: vi.fn(), getPersonalSpaceByUserId: vi.fn(), deleteWorkspaceForUser: vi.fn(), discardDraftAttachmentForUser: vi.fn(), getPublicCatalog: vi.fn(), tables: {} }));
vi.mock("./_core/llm", () => ({ invokeLLM: mocks.invokeLLM, listLLMModels: vi.fn() }));
vi.mock("./storage", () => ({ storagePut: mocks.storagePut, storageGetSignedUrl: mocks.storageGetSignedUrl }));
vi.mock("./newsSync", () => ({ DAILY_SYNC_CRON: "0 0 1 * * *", syncRssSourceById: vi.fn() }));
vi.mock("./_core/heartbeat", () => ({ createHeartbeatJob: vi.fn(), updateHeartbeatJob: vi.fn() }));
vi.mock("./courseCapture", () => ({ capturePublicDocument: vi.fn() }));
vi.mock("./agentImport", () => ({ AGENT_IMPORT_TARGETS: ["news", "course_material", "skill"], applyAgentImportJob: vi.fn(), issueAgentImportToken: vi.fn() }));

import { annotationInput, ASSISTANT_SYSTEM_PROMPT, materialPositionFromKind, ownedAnnotationValues, platformRouter } from "./routers/platform";

const ctx = (role: "user" | "admin"): TrpcContext => ({
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  user: { id: 7, openId: "mock-user", name: "Mock User", email: "mock@example.com", loginMethod: "local", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
});

describe("标注输入与素材进度契约", () => {
  it("标注输入校验矩形范围与颜色枚举", () => {
    expect(annotationInput.safeParse({ materialId: 1, page: 1, rects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }], note: "重点", color: "amber" }).success).toBe(true);
    expect(annotationInput.safeParse({ materialId: 1, page: 1, rects: [], note: "无矩形", color: "amber" }).success).toBe(false);
    expect(annotationInput.safeParse({ materialId: 1, page: 1, rects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }], note: "重点", color: "pink" }).success).toBe(false);
    expect(ownedAnnotationValues(7, { materialId: 1, page: 2, rects: [{ x: 0, y: 0, w: 0.5, h: 0.5 }], note: "ok", color: "violet" })).toMatchObject({ userId: 7, page: 2, color: "violet" });
  });
  it("按素材类型换算进度位置", () => {
    expect(materialPositionFromKind("video", 30, 100)).toEqual({ position: 30, percent: 30 });
    expect(materialPositionFromKind("pdf", 3, 10)).toEqual({ position: 3, percent: 30 });
    expect(materialPositionFromKind("document", 50, null)).toEqual({ position: 0, percent: 50 });
  });
});

describe("素材进度与标注路由", () => {
  // 统一构造 drizzle 链式 mock：rows 为最终 await 结果，带 leftJoin 的用于素材校验查询。
  const chain = (rows: unknown[], withJoin = false) => {
    const promise = Promise.resolve(rows);
    const builder: Record<string, unknown> = {
      from: () => builder,
      leftJoin: () => builder,
      where: () => builder,
      orderBy: () => builder,
      limit: () => promise,
      then: (resolve: (value: unknown) => void, reject: (reason?: unknown) => void) => promise.then(resolve, reject),
    };
    return withJoin ? builder : builder;
  };

  it("保存素材进度时按素材均值重算课程进度并写完成时间", async () => {
    const inserts: Record<string, unknown>[] = [];
    const updates: Record<string, unknown>[] = [];
    const material = { material: { materialType: "document", mimeType: "text/markdown", courseId: 5 }, lifecycleStatus: "published" };
    const selects: Array<() => unknown> = [
      () => chain([material]),
      () => chain([{ id: 9, userId: 7, materialId: 2, position: 0, percent: 60, minutes: 7 }]),
      () => chain([{ id: 1 }, { id: 2 }]),
      () => chain([{ materialId: 1, percent: 100 }, { materialId: 2, percent: 60 }]),
      () => chain([{ progress: 80 }]),
    ];
    mocks.getDb.mockResolvedValue({
      select: vi.fn(() => { const builder = selects.shift()!; return builder(); }),
      insert: vi.fn(() => ({ values: vi.fn((value: unknown) => { inserts.push(value); return { onDuplicateKeyUpdate: async ({ set }: { set: Record<string, unknown> }) => { updates.push(set); } }; }) })),
    });
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.learning.saveMaterialProgress({ materialId: 2, position: 0, percent: 60, minutesDelta: 3 })).resolves.toMatchObject({ materialPercent: 60, coursePercent: 80 });
    expect(inserts).toHaveLength(2);
    expect(inserts[0]).toMatchObject({ userId: 7, materialId: 2, percent: 60, minutes: 3 });
    expect(inserts[1]).toMatchObject({ userId: 7, courseId: 5, progress: 80, lastMaterialId: 2 });
    expect(updates).toHaveLength(2);
  });

  it("视频文件误标为文档时仍按视频记录秒数进度以支持续播", async () => {
    const inserts: Record<string, unknown>[] = [];
    const material = { material: { materialType: "document", mimeType: "video/mp4", courseId: 5 }, lifecycleStatus: "published" };
    const selects: Array<() => unknown> = [
      () => chain([material]),
      () => chain([{ id: 9, userId: 7, materialId: 1, position: 42, percent: 55, minutes: 1 }]),
      () => chain([{ id: 1 }]),
      () => chain([{ materialId: 1, percent: 55 }]),
      () => chain([{ progress: 55 }]),
    ];
    mocks.getDb.mockResolvedValue({
      select: vi.fn(() => { const builder = selects.shift()!; return builder(); }),
      insert: vi.fn(() => ({ values: vi.fn((value: unknown) => { inserts.push(value); return { onDuplicateKeyUpdate: async () => undefined }; }) })),
    });
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.learning.saveMaterialProgress({ materialId: 1, position: 42, percent: 55, minutesDelta: 1 })).resolves.toMatchObject({ materialPercent: 55 });
    expect(inserts[0]).toMatchObject({ position: 42, percent: 55 });
  });

  it("标注只能保存到已发布课程的素材并归属本人", async () => {
    const inserts: unknown[] = [];
    mocks.getDb.mockResolvedValue({
      select: vi.fn(() => chain([{ material: { materialType: "document", mimeType: "application/pdf", courseId: 5 }, lifecycleStatus: "published" }])),
      insert: vi.fn(() => ({ values: vi.fn((value: unknown) => { inserts.push(value); return { $returningId: async () => [{ id: 9 }] }; }) })),
    });
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.learning.addAnnotation({ materialId: 2, page: 3, rects: [{ x: 0.1, y: 0.1, w: 0.3, h: 0.2 }], note: "关键结论", color: "sky" })).resolves.toEqual({ id: 9, success: true });
    expect(inserts).toEqual([expect.objectContaining({ userId: 7, materialId: 2, page: 3, note: "关键结论", color: "sky" })]);
  });
});

describe("平台 AI 助手路由", () => {
  const chain = (rows: unknown[]) => {
    const promise = Promise.resolve(rows);
    const builder: Record<string, unknown> = { from: () => builder, where: () => builder, limit: () => promise, then: (resolve: (value: unknown) => void, reject: (reason?: unknown) => void) => promise.then(resolve, reject) };
    return builder;
  };

  it("把页面上下文注入系统提示词，携带历史并保存问答记录", async () => {
    const inserts: unknown[] = [];
    const selects: Array<() => unknown> = [() => chain([{ count: 0 }]), () => chain([])];
    mocks.getDb.mockResolvedValue({
      select: vi.fn(() => { const builder = selects.shift()!; return builder(); }),
      insert: vi.fn(() => ({ values: vi.fn((value: unknown) => { inserts.push(value); return { $returningId: async () => [{ id: 1 }] }; }) })),
    });
    mocks.invokeLLM.mockClear();
    mocks.invokeLLM.mockResolvedValue({ model: "deepseek-v4", choices: [{ message: { content: "这篇文章的三个要点是……" } }] });
    const employee = platformRouter.createCaller(ctx("user"));
    const result = await employee.assistant.chat({
      question: "这篇文章讲了什么？",
      pageContext: { route: "/news/3", pageKind: "newsArticle", title: "从会用到用好：企业 AI 学习的三个关键动作", excerpt: "围绕场景优先、模板沉淀和结果复盘，建立可复制的 AI 能力成长路径。", selection: "" },
      history: [{ role: "user", content: "之前问过的问题" }, { role: "assistant", content: "之前的回答" }],
    });
    expect(result).toMatchObject({ modelId: "deepseek-v4" });
    // 系统提示词包含平台知识库 + 注入的页面上下文
    const systemMessage = (mocks.invokeLLM.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }).messages[0];
    expect(systemMessage.role).toBe("system");
    expect(systemMessage.content).toContain("全员 AI 能力提升平台");
    expect(systemMessage.content).toContain("/news/3");
    expect(systemMessage.content).toContain("资讯文章阅读页");
    expect(systemMessage.content).toContain("场景优先、模板沉淀");
    // 历史与当前问题按序传递
    const userMessages = (mocks.invokeLLM.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }).messages;
    expect(userMessages).toHaveLength(4);
    expect(userMessages[1]).toMatchObject({ role: "user", content: "之前问过的问题" });
    expect(userMessages.at(-1)).toMatchObject({ role: "user", content: "这篇文章讲了什么？" });
    // 问答记录归属当前用户并带页面信息
    expect(inserts).toEqual([expect.objectContaining({ userId: 7, pageRoute: "/news/3", pageKind: "newsArticle" })]);
  });

  it("超出每日 60 次限额时拒绝并要求登录后使用", async () => {
    const selects: Array<() => unknown> = [() => chain([{ count: 60 }])];
    mocks.getDb.mockResolvedValue({ select: vi.fn(() => { const builder = selects.shift()!; return builder(); }), insert: vi.fn() });
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.assistant.chat({ question: "再问一次", pageContext: null, history: [] })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    const anonymous = platformRouter.createCaller({ user: null } as never);
    await expect(anonymous.assistant.chat({ question: "未登录", pageContext: null, history: [] })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("系统提示词在无页面上下文时保留占位说明", () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("{{PAGE_CONTEXT}}");
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("学习中心");
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("弹幕");
  });

  it("清空历史通过当前登录用户作用域执行", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn(() => ({ where }));
    mocks.getDb.mockResolvedValue({ delete: remove });
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.assistant.clearHistory()).resolves.toEqual({ success: true });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });
});
