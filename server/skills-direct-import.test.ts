import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), storagePut: vi.fn() }));
vi.mock("./db", async importOriginal => ({ ...(await importOriginal<typeof import("./db")>()), getDb: mocks.getDb, getOperationsData: vi.fn(), getPersonalSpaceByUserId: vi.fn(), deleteWorkspaceForUser: vi.fn(), discardDraftAttachmentForUser: vi.fn(), getPublicCatalog: vi.fn(), tables: {} }));
vi.mock("./storage", () => ({ storagePut: mocks.storagePut, storageGetSignedUrl: vi.fn() }));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn(), listLLMModels: vi.fn() }));
vi.mock("./_core/heartbeat", () => ({ createHeartbeatJob: vi.fn(), updateHeartbeatJob: vi.fn() }));
vi.mock("./newsSync", () => ({ syncRssSourceById: vi.fn() }));
vi.mock("./courseCapture", () => ({ capturePublicDocument: vi.fn() }));

import { findDuplicateSkillKeys, platformRouter } from "./routers/platform";

const item = { skillKey: "patent-research", name: "专利检索助手", summary: "将专利检索任务整理为可复用的标准工作流。", description: "适用于企业研发检索与初步专利信息归档，不替代正式法律意见。", category: "研发效能", tags: ["专利", "检索"], version: "v1.0", skillMd: "# 专利检索助手\n\n## 功能\n\n提供经授权资料的结构化检索流程。", usageGuide: "输入待检索的技术主题，按步骤核验来源并输出检索清单和风险说明。", packageFileName: "patent-research.zip", packageMimeType: "application/zip" as const, packageDataUrl: "data:application/zip;base64,UEsDBA==" };
const ctx = (role: "admin" | "user") => ({ req: {} as never, res: {} as never, user: { id: 7, role, openId: "test", name: "测试用户" } } as never);

describe("管理员直接批量导入 Skills", () => {
  it("拒绝同一批次的重复 Skills 标识", () => {
    expect(findDuplicateSkillKeys([{ skillKey: "a" }, { skillKey: "b" }, { skillKey: "a" }])).toEqual(["a"]);
  });

  it("拒绝非管理员调用直接导入", async () => {
    const employee = platformRouter.createCaller(ctx("user"));
    await expect(employee.skills.directImport({ items: [item], publishImmediately: false, importNote: "已核对来源与安装包。" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("按管理员来源、同批次标识和待审核状态写入已校验的安装包", async () => {
    const inserted: unknown[] = []; const where = vi.fn(async () => []); const from = vi.fn(() => ({ where }));
    mocks.getDb.mockResolvedValue({ select: vi.fn(() => ({ from })), insert: vi.fn(() => ({ values: vi.fn((value: unknown) => { inserted.push(value); return { $returningId: async () => [{ id: 1 }] }; }) })) });
    mocks.storagePut.mockResolvedValue({ key: "skills/admin/7/patent-research.zip" });
    const admin = platformRouter.createCaller(ctx("admin"));
    await expect(admin.skills.directImport({ items: [item], publishImmediately: false, importNote: "已核对来源与安装包。" })).resolves.toMatchObject({ success: true, imported: 1, reviewStatus: "pending", batchKey: expect.stringMatching(/^admin-/) });
    expect(mocks.storagePut).toHaveBeenCalledWith(expect.stringContaining("skills/admin/7/admin-"), expect.any(Buffer), "application/zip");
    expect(inserted).toEqual([expect.arrayContaining([expect.objectContaining({ authorId: 7, submissionSource: "admin_direct", reviewStatus: "pending", importBatchKey: expect.stringMatching(/^admin-/) })])]);
  });
});
