import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { ownedFavoriteValues, ownedProgressValues, ownedWorkspaceValues, parseAuditResult, personalInput, reviewStatusFromDecision, validateImageDataUrl } from "./routers/platform";
import { buildLearningRecommendations } from "./db";
import type { TrpcContext } from "./_core/context";

const baseRequest = { protocol: "https", headers: {} } as TrpcContext["req"];
const baseResponse = { clearCookie: () => undefined } as unknown as TrpcContext["res"];

function createContext(role: "user" | "admin" | null): TrpcContext {
  return {
    req: baseRequest,
    res: baseResponse,
    user: role ? { id: 7, openId: "test-user", name: "Test User", email: "test@example.com", loginMethod: "local", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } : null,
  };
}

describe("platform access boundaries", () => {
  it("rejects personal data access without an authenticated employee", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.platform.personal.get()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects operations data access for an employee account", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    await expect(caller.platform.operations.get()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects automatic audit execution for an employee account", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    await expect(caller.platform.operations.runAudit({ newsId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects community list, detail and draft attachment cleanup without an authenticated employee", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.platform.catalog()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.platform.applications.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.platform.community.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.platform.community.detail({ postId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.platform.community.attachmentAccess({ id: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.platform.community.discardAttachment({ id: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("private data mutation contracts", () => {
  it("does not accept client-provided user identifiers for progress, favorites or Workspace writes", () => {
    expect(personalInput.updateProgress.safeParse({ courseId: 1, progress: 60, userId: 99 }).success).toBe(false);
    expect(personalInput.toggleFavorite.safeParse({ newsId: 1, userId: 99 }).success).toBe(false);
    expect(personalInput.addWorkspaceItem.safeParse({ title: "报告模板", description: "生成项目周报", destination: "/#learn", icon: "sparkles", color: "violet", userId: 99 }).success).toBe(false);
  });

  it("binds progress, favorites and Workspace rows to the authenticated user id", () => {
    const progress = ownedProgressValues(7, { courseId: 2, progress: 100 });
    const favorite = ownedFavoriteValues(7, 9);
    const workspace = ownedWorkspaceValues(7, { title: "周报模板", description: "生成周报初稿", destination: "/#learn", icon: "sparkles", color: "violet" }, 3);
    expect(progress).toMatchObject({ userId: 7, courseId: 2, progress: 100 });
    expect(favorite).toEqual({ userId: 7, newsId: 9 });
    expect(workspace).toMatchObject({ userId: 7, orderIndex: 3, title: "周报模板" });
  });
});

describe("audit decision normalization", () => {
  it("maps every audit outcome to a valid news visibility status", () => {
    expect(reviewStatusFromDecision("approved")).toBe("approved");
    expect(reviewStatusFromDecision("needs_review")).toBe("needs_review");
    expect(reviewStatusFromDecision("rejected")).toBe("rejected");
  });
});

describe("learning recommendation and audit contracts", () => {
  it("prioritizes an unfinished learning path over merely matching tags", () => {
    const result = buildLearningRecommendations(
      [{ id: 1, title: "AI 起步", tags: ["零基础"], isFeatured: 1 }, { id: 2, title: "办公提效", tags: ["办公提效"], isFeatured: 1 }],
      [{ id: 11, pathId: 1 }, { id: 12, pathId: 2 }],
      [{ courseId: 11, progress: 60 }],
      { abilityTags: ["AI 学习者"], interestTags: ["办公提效"] },
    );
    expect(result[0]).toMatchObject({ path: { id: 1 }, progress: 60 });
    expect(result[0]?.reason).toContain("继续完成");
  });

  it("validates the structured AI audit result before it can update content status", () => {
    expect(parseAuditResult('{"decision":"needs_review","riskLevel":"medium","confidence":84,"reason":"来源需要复核","matchedRules":["事实与来源可追溯"]}')).toMatchObject({ decision: "needs_review", confidence: 84 });
    expect(() => parseAuditResult('{"decision":"approved"}')).toThrow();
  });
});

describe("rich community content safeguards", () => {
  it("accepts image data URLs only when media type and payload are valid", () => {
    expect(validateImageDataUrl("data:image/png;base64,aGVsbG8=", "image/png").length).toBe(5);
    expect(() => validateImageDataUrl("data:text/plain;base64,aGVsbG8=", "image/png")).toThrow();
  });
});
