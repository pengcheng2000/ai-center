import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  discardDraftAttachmentForUser: vi.fn(),
  storagePut: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  storageDelete: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: mocks.getDb,
  getOperationsData: vi.fn(),
  getPersonalSpaceByUserId: vi.fn(),
  deleteWorkspaceForUser: vi.fn(),
  discardDraftAttachmentForUser: mocks.discardDraftAttachmentForUser,
  getPublicCatalog: vi.fn(),
  tables: {},
}));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn(), listLLMModels: vi.fn() }));
vi.mock("./_core/heartbeat", () => ({ createHeartbeatJob: vi.fn(), updateHeartbeatJob: vi.fn() }));
vi.mock("./rss", () => ({ fetchRssEntries: vi.fn() }));
vi.mock("./storage", () => ({ storagePut: mocks.storagePut, storageGetSignedUrl: mocks.storageGetSignedUrl, storageDelete: mocks.storageDelete }));
vi.mock("./courseCapture", () => ({ capturePublicDocument: vi.fn() }));

import { canManagePost, platformRouter, shapePostContent } from "./routers/platform";

const AUTHOR_ID = 7;
const OTHER_ID = 21;

const ctx = (role: "user" | "admin", id = AUTHOR_ID): TrpcContext => ({
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  user: { id, openId: `mock-${id}`, name: "Mock", email: "mock@example.com", loginMethod: "local", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
});

// 单查询链：select().from().where().limit() 与 select().from().where() 都解析到同一批行。
const chain = (rows: unknown[]) => {
  const promise = Promise.resolve(rows);
  const builder: Record<string, unknown> = {
    from: () => builder, where: () => builder, leftJoin: () => builder, innerJoin: () => builder,
    orderBy: () => builder, groupBy: () => builder, limit: () => promise,
    then: (resolve: (value: unknown) => void, reject: (reason?: unknown) => void) => promise.then(resolve, reject),
  };
  return builder;
};

type Capture = { updates: unknown[]; deletes: number; inserts: unknown[] };

const dbWith = (rows: unknown[][]): { db: unknown; capture: Capture } => {
  const queue = [...rows];
  const capture: Capture = { updates: [], deletes: 0, inserts: [] };
  const db = {
    select: vi.fn(() => chain(queue.length ? queue.shift()! : [])),
    update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: async () => { capture.updates.push(value); } })) })),
    insert: vi.fn(() => ({ values: vi.fn((value: unknown) => { capture.inserts.push(value); return { $returningId: async () => [{ id: 31 }] }; }) })),
    delete: vi.fn(() => ({ where: async () => { capture.deletes += 1; } })),
  };
  return { db, capture };
};

describe("社区帖子权限判定", () => {
  it("作者本人与管理员可管理，其他员工不可", () => {
    expect(canManagePost({ id: AUTHOR_ID, role: "user" }, AUTHOR_ID)).toBe(true);
    expect(canManagePost({ id: OTHER_ID, role: "user" }, AUTHOR_ID)).toBe(false);
    expect(canManagePost({ id: OTHER_ID, role: "admin" }, AUTHOR_ID)).toBe(true);
  });

  it("正文出库时把附件占位替换为签名 URL 并派生摘要", () => {
    const shaped = shapePostContent(
      { content: "派生纯文本", contentMarkdown: "![封面](attachment:5)\n\n## 做法\n\n先拆解再验证", contentHtml: null, contentFormat: "markdown" },
      [{ id: 5, url: "/api/files/cover.png?sig=abc" }],
    );
    expect(shaped.markdown).toContain("![封面](/api/files/cover.png?sig=abc)");
    expect(shaped.preview).toBe("做法 先拆解再验证");
  });
});

describe("社区帖子写入路由", () => {
  it("创建实践时存 Markdown 并派生纯文本摘要", async () => {
    const { db, capture } = dbWith([]);
    mocks.getDb.mockResolvedValue(db);
    const caller = platformRouter.createCaller(ctx("user"));
    await expect(caller.community.create({ postType: "experience", title: "图文并茂的实践复盘", markdown: "## 背景\n\n用 AI 做周报，**节省 2 小时**。\n\n![截图](attachment:5)", tags: ["周报"], replyPolicy: "all", attachmentIds: [5] })).resolves.toEqual({ success: true, postId: 31 });
    expect(capture.inserts[0]).toMatchObject({ authorId: AUTHOR_ID, contentFormat: "markdown", content: "背景 用 AI 做周报，节省 2 小时。" });
    expect(capture.updates).toHaveLength(1);
  });

  it("拒绝清洗后为空的正文", async () => {
    mocks.getDb.mockResolvedValue(dbWith([]).db);
    const caller = platformRouter.createCaller(ctx("user"));
    await expect(caller.community.create({ postType: "experience", title: "只有脚本的正文", markdown: "<script>alert(1)</script>", tags: [], replyPolicy: "all" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("只有作者或管理员能编辑，编辑会记录时间并清理被移除的图片", async () => {
    const { db, capture } = dbWith([[{ id: 4, authorId: AUTHOR_ID }], [{ id: 5, fileKey: "community/7/a.png" }]]);
    mocks.getDb.mockResolvedValue(db);
    mocks.storageDelete.mockResolvedValue(undefined);
    await expect(platformRouter.createCaller(ctx("user")).community.update({ postId: 4, postType: "experience", title: "修订后的实践复盘", markdown: "## 更新\n\n补充了验证结果与边界。\n\n![旧图](attachment:5)", tags: ["复盘"], replyPolicy: "all", removedAttachmentIds: [5] })).resolves.toEqual({ success: true, postId: 4 });
    expect(capture.updates[0]).toMatchObject({ contentFormat: "markdown", editedAt: expect.any(Date) });
    expect(String((capture.updates[0] as { contentMarkdown: string }).contentMarkdown)).not.toContain("attachment:5");
    expect(mocks.storageDelete).toHaveBeenCalledWith("community/7/a.png");

    mocks.getDb.mockResolvedValue(dbWith([[{ id: 4, authorId: AUTHOR_ID }]]).db);
    await expect(platformRouter.createCaller(ctx("user", OTHER_ID)).community.update({ postId: 4, postType: "experience", title: "越权编辑他人实践", markdown: "尝试改掉别人的内容。", tags: [], replyPolicy: "all" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("社区删除与治理", () => {
  it("作者删除自己的实践走软删除", async () => {
    const { db, capture } = dbWith([[{ id: 4, authorId: AUTHOR_ID }]]);
    mocks.getDb.mockResolvedValue(db);
    await expect(platformRouter.createCaller(ctx("user")).community.remove({ postId: 4 })).resolves.toEqual({ success: true });
    expect(capture.updates[0]).toMatchObject({ isDeleted: 1, deletedBy: AUTHOR_ID, deletionReason: "作者主动删除" });
  });

  it("管理员删除他人实践必须写原因，普通员工不能删他人实践", async () => {
    mocks.getDb.mockResolvedValue(dbWith([[{ id: 4, authorId: AUTHOR_ID }]]).db);
    await expect(platformRouter.createCaller(ctx("admin", OTHER_ID)).community.remove({ postId: 4 })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const { db, capture } = dbWith([[{ id: 4, authorId: AUTHOR_ID }]]);
    mocks.getDb.mockResolvedValue(db);
    await expect(platformRouter.createCaller(ctx("admin", OTHER_ID)).community.remove({ postId: 4, reason: "含未公开经营数据" })).resolves.toEqual({ success: true });
    expect(capture.updates[0]).toMatchObject({ isDeleted: 1, deletedBy: OTHER_ID, deletionReason: "含未公开经营数据" });

    mocks.getDb.mockResolvedValue(dbWith([[{ id: 4, authorId: AUTHOR_ID }]]).db);
    await expect(platformRouter.createCaller(ctx("user", OTHER_ID)).community.remove({ postId: 4 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("恢复、置顶精选与运营列表仅管理员可用", async () => {
    const { db, capture } = dbWith([]);
    mocks.getDb.mockResolvedValue(db);
    const admin = platformRouter.createCaller(ctx("admin", OTHER_ID));
    await expect(admin.community.restore({ postId: 4, reason: "已整改完成" })).resolves.toEqual({ success: true });
    expect(capture.updates[0]).toMatchObject({ isDeleted: 0, deletedAt: null, deletedBy: null });
    await expect(admin.community.setPromotion({ postId: 4, isPinned: true, isFeatured: true })).resolves.toEqual({ success: true });
    expect(capture.updates[1]).toEqual({ isPinned: 1, isFeatured: 1 });
    await expect(admin.community.setPromotion({ postId: 4 })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.community.restore({ postId: 4, reason: "越权恢复" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(employee.community.setPromotion({ postId: 4, isPinned: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(employee.community.adminPosts({ status: "all" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("删除讨论只允许本人或管理员，并把评论数收敛到不小于零", async () => {
    const { db, capture } = dbWith([[{ id: 9, authorId: AUTHOR_ID, postId: 4 }]]);
    mocks.getDb.mockResolvedValue(db);
    await expect(platformRouter.createCaller(ctx("user")).community.deleteComment({ commentId: 9 })).resolves.toEqual({ success: true });
    expect(capture.deletes).toBe(1);
    expect(capture.updates).toHaveLength(1);

    mocks.getDb.mockResolvedValue(dbWith([[{ id: 9, authorId: AUTHOR_ID, postId: 4 }]]).db);
    await expect(platformRouter.createCaller(ctx("user", OTHER_ID)).community.deleteComment({ commentId: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });

    mocks.getDb.mockResolvedValue(dbWith([[]]).db);
    await expect(platformRouter.createCaller(ctx("admin", OTHER_ID)).community.deleteComment({ commentId: 99 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("社区读取路由", () => {
  it("详情返回渲染用 Markdown、编辑权限与逐条讨论删除权限", async () => {
    const post = { id: 4, authorId: AUTHOR_ID, postType: "experience", title: "实践", content: "派生", contentMarkdown: "![图](attachment:5)\n\n正文内容", contentHtml: null, contentFormat: "markdown", tags: ["复盘"], replyPolicy: "all", isPinned: 0, isFeatured: 0, likeCount: 1, commentCount: 1, isDeleted: 0, quotePostId: null, editedAt: null, createdAt: new Date(), updatedAt: new Date() };
    const { db } = dbWith([
      [{ post, authorName: "作者" }],
      [{ id: 5, postId: 4, fileKey: "community/7/a.png", fileName: "a.png", mimeType: "image/png", sizeBytes: 10 }],
      [{ comment: { id: 9, authorId: OTHER_ID, postId: 4, content: "补充", createdAt: new Date() }, authorName: "同事" }],
      [{ id: 12 }],
    ]);
    mocks.getDb.mockResolvedValue(db);
    mocks.storageGetSignedUrl.mockResolvedValue("/api/files/a.png?sig=abc");
    const detail = await platformRouter.createCaller(ctx("user")).community.detail({ postId: 4 });
    expect(detail).toMatchObject({ canEdit: true, canModerate: false, liked: true });
    expect(detail?.markdown).toContain("![图](/api/files/a.png?sig=abc)");
    expect(detail?.comments[0]).toMatchObject({ canDelete: false });
  });

  it("讨论列表需要登录", async () => {
    const caller = platformRouter.createCaller({ user: null } as never);
    await expect(caller.community.comments({ postId: 4 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.community.update({ postId: 4, postType: "experience", title: "未登录编辑", markdown: "未登录不应该能改内容。", tags: [], replyPolicy: "all" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.community.remove({ postId: 4 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.community.deleteComment({ commentId: 9 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
