import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, like, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { agentImportJobs, agentImportKeys, assistantChats, auditAgents, auditRecords, auditRules, communityPosts, communityTopicFollows, communityTopics, courseMaterialAnnotations, courseMaterialComments, courseMaterialProgress, courseMaterials, coursePracticeRuns, courseProgress, courses, enterpriseApps, featureModules, learningPaths, llmModels, llmProviders, modelRoutingPolicies, newsFavorites, newsItems, newsReadEvents, newsSources, postAttachments, postComments, postFavorites, postLikes, skillDownloads, skillPackages, skillReviews, userProfiles, users, workspaceItems } from "../../drizzle/schema";
import { discardDraftAttachmentForUser, deleteWorkspaceForUser, getDb, getOperationsData, getPersonalSpaceByUserId, getPublicCatalog, tables } from "../db";
import { invokeLLM, listLLMModels } from "../_core/llm";
import { ENV } from "../_core/env";
import { createHeartbeatJob, updateHeartbeatJob } from "../_core/heartbeat";
import { DAILY_SYNC_CRON, syncRssSourceById } from "../newsSync";
import { capturePublicDocument } from "../courseCapture";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { storageGetSignedUrl, storagePut } from "../storage";
import { AGENT_IMPORT_TARGETS, applyAgentImportJob, issueAgentImportToken } from "../agentImport";

const stringArray = z.array(z.string().trim().min(1).max(48)).max(12);
export const personalInput = {
  updateProfile: z.object({ headline: z.string().min(2).max(180), department: z.string().max(120).nullable(), roleTitle: z.string().max(120).nullable(), abilityTags: stringArray, interestTags: stringArray, growthGoals: stringArray }).strict(),
  updateProgress: z.object({ courseId: z.number().int().positive(), progress: z.number().int().min(0).max(100) }).strict(),
  toggleFavorite: z.object({ newsId: z.number().int().positive() }).strict(),
  recordNewsRead: z.object({ newsId: z.number().int().positive() }).strict(),
  addWorkspaceItem: z.object({ title: z.string().min(2).max(100), description: z.string().min(2).max(240), destination: z.string().min(1).max(320), icon: z.string().min(2).max(48), color: z.string().min(2).max(24) }).strict(),
  removeWorkspaceItem: z.object({ id: z.number().int().positive() }).strict(),
};
export function ownedProgressValues(userId: number, input: z.infer<typeof personalInput.updateProgress>) { return { userId, courseId: input.courseId, progress: input.progress, completedAt: input.progress === 100 ? new Date() : null }; }
export function ownedFavoriteValues(userId: number, newsId: number) { return { userId, newsId }; }
export function ownedWorkspaceValues(userId: number, input: z.infer<typeof personalInput.addWorkspaceItem>, orderIndex: number) { return { ...input, userId, orderIndex }; }
export function ownedWorkspaceScope(userId: number, id: number) { return { userId, id }; }
export const auditResultSchema = z.object({ decision: z.enum(["approved", "needs_review", "rejected"]), riskLevel: z.enum(["low", "medium", "high", "critical"]), confidence: z.number().int().min(0).max(100), reason: z.string().min(1), matchedRules: z.array(z.string()) }).strict();
export function parseAuditResult(content: string) { return auditResultSchema.parse(extractAuditJson(content)); }
// 审核模型的输出可能带 markdown 围栏、前后缀说明，甚至把 JSON 再包一层字符串；逐层容错解析。
function extractAuditJson(content: string): unknown {
  const trimmed = content.trim();
  let candidate = trimmed;
  try {
    return unwrapAuditJson(JSON.parse(candidate));
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    candidate = (fenced ? fenced[1] : trimmed).trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      const start = candidate.indexOf("{");
      const end = candidate.lastIndexOf("}");
      if (start === -1 || end === -1 || end <= start) throw new Error("审核结果中未找到 JSON 对象");
      parsed = JSON.parse(candidate.slice(start, end + 1));
    }
    return unwrapAuditJson(parsed);
  }
}

function unwrapAuditJson(parsed: unknown): unknown {
  let result = parsed;
  for (let depth = 0; typeof result === "string" && depth < 3; depth += 1) {
    result = JSON.parse(result);
  }
  return result;
}
export function sanitizeRichText(input: string) {
  const withoutDangerousBlocks = input.replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, "");
  const withoutHandlers = withoutDangerousBlocks.replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "").replace(/\sstyle\s*=\s*(['"]).*?\1/gi, "");
  const onlyKnownTags = withoutHandlers.replace(/<(?!\/?(p|br|strong|b|em|i|u|ul|ol|li|blockquote|a|img|h2|h3)(\s|>|\/))/gi, "&lt;");
  return onlyKnownTags.replace(/<a\s+([^>]*?)href\s*=\s*(['"])(?!https?:\/\/|\/)[^'"]*\2([^>]*)>/gi, "<a>").replace(/<img\b[^>]*>/gi, "<p>【已添加图片附件】</p>").trim();
}
export function plainTextFromRichText(input: string) { return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
export function validateImageDataUrl(dataUrl: string, mimeType: string) {
  const match = dataUrl.match(/^data:(image\/(png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match || match[1] !== mimeType) throw new TRPCError({ code: "BAD_REQUEST", message: "仅支持 PNG、JPEG、WebP 或 GIF 图片" });
  const buffer = Buffer.from(match[3], "base64");
  if (buffer.length > 5 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "单张图片不能超过 5MB" });
  return buffer;
}

export const ANNOTATION_COLORS = ["amber", "violet", "rose", "emerald", "sky"] as const;
export const annotationColorInput = z.enum(ANNOTATION_COLORS);

// 平台 AI 助手的页面类型中文标签，注入系统提示词让模型理解用户所处位置。
export const ASSISTANT_PAGE_KIND_LABEL: Record<string, string> = {
  home: "工作台首页", learn: "学习中心", learningPath: "学习路径详情", course: "课程学习页",
  newsList: "AI 资讯列表", newsArticle: "资讯文章阅读页", communityList: "实践社区列表", postDetail: "社区帖子详情",
  skillsHub: "Skills 广场", skillDetail: "Skills 详情", profile: "个人空间", operations: "运营管理", apps: "应用中心", other: "其他页面",
};

// 助手系统提示词：平台使用指导 + 页面上下文阅读协助，行为边界对齐企业规范。
export const ASSISTANT_SYSTEM_PROMPT = [
  "你是「全员 AI 能力提升平台」的内置 AI 助手小智，帮助员工用好平台、读懂内容、解答 AI 相关问题。",
  "",
  "## 平台功能速查（指导使用时以此为准，不确定的功能就说不知道）",
  "- 工作台（/）：个人能力画像、学习推荐、常用入口。",
  "- 学习中心（/learn）：按路径学习。视频支持弹幕/倍速/时间戳评论/断点续播；PDF 支持拖选标注（仅自己可见）与翻页进度；文档按滚动位置记进度；课程内可评论交流。观看与阅读进度自动累计，全部素材完成后自动结课。",
  "- 学习路径详情（/learn/:id）：路径任务清单、整体进度、逐节直达。",
  "- 课程学习页（/learn/:pathId/course/:courseId）：左侧学习内容 + 右侧学习导航（素材进度清单）。右下角悬浮球可打开本助手。",
  "- AI 资讯（/news）：已审核的 AI 动态，文章页支持阅读记录与收藏。",
  "- 实践社区（/community）：发帖、点赞、评论、话题关注。",
  "- 应用中心（/apps）：企业 AI 应用入口。",
  "- Skills 广场（/skills）：员工沉淀的可复用 AI 技能包，支持提交、评分、下载安装。",
  "- 个人空间（/me）：能力画像与学习统计（连续天数、本周分钟数）。",
  "",
  "## 当前页面上下文",
  "{{PAGE_CONTEXT}}",
  "",
  "## 回答要求",
  "1. 若用户问「这个页面/这篇文章讲了什么」，优先基于页面上下文正文摘录作答；摘录不足时如实说明并建议用户补充。",
  "2. 若用户问「怎么用/在哪里」，基于平台功能速查给出具体路径与操作步骤，必要时提示页面入口。",
  "3. 若用户选中的文字在上下文中，回答时优先围绕选中内容（解释、翻译、改写、提炼）。",
  "4. 涉及平台没有的功能，直说当前版本不支持，不要编造。",
  "5. 不处理敏感个人信息与未公开经营数据；建议不构成业务审批结论。",
  "6. 用简体中文，结构清晰，先结论后展开，篇幅与问题复杂度匹配。",
].join("\n");
const annotationRectInput = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().min(0.001).max(1), h: z.number().min(0.001).max(1) });
export const annotationInput = z.object({ materialId: z.number().int().positive(), page: z.number().int().min(1).max(5_000), rects: z.array(annotationRectInput).min(1).max(8), note: z.string().trim().min(1).max(2_000), color: annotationColorInput.default("amber") }).strict();
export function ownedAnnotationValues(userId: number, input: z.infer<typeof annotationInput>) { return { materialId: input.materialId, userId, page: input.page, rects: input.rects, note: input.note, color: input.color }; }

// 视频判定兼容“上传了视频文件但类型仍选了文档”的历史数据：mime 为 video/* 一律按视频处理。
export function isVideoMaterial(material: { materialType: "document" | "video" | "practice"; mimeType: string | null }) { return material.materialType === "video" || (material.mimeType ?? "").startsWith("video/"); }

// 视频记录秒数、PDF 记录当前页、文档记录滚动百分比；durationSeconds 仅在能确定分母时使用。
export function materialPositionFromKind(kind: "video" | "pdf" | "document", position: number, durationSeconds?: number | null) {
  if (kind === "video") return { position: Math.max(0, Math.round(position)), percent: durationSeconds ? Math.min(100, Math.round(position / durationSeconds * 100)) : 0 };
  if (kind === "pdf") return { position: Math.max(1, Math.round(position)), percent: durationSeconds ? Math.min(100, Math.round(position / durationSeconds * 100)) : 0 };
  return { position: 0, percent: Math.max(0, Math.min(100, Math.round(position))) };
}

// 学习分钟数按“有素材记录以来的自然天数”粗略分摊，避免把历史累计一次性记到今天。
export function deriveMaterialMinutes(kind: "video" | "pdf" | "document", position: number, percent: number, secondsWatched: number, elapsedMs: number) {
  if (kind === "video") return Math.max(0, Math.round(secondsWatched / 60));
  return Math.max(0, Math.min(180, Math.round(elapsedMs / 60_000)));
}

const sourceInput = z.object({ name: z.string().min(2).max(140), url: z.string().url().max(500), sourceType: z.enum(["rss", "website", "api", "manual"]), category: z.string().min(2).max(80), description: z.string().max(1000).optional(), isEnabled: z.boolean(), reviewStatus: z.enum(["current", "due", "overdue"]).default("current") });
const moduleInput = z.object({ moduleKey: z.string().min(2).max(64), name: z.string().min(2).max(100), description: z.string().min(2).max(240), destination: z.string().min(1).max(320), icon: z.string().min(2).max(48), audience: z.enum(["all", "employee", "admin"]), isEnabled: z.boolean(), orderIndex: z.number().int().min(0).max(999) });
const providerInput = z.object({ name: z.string().min(2).max(120), providerType: z.enum(["openai", "anthropic", "azure_openai", "custom"]), baseUrl: z.string().min(2).max(600), keyAlias: z.string().min(2).max(120), healthStatus: z.enum(["unknown", "healthy", "degraded", "disabled"]), isEnabled: z.boolean(), reviewStatus: z.enum(["current", "due", "overdue"]).default("current"), orderIndex: z.number().int().min(0).max(999) });
const modelInput = z.object({ providerId: z.number().int().positive(), modelId: z.string().min(2).max(160), displayName: z.string().min(2).max(160), capabilityTags: stringArray, scenarioTags: stringArray, contextWindow: z.number().int().min(0).max(2_000_000), isDefault: z.boolean(), isEnabled: z.boolean(), orderIndex: z.number().int().min(0).max(999) });
const policyInput = z.object({ name: z.string().min(2).max(120), scenario: z.enum(["default", "audit", "learning", "content"]), primaryModelId: z.number().int().positive().nullable(), fallbackModelIds: z.array(z.number().int().positive()).max(8), isEnabled: z.boolean() });
const agentInput = z.object({ id: z.number().int().positive(), name: z.string().min(2).max(120), description: z.string().min(6).max(1200), selectedModelId: z.number().int().positive(), confidenceThreshold: z.number().int().min(0).max(100), isEnabled: z.boolean() });
const enterpriseAppInput = z.object({ name: z.string().min(2).max(120), description: z.string().min(4).max(500), appUrl: z.string().url().max(600).refine(value => { const url = new URL(value); return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password; }, "应用入口仅支持不含凭据的 HTTP(S) 地址"), category: z.string().min(2).max(80), icon: z.string().min(2).max(48), audience: z.enum(["all", "employee", "admin"]), isEnabled: z.boolean(), orderIndex: z.number().int().min(0).max(999) });
const skillTags = z.array(z.string().trim().min(1).max(48)).max(12);
const skillPackageUploadInput = z.object({ skillKey: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/, "Skills 标识仅支持小写字母、数字和连字符"), name: z.string().min(2).max(120), summary: z.string().min(8).max(360), description: z.string().min(20).max(12_000), category: z.string().min(2).max(80), tags: skillTags, version: z.string().min(1).max(40), skillMd: z.string().min(20).max(60_000), usageGuide: z.string().min(20).max(12_000), packageFileName: z.string().min(5).max(180).regex(/\.zip$/i, "Skills 安装包必须为 .zip"), packageMimeType: z.enum(["application/zip", "application/x-zip-compressed"]), packageDataUrl: z.string().min(32).max(12_000_000) });
const directSkillImportInput = z.object({ items: z.array(skillPackageUploadInput).min(1, "请至少添加一个 Skills").max(10, "单次最多直接导入 10 个 Skills"), publishImmediately: z.boolean().default(false), importNote: z.string().trim().min(2).max(4_000) });
const skillReviewInput = z.object({ skillId: z.number().int().positive(), rating: z.number().int().min(1).max(5), comment: z.string().trim().min(2).max(1_000) });
const agentImportKeyInput = z.object({ name: z.string().trim().min(2).max(120), allowedTargets: z.array(z.enum(AGENT_IMPORT_TARGETS)).min(1).max(3), expiresAt: z.string().datetime().nullable().default(null) });
const pathInput = z.object({ title: z.string().min(2).max(160), description: z.string().min(8).max(2000), level: z.enum(["beginner", "intermediate", "advanced"]), category: z.string().min(2).max(80), duration: z.string().min(1).max(40), lessonCount: z.number().int().min(0).max(999), accent: z.string().min(2).max(24), tags: stringArray, prerequisitePathIds: z.array(z.number().int().positive()).max(12), lifecycleStatus: z.enum(["draft", "published", "archived"]), contentOwner: z.string().min(2).max(120).default("待指定"), businessOwner: z.string().min(2).max(120).default("待指定"), reviewStatus: z.enum(["current", "due", "overdue"]).default("current"), reviewDueAt: z.string().date().nullable().default(null), version: z.string().min(1).max(40).default("v1.0"), changeNote: z.string().max(2000).nullable().default(null), isFeatured: z.boolean() });
const courseInput = z.object({ pathId: z.number().int().positive(), title: z.string().min(2).max(180), summary: z.string().min(8).max(2000), duration: z.string().min(1).max(32), orderIndex: z.number().int().min(0).max(999), resourceType: z.enum(["video", "article", "exercise", "template"]), resourceUrl: z.string().url().max(600).nullable(), tags: stringArray, prerequisiteCourseIds: z.array(z.number().int().positive()).max(12), lifecycleStatus: z.enum(["draft", "published", "archived"]), contentOwner: z.string().min(2).max(120).default("待指定"), businessOwner: z.string().min(2).max(120).default("待指定"), reviewStatus: z.enum(["current", "due", "overdue"]).default("current"), reviewDueAt: z.string().date().nullable().default(null), version: z.string().min(1).max(40).default("v1.0"), changeNote: z.string().max(2000).nullable().default(null) });
const materialInput = z.object({ courseId: z.number().int().positive(), materialType: z.enum(["document", "video", "practice"]), sourceType: z.enum(["url", "file", "inline"]), title: z.string().min(2).max(180), description: z.string().max(2000).nullable().default(null), sourceUrl: z.string().url().max(600).nullable().default(null), storageKey: z.string().max(600).nullable().default(null), mimeType: z.string().max(120).nullable().default(null), content: z.string().max(20_000).nullable().default(null), config: z.record(z.string(), z.unknown()).default({}), orderIndex: z.number().int().min(0).max(999).default(0) }).superRefine((value, ctx) => { if (value.materialType === "practice" && value.sourceType !== "inline") ctx.addIssue({ code: "custom", message: "实操型资源仅支持内联任务配置" }); if (value.materialType !== "practice" && !value.sourceUrl && !value.storageKey && !value.content) ctx.addIssue({ code: "custom", message: "文档或视频至少需要链接、文件或内联内容" }); });
const materialUploadInput = z.object({ fileName: z.string().min(1).max(180), mimeType: z.enum(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/markdown", "text/plain", "image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm"]), dataUrl: z.string().min(20).max(18_000_000) });
const topicInput = z.object({ name: z.string().min(2).max(80), description: z.string().min(4).max(280), color: z.string().min(2).max(24), isEnabled: z.boolean(), reviewStatus: z.enum(["current", "due", "overdue"]).default("current"), isFeatured: z.boolean() });

function toFlag(value: boolean) { return value ? 1 : 0; }
function decodeMaterialUpload(dataUrl: string, mimeType: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/); if (!match || match[1] !== mimeType) throw new TRPCError({ code: "BAD_REQUEST", message: "文件数据格式不匹配" });
  const buffer = Buffer.from(match[2], "base64"); if (buffer.length > 12 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "单个课程文件不能超过 12MB" }); return buffer;
}
export function decodeSkillPackageUpload(dataUrl: string, mimeType: "application/zip" | "application/x-zip-compressed") {
  const match = dataUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/); if (!match || match[1] !== mimeType) throw new TRPCError({ code: "BAD_REQUEST", message: "Skills 安装包数据格式不匹配" });
  const buffer = Buffer.from(match[2], "base64"); if (buffer.length > 8 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Skills 安装包不能超过 8MB" });
  if (buffer.length < 4 || buffer.subarray(0, 2).toString("ascii") !== "PK") throw new TRPCError({ code: "BAD_REQUEST", message: "上传文件不是有效的 ZIP 安装包" }); return buffer;
}
export function findDuplicateSkillKeys(items: Array<{ skillKey: string }>) {
  const seen = new Set<string>(); const duplicates = new Set<string>();
  for (const item of items) { if (seen.has(item.skillKey)) duplicates.add(item.skillKey); seen.add(item.skillKey); }
  return Array.from(duplicates);
}
export function reviewStatusFromDecision(decision: "approved" | "needs_review" | "rejected") {
  return decision === "approved" ? "approved" : decision === "rejected" ? "rejected" : "needs_review";
}
function resolveAutomatedDecision(result: { decision: "approved" | "needs_review" | "rejected"; riskLevel: "low" | "medium" | "high" | "critical"; confidence: number }, threshold: number) {
  if (result.confidence < threshold || result.riskLevel === "high" || result.riskLevel === "critical") return "needs_review" as const;
  return result.decision;
}
async function resolveAuditModelId(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, agent: { selectedModelId?: number | null; modelPreference: string }) {
  if (!agent.selectedModelId) return agent.modelPreference;
  const [selected] = await db.select({ modelId: llmModels.modelId, modelEnabled: llmModels.isEnabled, providerEnabled: llmProviders.isEnabled, providerStatus: llmProviders.healthStatus, gatewayStatus: llmProviders.gatewayStatus }).from(llmModels).innerJoin(llmProviders, eq(llmModels.providerId, llmProviders.id)).where(eq(llmModels.id, agent.selectedModelId)).limit(1);
  if (!selected || !selected.modelEnabled || !selected.providerEnabled || selected.providerStatus === "disabled") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "审核员关联的供应商或模型已停用，请在模型治理中启用后重新配置。" });
  if (selected.gatewayStatus !== "verified") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "所选外部模型尚未完成受管网关接入与测试，不能用于实际审核。" });
  return selected.modelId;
}

export const platformRouter = router({
  catalog: publicProcedure.input(z.object({ category: z.string().min(1).max(80).optional(), fullTextOnly: z.boolean().optional() }).optional()).query(({ input }) => getPublicCatalog(input?.category, input?.fullTextOnly)),
  applications: router({
    list: protectedProcedure.query(async () => {
      const db = await getDb(); if (!db) return [];
      return db.select().from(enterpriseApps).where(and(eq(enterpriseApps.isEnabled, 1), sql`${enterpriseApps.audience} != 'admin'`)).orderBy(asc(enterpriseApps.orderIndex));
    }),
  }),
  skills: router({
    list: protectedProcedure.input(z.object({ keyword: z.string().trim().max(80).optional(), category: z.string().trim().max(80).optional(), sort: z.enum(["recent", "rating"]).default("recent") }).optional()).query(async ({ input }) => {
      const db = await getDb(); if (!db) return [];
      const keyword = input?.keyword?.trim(); const category = input?.category?.trim();
      const [skills, ratingRows] = await Promise.all([
        db.select({ skill: skillPackages, authorName: users.name }).from(skillPackages).leftJoin(users, eq(skillPackages.authorId, users.id)).where(and(eq(skillPackages.reviewStatus, "approved"), category ? eq(skillPackages.category, category) : undefined, keyword ? sql`(${skillPackages.name} like ${`%${keyword}%`} or ${skillPackages.summary} like ${`%${keyword}%`} or ${skillPackages.description} like ${`%${keyword}%`} or ${skillPackages.skillKey} like ${`%${keyword}%`} or cast(${skillPackages.tags} as char) like ${`%${keyword}%`})` : undefined)).orderBy(desc(skillPackages.publishedAt), desc(skillPackages.updatedAt)),
        db.select({ skillId: skillReviews.skillId, averageRating: sql<number>`coalesce(avg(${skillReviews.rating}), 0)`, reviewCount: sql<number>`count(${skillReviews.id})` }).from(skillReviews).groupBy(skillReviews.skillId),
      ]);
      const ratings = new Map(ratingRows.map(row => [row.skillId, { averageRating: Number(row.averageRating), reviewCount: Number(row.reviewCount) }]));
      const rows = skills.map(row => ({ ...row, ...(ratings.get(row.skill.id) ?? { averageRating: 0, reviewCount: 0 }) }));
      return input?.sort === "rating" ? rows.sort((left, right) => right.averageRating - left.averageRating || right.reviewCount - left.reviewCount) : rows;
    }),
    categories: protectedProcedure.query(async () => { const db = await getDb(); if (!db) return []; return db.select({ category: skillPackages.category }).from(skillPackages).where(eq(skillPackages.reviewStatus, "approved")).groupBy(skillPackages.category); }),
    mySubmissions: protectedProcedure.query(async ({ ctx }) => { const db = await getDb(); if (!db) return []; return db.select().from(skillPackages).where(eq(skillPackages.authorId, ctx.user.id)).orderBy(desc(skillPackages.updatedAt)); }),
    detail: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [row] = await db.select({ skill: skillPackages, authorName: users.name }).from(skillPackages).leftJoin(users, eq(skillPackages.authorId, users.id)).where(eq(skillPackages.id, input.id)).limit(1);
      if (!row || (row.skill.reviewStatus !== "approved" && row.skill.authorId !== ctx.user.id && ctx.user.role !== "admin")) throw new TRPCError({ code: "NOT_FOUND", message: "该 Skills 暂不可查看" });
      const [ratingSummary, reviews, myReview, downloadSummary, related] = await Promise.all([
        db.select({ averageRating: sql<number>`coalesce(avg(${skillReviews.rating}), 0)`, reviewCount: sql<number>`count(${skillReviews.id})` }).from(skillReviews).where(eq(skillReviews.skillId, input.id)),
        db.select({ review: skillReviews, reviewerName: users.name }).from(skillReviews).leftJoin(users, eq(skillReviews.userId, users.id)).where(eq(skillReviews.skillId, input.id)).orderBy(desc(skillReviews.updatedAt)),
        db.select().from(skillReviews).where(and(eq(skillReviews.skillId, input.id), eq(skillReviews.userId, ctx.user.id))).limit(1),
        db.select({ totalDownloads: sql<number>`coalesce(sum(${skillDownloads.downloadCount}), 0)` }).from(skillDownloads).where(eq(skillDownloads.skillId, input.id)),
        db.select({ id: skillPackages.id, name: skillPackages.name, summary: skillPackages.summary, skillKey: skillPackages.skillKey, category: skillPackages.category, version: skillPackages.version }).from(skillPackages).where(and(eq(skillPackages.reviewStatus, "approved"), eq(skillPackages.category, row.skill.category), ne(skillPackages.id, input.id))).orderBy(desc(skillPackages.publishedAt)).limit(3),
      ]);
      return { ...row, averageRating: Number(ratingSummary[0]?.averageRating ?? 0), reviewCount: Number(ratingSummary[0]?.reviewCount ?? 0), totalDownloads: Number(downloadSummary[0]?.totalDownloads ?? 0), related, reviews, myReview: myReview[0] ?? null };
    }),
    requestDownload: protectedProcedure.input(z.object({ skillId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [skill] = await db.select().from(skillPackages).where(eq(skillPackages.id, input.skillId)).limit(1);
      if (!skill || (skill.reviewStatus !== "approved" && skill.authorId !== ctx.user.id && ctx.user.role !== "admin")) throw new TRPCError({ code: "NOT_FOUND", message: "该 Skills 暂不可下载" });
      const now = new Date(); await db.insert(skillDownloads).values({ skillId: skill.id, userId: ctx.user.id, downloadCount: 1, firstDownloadedAt: now, lastDownloadedAt: now }).onDuplicateKeyUpdate({ set: { downloadCount: sql`${skillDownloads.downloadCount} + 1`, lastDownloadedAt: now } });
      const downloadUrl = await storageGetSignedUrl(skill.packageStorageKey); return { downloadUrl, installCommand: `安装 Skills「${skill.name}」，下载链接：${downloadUrl}` };
    }),
    upsertReview: protectedProcedure.input(skillReviewInput).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [skill] = await db.select({ id: skillPackages.id }).from(skillPackages).where(and(eq(skillPackages.id, input.skillId), eq(skillPackages.reviewStatus, "approved"))).limit(1); if (!skill) throw new TRPCError({ code: "NOT_FOUND", message: "仅可评价已上架 Skills" });
      await db.insert(skillReviews).values({ skillId: input.skillId, userId: ctx.user.id, rating: input.rating, comment: input.comment }).onDuplicateKeyUpdate({ set: { rating: input.rating, comment: input.comment, updatedAt: new Date() } }); return { success: true };
    }),
    deleteReview: protectedProcedure.input(z.object({ skillId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" }); await db.delete(skillReviews).where(and(eq(skillReviews.skillId, input.skillId), eq(skillReviews.userId, ctx.user.id))); return { success: true }; }),
    myAssets: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb(); if (!db) return { submissions: [], downloads: [] };
      const [submissions, downloads] = await Promise.all([
        db.select().from(skillPackages).where(eq(skillPackages.authorId, ctx.user.id)).orderBy(desc(skillPackages.updatedAt)),
        db.select({ download: skillDownloads, skill: skillPackages }).from(skillDownloads).innerJoin(skillPackages, eq(skillDownloads.skillId, skillPackages.id)).where(eq(skillDownloads.userId, ctx.user.id)).orderBy(desc(skillDownloads.lastDownloadedAt)),
      ]); return { submissions, downloads };
    }),
    submit: protectedProcedure.input(skillPackageUploadInput).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [existing] = await db.select({ id: skillPackages.id }).from(skillPackages).where(eq(skillPackages.skillKey, input.skillKey)).limit(1); if (existing) throw new TRPCError({ code: "CONFLICT", message: "该 Skills 标识已被占用，请更换唯一标识" });
      const buffer = decodeSkillPackageUpload(input.packageDataUrl, input.packageMimeType); const safeFileName = input.packageFileName.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_"); const { key } = await storagePut(`skills/${ctx.user.id}/${input.skillKey}-${Date.now()}-${safeFileName}`, buffer, "application/zip");
      const { packageDataUrl, packageMimeType, ...values } = input; await db.insert(skillPackages).values({ ...values, packageStorageKey: key, packageSizeBytes: buffer.length, authorId: ctx.user.id, reviewStatus: "pending" }); return { success: true };
    }),
    directImport: adminProcedure.input(directSkillImportInput).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const duplicateKeys = findDuplicateSkillKeys(input.items); if (duplicateKeys.length) throw new TRPCError({ code: "BAD_REQUEST", message: `同一批次存在重复 Skills 标识：${duplicateKeys.join("、")}` });
      const existing = await db.select({ skillKey: skillPackages.skillKey }).from(skillPackages).where(inArray(skillPackages.skillKey, input.items.map(item => item.skillKey)));
      if (existing.length) throw new TRPCError({ code: "CONFLICT", message: `以下 Skills 标识已存在：${existing.map(item => item.skillKey).join("、")}` });
      const batchKey = `admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const packages = await Promise.all(input.items.map(async item => {
        const buffer = decodeSkillPackageUpload(item.packageDataUrl, item.packageMimeType); const safeFileName = item.packageFileName.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
        const { key } = await storagePut(`skills/admin/${ctx.user.id}/${batchKey}-${item.skillKey}-${safeFileName}`, buffer, "application/zip");
        const { packageDataUrl, packageMimeType, ...values } = item; return { ...values, packageStorageKey: key, packageSizeBytes: buffer.length };
      }));
      const now = new Date(); const status = input.publishImmediately ? "approved" as const : "pending" as const;
      const created = await db.insert(skillPackages).values(packages.map(item => ({ ...item, authorId: ctx.user.id, submissionSource: "admin_direct" as const, importBatchKey: batchKey, reviewStatus: status, reviewNote: input.importNote, reviewedBy: input.publishImmediately ? ctx.user.id : null, reviewedAt: input.publishImmediately ? now : null, publishedAt: input.publishImmediately ? now : null }))).$returningId();
      return { success: true, batchKey, imported: created.length, reviewStatus: status };
    }),
    adminList: adminProcedure.query(async () => { const db = await getDb(); if (!db) return []; return db.select({ skill: skillPackages, authorName: users.name }).from(skillPackages).leftJoin(users, eq(skillPackages.authorId, users.id)).orderBy(desc(skillPackages.updatedAt)); }),
    review: adminProcedure.input(z.object({ id: z.number().int().positive(), reviewStatus: z.enum(["approved", "rejected", "archived"]), reviewNote: z.string().min(2).max(4_000) })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      await db.update(skillPackages).set({ reviewStatus: input.reviewStatus, reviewNote: input.reviewNote, reviewedBy: ctx.user.id, reviewedAt: new Date(), publishedAt: input.reviewStatus === "approved" ? new Date() : null }).where(eq(skillPackages.id, input.id)); return { success: true };
    }),
  }),
  models: adminProcedure.query(async () => {
    const catalog = await listLLMModels();
    return catalog.data.map(model => ({ id: model.id, owner: model.owned_by }));
  }),
  personal: router({
    get: protectedProcedure.query(({ ctx }) => getPersonalSpaceByUserId(ctx.user.id)),
    updateProfile: protectedProcedure.input(personalInput.updateProfile).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      await db.insert(userProfiles).values({ userId: ctx.user.id, ...input }).onDuplicateKeyUpdate({ set: input });
      return { success: true };
    }),
    updateProgress: protectedProcedure.input(personalInput.updateProgress).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const values = ownedProgressValues(ctx.user.id, input);
      await db.insert(courseProgress).values(values).onDuplicateKeyUpdate({ set: { progress: values.progress, completedAt: values.completedAt } });
      return { success: true };
    }),
    toggleFavorite: protectedProcedure.input(personalInput.toggleFavorite).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [existing] = await db.select().from(newsFavorites).where(and(eq(newsFavorites.userId, ctx.user.id), eq(newsFavorites.newsId, input.newsId))).limit(1);
      if (existing) { await db.delete(newsFavorites).where(eq(newsFavorites.id, existing.id)); return { favorited: false }; }
      await db.insert(newsFavorites).values(ownedFavoriteValues(ctx.user.id, input.newsId));
      return { favorited: true };
    }),
    recordNewsRead: protectedProcedure.input(personalInput.recordNewsRead).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [visible] = await db.select({ id: newsItems.id }).from(newsItems).where(and(eq(newsItems.id, input.newsId), eq(newsItems.isDeleted, 0), sql`${newsItems.reviewStatus} != 'rejected'`)).limit(1);
      if (!visible) throw new TRPCError({ code: "NOT_FOUND", message: "该资讯暂不可阅读" });
      const now = new Date();
      await db.insert(newsReadEvents).values({ userId: ctx.user.id, newsId: input.newsId, firstReadAt: now, lastReadAt: now }).onDuplicateKeyUpdate({ set: { lastReadAt: now } });
      return { success: true };
    }),
    addWorkspaceItem: protectedProcedure.input(personalInput.addWorkspaceItem).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [last] = await db.select({ orderIndex: sql<number>`max(${workspaceItems.orderIndex})` }).from(workspaceItems).where(eq(workspaceItems.userId, ctx.user.id));
      await db.insert(workspaceItems).values(ownedWorkspaceValues(ctx.user.id, input, Number(last?.orderIndex ?? 0) + 1));
      return { success: true };
    }),
    removeWorkspaceItem: protectedProcedure.input(personalInput.removeWorkspaceItem).mutation(async ({ ctx, input }) => {
      return deleteWorkspaceForUser(ctx.user.id, input.id);
    }),
  }),
  learning: router({
    courseExperience: protectedProcedure.input(z.object({ courseId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [course] = await db.select().from(courses).where(and(eq(courses.id, input.courseId), eq(courses.lifecycleStatus, "published"))).limit(1);
      if (!course) throw new TRPCError({ code: "NOT_FOUND", message: "该课程暂不可学习" });
      const [materials, comments, runs, materialProgress, annotations] = await Promise.all([
        db.select().from(courseMaterials).where(eq(courseMaterials.courseId, input.courseId)).orderBy(courseMaterials.orderIndex),
        db.select({ comment: courseMaterialComments, authorName: users.name }).from(courseMaterialComments).leftJoin(users, eq(courseMaterialComments.userId, users.id)).leftJoin(courseMaterials, eq(courseMaterialComments.materialId, courseMaterials.id)).where(eq(courseMaterials.courseId, input.courseId)).orderBy(courseMaterialComments.createdAt),
        db.select().from(coursePracticeRuns).where(eq(coursePracticeRuns.userId, ctx.user.id)).orderBy(desc(coursePracticeRuns.createdAt)).limit(12),
        db.select().from(courseMaterialProgress).where(eq(courseMaterialProgress.userId, ctx.user.id)),
        db.select().from(courseMaterialAnnotations).where(eq(courseMaterialAnnotations.userId, ctx.user.id)),
      ]);
      const materialIds = new Set(materials.map(material => material.id));
      return {
        materials: await Promise.all(materials.map(async item => ({ ...item, signedUrl: item.storageKey ? await storageGetSignedUrl(item.storageKey) : null }))),
        comments,
        runs: runs.filter(run => materialIds.has(run.materialId)),
        materialProgress: materialProgress.filter(item => materialIds.has(item.materialId)),
        annotations: annotations.filter(item => materialIds.has(item.materialId)),
        courseProgressRow: (await db.select().from(courseProgress).where(and(eq(courseProgress.userId, ctx.user.id), eq(courseProgress.courseId, input.courseId))).limit(1))[0] ?? null,
      };
    }),
    addComment: protectedProcedure.input(z.object({ materialId: z.number().int().positive(), content: z.string().min(1).max(500), videoSecond: z.number().int().min(0).max(21_600).nullable().default(null), isDanmaku: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [material] = await db.select({ material: courseMaterials, lifecycleStatus: courses.lifecycleStatus }).from(courseMaterials).leftJoin(courses, eq(courseMaterials.courseId, courses.id)).where(eq(courseMaterials.id, input.materialId)).limit(1);
      if (!material || material.lifecycleStatus !== "published") throw new TRPCError({ code: "NOT_FOUND", message: "该学习资源暂不可互动" });
      if (input.videoSecond !== null && !isVideoMaterial(material.material)) throw new TRPCError({ code: "BAD_REQUEST", message: "仅视频支持时间戳评论" });
      await db.insert(courseMaterialComments).values({ materialId: input.materialId, userId: ctx.user.id, content: input.content, videoSecond: input.videoSecond, isDanmaku: input.isDanmaku ? 1 : 0 }); return { success: true };
    }),
    deleteComment: protectedProcedure.input(z.object({ commentId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      await db.delete(courseMaterialComments).where(and(eq(courseMaterialComments.id, input.commentId), eq(courseMaterialComments.userId, ctx.user.id))); return { success: true };
    }),
    saveMaterialProgress: protectedProcedure.input(z.object({ materialId: z.number().int().positive(), position: z.number().min(0), percent: z.number().int().min(0).max(100), minutesDelta: z.number().int().min(0).max(120).default(0) })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [material] = await db.select({ material: courseMaterials, lifecycleStatus: courses.lifecycleStatus }).from(courseMaterials).leftJoin(courses, eq(courseMaterials.courseId, courses.id)).where(eq(courseMaterials.id, input.materialId)).limit(1);
      if (!material || material.lifecycleStatus !== "published") throw new TRPCError({ code: "NOT_FOUND", message: "该学习资源暂不可记录" });
      const kind = isVideoMaterial(material.material) ? "video" : material.material.mimeType === "application/pdf" ? "pdf" : "document";
      const derived = materialPositionFromKind(kind, input.position, null);
      const percent = kind === "document" ? input.percent : derived.percent || input.percent;
      const [existing] = await db.select().from(courseMaterialProgress).where(and(eq(courseMaterialProgress.userId, ctx.user.id), eq(courseMaterialProgress.materialId, input.materialId))).limit(1);
      const nextMinutes = Math.min(600, (existing?.minutes ?? 0) + input.minutesDelta);
      await db.insert(courseMaterialProgress).values({ userId: ctx.user.id, materialId: input.materialId, position: derived.position, percent, minutes: nextMinutes, createdAt: new Date(), updatedAt: new Date() }).onDuplicateKeyUpdate({ set: { position: derived.position, percent, minutes: nextMinutes, updatedAt: new Date() } });
      // 课程总进度 = 各素材平均完成度；全部素材到 100% 时自动写入完成时间。
      const siblings = await db.select({ id: courseMaterials.id }).from(courseMaterials).where(eq(courseMaterials.courseId, material.material.courseId));
      const rows = await db.select({ materialId: courseMaterialProgress.materialId, percent: courseMaterialProgress.percent }).from(courseMaterialProgress).where(eq(courseMaterialProgress.userId, ctx.user.id));
      const percentByMaterial = new Map(rows.map(row => [row.materialId, row.percent]));
      const total = siblings.length ? Math.round(siblings.reduce((sum, sibling) => sum + (percentByMaterial.get(sibling.id) ?? 0), 0) / siblings.length) : percent;
      const finalized = Math.min(100, total);
      await db.insert(courseProgress).values({ userId: ctx.user.id, courseId: material.material.courseId, progress: finalized, lastMaterialId: input.materialId, completedAt: finalized === 100 ? new Date() : null }).onDuplicateKeyUpdate({ set: { progress: finalized, lastMaterialId: input.materialId, ...(finalized === 100 ? { completedAt: new Date() } : {}) } });
      return { success: true, materialPercent: percent, coursePercent: finalized };
    }),
    addAnnotation: protectedProcedure.input(annotationInput).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [material] = await db.select({ material: courseMaterials, lifecycleStatus: courses.lifecycleStatus }).from(courseMaterials).leftJoin(courses, eq(courseMaterials.courseId, courses.id)).where(eq(courseMaterials.id, input.materialId)).limit(1);
      if (!material || material.lifecycleStatus !== "published") throw new TRPCError({ code: "NOT_FOUND", message: "该学习资源暂不可标注" });
      const [created] = await db.insert(courseMaterialAnnotations).values(ownedAnnotationValues(ctx.user.id, input)).$returningId();
      return { id: created.id, success: true };
    }),
    updateAnnotation: protectedProcedure.input(annotationInput.extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const { id, ...values } = input;
      await db.update(courseMaterialAnnotations).set(values).where(and(eq(courseMaterialAnnotations.id, id), eq(courseMaterialAnnotations.userId, ctx.user.id))); return { success: true };
    }),
    deleteAnnotation: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      await db.delete(courseMaterialAnnotations).where(and(eq(courseMaterialAnnotations.id, input.id), eq(courseMaterialAnnotations.userId, ctx.user.id))); return { success: true };
    }),
    runPractice: protectedProcedure.input(z.object({ materialId: z.number().int().positive(), prompt: z.string().min(2).max(3_000) })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [material] = await db.select({ material: courseMaterials, lifecycleStatus: courses.lifecycleStatus }).from(courseMaterials).leftJoin(courses, eq(courseMaterials.courseId, courses.id)).where(eq(courseMaterials.id, input.materialId)).limit(1);
      if (!material || material.lifecycleStatus !== "published" || material.material.materialType !== "practice") throw new TRPCError({ code: "NOT_FOUND", message: "该实操任务暂不可运行" });
      const [usage] = await db.select({ count: sql<number>`count(*)` }).from(coursePracticeRuns).where(and(eq(coursePracticeRuns.materialId, input.materialId), eq(coursePracticeRuns.userId, ctx.user.id), sql`date(${coursePracticeRuns.createdAt}) = curdate()`));
      if (Number(usage?.count ?? 0) >= 5) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "每个实操任务每天最多运行 5 次，请先复盘已有结果" });
      const instruction = typeof material.material.config?.instruction === "string" ? material.material.config.instruction.slice(0, 4_000) : "基于课程目标，输出可执行、可验证的建议。";
      const response = await invokeLLM({ messages: [{ role: "system", content: `你是企业 AI 学习实操助手。${instruction} 不处理敏感个人信息，不执行外部操作，不把建议视为业务审批。` }, { role: "user", content: input.prompt }] });
      const output = response.choices[0]?.message?.content; if (typeof output !== "string") throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "模型未返回可阅读结果" });
      await db.insert(coursePracticeRuns).values({ materialId: input.materialId, userId: ctx.user.id, modelId: response.model, prompt: input.prompt, output: output.slice(0, 16_000) }); return { output: output.slice(0, 16_000), modelId: response.model };
    }),
  }),
  // 平台 AI 助手：知晓平台功能与当前浏览页面，可指导使用、协助阅读、解答问题。
  assistant: router({
    chat: protectedProcedure.input(z.object({
      question: z.string().trim().min(1).max(2_000),
      // 当前页面上下文由前端采集：路由、页面类型、标题与正文摘录。
      pageContext: z.object({
        route: z.string().min(1).max(200),
        pageKind: z.enum(["home", "learn", "learningPath", "course", "newsList", "newsArticle", "communityList", "postDetail", "skillsHub", "skillDetail", "profile", "operations", "apps", "other"]),
        title: z.string().max(300).default(""),
        excerpt: z.string().max(12_000).default(""),
        selection: z.string().max(4_000).default(""),
      }).nullable().default(null),
      // 多轮对话历史（不含本次提问），最多保留最近 16 条。
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4_000) })).max(16).default([]),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      // 每人每天 60 次问答，防止刷接口占用受管网关额度。
      const [usage] = await db.select({ count: sql<number>`count(*)` }).from(assistantChats).where(and(eq(assistantChats.userId, ctx.user.id), sql`date(${assistantChats.createdAt}) = curdate()`));
      if (Number(usage?.count ?? 0) >= 60) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "AI 助手每天最多 60 次问答，请明天再试" });

      const contextBlock = input.pageContext ? [
        "<page_context>",
        `当前用户正在浏览的页面：${input.pageContext.route}（${ASSISTANT_PAGE_KIND_LABEL[input.pageContext.pageKind] ?? input.pageContext.pageKind}）`,
        input.pageContext.title ? `页面标题：${input.pageContext.title}` : "",
        input.pageContext.selection ? `用户在页面上选中的文字：\n${input.pageContext.selection}` : "",
        input.pageContext.excerpt ? `页面正文摘录：\n${input.pageContext.excerpt.slice(0, 12_000)}` : "",
        "</page_context>",
      ].filter(Boolean).join("\n") : "";

      const messages = [
        { role: "system" as const, content: ASSISTANT_SYSTEM_PROMPT.replace("{{PAGE_CONTEXT}}", contextBlock || "（用户未提供当前页面信息）") },
        ...input.history.slice(-16).map(item => ({ role: item.role, content: item.content })),
        { role: "user" as const, content: input.question },
      ];
      const response = await invokeLLM({ maxTokens: 2_000, messages });
      const answer = response.choices[0]?.message?.content;
      if (typeof answer !== "string" || !answer.trim()) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI 助手未返回可阅读的答复" });
      await db.insert(assistantChats).values({ userId: ctx.user.id, question: input.question, answer: answer.slice(0, 16_000), pageRoute: input.pageContext?.route.slice(0, 200) ?? null, pageKind: input.pageContext?.pageKind ?? null });
      return { answer: answer.slice(0, 16_000), modelId: response.model };
    }),
    history: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb(); if (!db) return [];
      return db.select().from(assistantChats).where(eq(assistantChats.userId, ctx.user.id)).orderBy(desc(assistantChats.createdAt)).limit(50);
    }),
  }),
  community: router({
    topics: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const [topics, follows] = await Promise.all([
        db.select().from(communityTopics).where(eq(communityTopics.isEnabled, 1)).orderBy(sql`${communityTopics.isFeatured} desc`, communityTopics.name),
        db.select().from(communityTopicFollows).where(eq(communityTopicFollows.userId, ctx.user.id)),
      ]);
      const followed = new Set(follows.map(item => item.topicId));
      return topics.map(topic => ({ ...topic, isFollowed: followed.has(topic.id) }));
    }),
    toggleTopicFollow: protectedProcedure.input(z.object({ topicId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [existing] = await db.select().from(communityTopicFollows).where(and(eq(communityTopicFollows.userId, ctx.user.id), eq(communityTopicFollows.topicId, input.topicId))).limit(1);
      if (existing) { await db.delete(communityTopicFollows).where(eq(communityTopicFollows.id, existing.id)); return { followed: false }; }
      await db.insert(communityTopicFollows).values({ userId: ctx.user.id, topicId: input.topicId }); return { followed: true };
    }),
    favorites: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(postFavorites).where(eq(postFavorites.userId, ctx.user.id));
    }),
    list: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const posts = await db.select({ post: communityPosts, authorName: users.name }).from(communityPosts).leftJoin(users, eq(communityPosts.authorId, users.id)).orderBy(sql`${communityPosts.isPinned} desc`, sql`${communityPosts.createdAt} desc`);
      const ids = posts.map(item => item.post.id);
      const attachments = ids.length ? await db.select().from(postAttachments).where(inArray(postAttachments.postId, ids)) : [];
      return Promise.all(posts.map(async item => ({ ...item, attachments: await Promise.all(attachments.filter(attachment => attachment.postId === item.post.id).map(async attachment => ({ id: attachment.id, url: await storageGetSignedUrl(attachment.fileKey), fileName: attachment.fileName, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes }))) })));
    }),
    detail: protectedProcedure.input(z.object({ postId: z.number().int().positive() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [post] = await db.select({ post: communityPosts, authorName: users.name }).from(communityPosts).leftJoin(users, eq(communityPosts.authorId, users.id)).where(eq(communityPosts.id, input.postId)).limit(1);
      if (!post) return null;
      const [attachments, comments] = await Promise.all([
        db.select().from(postAttachments).where(eq(postAttachments.postId, input.postId)),
        db.select({ comment: postComments, authorName: users.name }).from(postComments).leftJoin(users, eq(postComments.authorId, users.id)).where(eq(postComments.postId, input.postId)).orderBy(postComments.createdAt),
      ]);
      return { ...post, attachments: await Promise.all(attachments.map(async attachment => ({ id: attachment.id, url: await storageGetSignedUrl(attachment.fileKey), fileName: attachment.fileName, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes }))), comments };
    }),
    attachmentAccess: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [attachment] = await db.select({ id: postAttachments.id, fileKey: postAttachments.fileKey, postId: postAttachments.postId }).from(postAttachments).where(eq(postAttachments.id, input.id)).limit(1);
      if (!attachment?.postId) throw new TRPCError({ code: "NOT_FOUND", message: "附件暂不可访问" });
      return { url: await storageGetSignedUrl(attachment.fileKey) };
    }),
    uploadImage: protectedProcedure.input(z.object({ dataUrl: z.string().max(7_100_000), fileName: z.string().min(1).max(255), mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const buffer = validateImageDataUrl(input.dataUrl, input.mimeType);
      const extension = input.mimeType.split("/")[1] === "jpeg" ? "jpg" : input.mimeType.split("/")[1];
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || `image.${extension}`;
      const uploaded = await storagePut(`community/${ctx.user.id}/${Date.now()}-${safeName}`, buffer, input.mimeType);
      const [attachment] = await db.insert(postAttachments).values({ ownerId: ctx.user.id, fileKey: uploaded.key, url: uploaded.url, fileName: safeName, mimeType: input.mimeType, sizeBytes: buffer.length }).$returningId();
      return { id: attachment.id, url: await storageGetSignedUrl(uploaded.key), fileName: safeName, mimeType: input.mimeType, sizeBytes: buffer.length };
    }),
    discardAttachment: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      return discardDraftAttachmentForUser(ctx.user.id, input.id);
    }),
    comments: publicProcedure.input(z.object({ postId: z.number().int().positive() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ comment: postComments, authorName: users.name }).from(postComments).leftJoin(users, eq(postComments.authorId, users.id)).where(eq(postComments.postId, input.postId)).orderBy(postComments.createdAt);
    }),
    create: protectedProcedure.input(z.object({ postType: z.enum(["experience", "question", "resource", "discussion"]), title: z.string().min(4).max(180), content: z.string().min(12).max(6000), contentHtml: z.string().max(30000).optional(), tags: stringArray, quotePostId: z.number().int().positive().nullable().optional(), replyPolicy: z.enum(["all", "mentioned", "experts", "operations"]).default("all"), attachmentIds: z.array(z.number().int().positive()).max(8).optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const contentHtml = input.contentHtml ? sanitizeRichText(input.contentHtml) : null;
      const content = contentHtml ? plainTextFromRichText(contentHtml).slice(0, 6000) : input.content;
      if (input.quotePostId) {
        const [quoted] = await db.select({ id: communityPosts.id }).from(communityPosts).where(eq(communityPosts.id, input.quotePostId)).limit(1);
        if (!quoted) throw new TRPCError({ code: "NOT_FOUND", message: "被引用的实践不存在" });
      }
      const [post] = await db.insert(communityPosts).values({ authorId: ctx.user.id, postType: input.postType, title: input.title, content, contentHtml, tags: input.tags, quotePostId: input.quotePostId ?? null, replyPolicy: input.replyPolicy }).$returningId();
      if (input.attachmentIds?.length) {
        await db.update(postAttachments).set({ postId: post.id }).where(and(inArray(postAttachments.id, input.attachmentIds), eq(postAttachments.ownerId, ctx.user.id), isNull(postAttachments.postId)));
      }
      return { success: true, postId: post.id };
    }),
    createComment: protectedProcedure.input(z.object({ postId: z.number().int().positive(), content: z.string().min(2).max(2000) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [post] = await db.select({ replyPolicy: communityPosts.replyPolicy }).from(communityPosts).where(eq(communityPosts.id, input.postId)).limit(1);
      if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "实践不存在" });
      if (post.replyPolicy === "operations" && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "该实践仅允许运营人员评论" });
      await db.insert(postComments).values({ authorId: ctx.user.id, ...input });
      await db.update(communityPosts).set({ commentCount: sql`${communityPosts.commentCount} + 1` }).where(eq(communityPosts.id, input.postId));
      return { success: true };
    }),
    toggleLike: protectedProcedure.input(z.object({ postId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [existing] = await db.select().from(postLikes).where(and(eq(postLikes.userId, ctx.user.id), eq(postLikes.postId, input.postId))).limit(1);
      if (existing) { await db.delete(postLikes).where(eq(postLikes.id, existing.id)); await db.update(communityPosts).set({ likeCount: sql`greatest(${communityPosts.likeCount} - 1, 0)` }).where(eq(communityPosts.id, input.postId)); return { liked: false }; }
      await db.insert(postLikes).values({ userId: ctx.user.id, postId: input.postId });
      await db.update(communityPosts).set({ likeCount: sql`${communityPosts.likeCount} + 1` }).where(eq(communityPosts.id, input.postId));
      return { liked: true };
    }),
    toggleFavorite: protectedProcedure.input(z.object({ postId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [existing] = await db.select().from(postFavorites).where(and(eq(postFavorites.userId, ctx.user.id), eq(postFavorites.postId, input.postId))).limit(1);
      if (existing) { await db.delete(postFavorites).where(eq(postFavorites.id, existing.id)); return { favorited: false }; }
      await db.insert(postFavorites).values({ userId: ctx.user.id, postId: input.postId }); return { favorited: true };
    }),
  }),
  operations: router({
    get: adminProcedure.query(() => getOperationsData()),
    newsAdmin: adminProcedure.input(z.object({ status: z.enum(["all", "pending", "approved", "needs_review", "rejected", "deleted"]).default("all"), search: z.string().trim().max(120).optional(), sourceId: z.number().int().positive().optional(), limit: z.number().int().min(1).max(200).default(60) })).query(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const conditions: Array<SQL<unknown> | undefined> = [eq(newsItems.isDeleted, input.status === "deleted" ? 1 : 0)];
      if (input.status !== "all" && input.status !== "deleted") conditions.push(eq(newsItems.reviewStatus, input.status));
      if (input.sourceId) conditions.push(eq(newsItems.sourceId, input.sourceId));
      if (input.search) conditions.push(or(like(newsItems.title, `%${input.search}%`), like(newsItems.summary, `%${input.search}%`), like(newsSources.name, `%${input.search}%`)));
      const rows = await db.select({ item: newsItems, sourceName: newsSources.name }).from(newsItems).leftJoin(newsSources, eq(newsItems.sourceId, newsSources.id)).where(and(...conditions)).orderBy(desc(newsItems.updatedAt)).limit(input.limit);
      return rows.map(({ item, sourceName }) => ({ id: item.id, title: item.title, summary: item.summary, sourceName, category: item.category, riskLevel: item.riskLevel, reviewStatus: item.reviewStatus, isDeleted: Boolean(item.isDeleted), deletionReason: item.deletionReason, publishedAt: item.publishedAt, updatedAt: item.updatedAt }));
    }),
    batchDeleteNews: adminProcedure.input(z.object({ newsIds: z.array(z.number().int().positive()).min(1).max(200), reason: z.string().min(4).max(1200) })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const now = new Date();
      const targets = await db.select({ id: newsItems.id }).from(newsItems).where(and(inArray(newsItems.id, input.newsIds), eq(newsItems.isDeleted, 0)));
      if (!targets.length) return { success: true, deleted: 0 };
      const ids = targets.map(target => target.id);
      await db.update(newsItems).set({ isDeleted: 1, deletedAt: now, deletedBy: ctx.user.id, deletionReason: input.reason, reviewStatus: "rejected" }).where(inArray(newsItems.id, ids));
      await db.insert(auditRecords).values(ids.map(id => ({ newsId: id, decision: "rejected" as const, riskLevel: "high" as const, confidence: 100, reason: `人工批量删除：${input.reason}`, matchedRules: ["人工删除"], reviewerId: ctx.user.id, reviewAssigneeId: ctx.user.id, manualDecision: "rejected" as const, reviewNote: input.reason, reviewedAt: now })));
      return { success: true, deleted: ids.length };
    }),
    createAgentImportKey: adminProcedure.input(agentImportKeyInput).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" }); const issued = issueAgentImportToken(); const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
      const [created] = await db.insert(agentImportKeys).values({ name: input.name, tokenPrefix: issued.tokenPrefix, tokenHash: issued.tokenHash, allowedTargets: input.allowedTargets, createdBy: ctx.user.id, expiresAt }).$returningId(); return { id: created.id, token: issued.token, tokenPrefix: issued.tokenPrefix, expiresAt };
    }),
    revokeAgentImportKey: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" }); await db.update(agentImportKeys).set({ isEnabled: 0, revokedAt: new Date() }).where(eq(agentImportKeys.id, input.id)); return { success: true }; }),
    rejectAgentImportJob: adminProcedure.input(z.object({ id: z.number().int().positive(), reviewNote: z.string().trim().min(2).max(2_000) })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" }); const [job] = await db.select({ status: agentImportJobs.status }).from(agentImportJobs).where(eq(agentImportJobs.id, input.id)).limit(1); if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "导入批次不存在" }); if (job.status !== "pending_review") throw new TRPCError({ code: "BAD_REQUEST", message: "该导入批次已处理" }); await db.update(agentImportJobs).set({ status: "rejected", reviewNote: input.reviewNote, reviewedBy: ctx.user.id, reviewedAt: new Date() }).where(eq(agentImportJobs.id, input.id)); return { success: true }; }),
    applyAgentImportJob: adminProcedure.input(z.object({ id: z.number().int().positive(), reviewNote: z.string().trim().min(2).max(2_000) })).mutation(async ({ ctx, input }) => { try { return { success: true, ...(await applyAgentImportJob(input.id, ctx.user.id, input.reviewNote)) }; } catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "导入草稿应用失败" }); } }),
    addProvider: adminProcedure.input(providerInput).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      await db.insert(llmProviders).values({ ...input, isEnabled: toFlag(input.isEnabled) }); return { success: true };
    }),
    updateProvider: adminProcedure.input(providerInput.extend({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const { id, isEnabled, ...values } = input; await db.update(llmProviders).set({ ...values, isEnabled: toFlag(isEnabled) }).where(eq(llmProviders.id, id)); return { success: true };
    }),
    toggleProvider: adminProcedure.input(z.object({ id: z.number().int().positive(), isEnabled: z.boolean() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      await db.update(llmProviders).set({ isEnabled: toFlag(input.isEnabled), healthStatus: input.isEnabled ? "unknown" : "disabled" }).where(eq(llmProviders.id, input.id)); return { success: true };
    }),
    addModel: adminProcedure.input(modelInput).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      await db.insert(llmModels).values({ ...input, isDefault: toFlag(input.isDefault), isEnabled: toFlag(input.isEnabled) }); return { success: true };
    }),
    updateModel: adminProcedure.input(modelInput.extend({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const { id, isDefault, isEnabled, ...values } = input; await db.update(llmModels).set({ ...values, isDefault: toFlag(isDefault), isEnabled: toFlag(isEnabled) }).where(eq(llmModels.id, id)); return { success: true };
    }),
    testModelConnection: adminProcedure.input(z.object({ selectedModelId: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [selected] = await db.select({ modelId: llmModels.modelId, modelEnabled: llmModels.isEnabled, providerId: llmProviders.id, providerName: llmProviders.name, providerType: llmProviders.providerType, providerBaseUrl: llmProviders.baseUrl, providerEnabled: llmProviders.isEnabled, providerStatus: llmProviders.healthStatus, gatewayStatus: llmProviders.gatewayStatus }).from(llmModels).innerJoin(llmProviders, eq(llmModels.providerId, llmProviders.id)).where(eq(llmModels.id, input.selectedModelId)).limit(1);
      if (!selected) throw new TRPCError({ code: "NOT_FOUND", message: "所选模型或供应商不存在" });
      if (!selected.modelEnabled || !selected.providerEnabled || selected.providerStatus === "disabled") return { success: false, status: "disabled" as const, message: "供应商或模型已停用，无法测试连接。" };
      const configuredBase = (ENV.llmBaseUrl || "").replace(/\/+$/, "");
      if (!configuredBase || selected.providerBaseUrl.replace(/\/+$/, "") !== configuredBase) {
        return { success: false, status: "gateway_not_connected" as const, message: "当前部署仅持有企业统一网关（LLM_BASE_URL）的调用凭据；请将该供应商的 Base URL 配置为与环境变量一致后再测试连接。" };
      }
      try {
        const catalog = await listLLMModels();
        if (!catalog.data.some(model => model.id === selected.modelId)) {
          await db.update(llmProviders).set({ gatewayStatus: "failed", gatewayCheckedAt: new Date(), gatewayLastError: "所选模型未出现在受管网关目录" }).where(eq(llmProviders.id, selected.providerId));
          return { success: false, status: "model_unavailable" as const, message: "该模型未出现在当前受管网关目录，请检查模型 ID 或网关配置。" };
        }
        const startedAt = Date.now();
        const response = await invokeLLM({ model: selected.modelId, maxTokens: 32, messages: [{ role: "system", content: "你是连接测试助手。只回复 READY。" }, { role: "user", content: "请确认模型调用可用。" }] });
        if (typeof response.choices[0]?.message?.content !== "string") throw new Error("模型未返回文本内容");
        await db.update(llmProviders).set({ gatewayStatus: "verified", gatewayCheckedAt: new Date(), gatewayLastError: null, healthStatus: "healthy" }).where(eq(llmProviders.id, selected.providerId));
        return { success: true, status: "verified" as const, latencyMs: Date.now() - startedAt, message: "受管网关已成功完成最小模型调用。" };
      } catch {
        await db.update(llmProviders).set({ gatewayStatus: "failed", gatewayCheckedAt: new Date(), gatewayLastError: "受管网关调用失败", healthStatus: "degraded" }).where(eq(llmProviders.id, selected.providerId));
        return { success: false, status: "connection_failed" as const, message: "模型调用未成功，请检查受管网关、模型可用性和密钥接入。" };
      }
    }),
    addEnterpriseApp: adminProcedure.input(enterpriseAppInput).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      await db.insert(enterpriseApps).values({ ...input, isEnabled: toFlag(input.isEnabled) }); return { success: true };
    }),
    updateEnterpriseApp: adminProcedure.input(enterpriseAppInput.extend({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const { id, isEnabled, ...values } = input; await db.update(enterpriseApps).set({ ...values, isEnabled: toFlag(isEnabled) }).where(eq(enterpriseApps.id, id)); return { success: true };
    }),
    toggleEnterpriseApp: adminProcedure.input(z.object({ id: z.number().int().positive(), isEnabled: z.boolean() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      await db.update(enterpriseApps).set({ isEnabled: toFlag(input.isEnabled) }).where(eq(enterpriseApps.id, input.id)); return { success: true };
    }),
    savePolicy: adminProcedure.input(policyInput.extend({ id: z.number().int().positive().optional() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const { id, isEnabled, ...values } = input;
      if (id) await db.update(modelRoutingPolicies).set({ ...values, isEnabled: toFlag(isEnabled) }).where(eq(modelRoutingPolicies.id, id));
      else await db.insert(modelRoutingPolicies).values({ ...values, isEnabled: toFlag(isEnabled) });
      return { success: true };
    }),
    addPath: adminProcedure.input(pathInput).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const { reviewDueAt, ...values } = input; await db.insert(learningPaths).values({ ...values, reviewDueAt: reviewDueAt ? new Date(`${reviewDueAt}T00:00:00.000Z`) : null, isFeatured: toFlag(input.isFeatured), isPublished: input.lifecycleStatus === "published" ? 1 : 0 }); return { success: true };
    }),
    updatePath: adminProcedure.input(pathInput.extend({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const { id, isFeatured, reviewDueAt, ...values } = input; await db.update(learningPaths).set({ ...values, reviewDueAt: reviewDueAt ? new Date(`${reviewDueAt}T00:00:00.000Z`) : null, isFeatured: toFlag(isFeatured), isPublished: values.lifecycleStatus === "published" ? 1 : 0 }).where(eq(learningPaths.id, id)); return { success: true };
    }),
    addCourse: adminProcedure.input(courseInput).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const { reviewDueAt, ...values } = input; await db.insert(courses).values({ ...values, resourceUrl: input.resourceUrl ?? null, reviewDueAt: reviewDueAt ? new Date(`${reviewDueAt}T00:00:00.000Z`) : null }); return { success: true };
    }),
    updateCourse: adminProcedure.input(courseInput.extend({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const { id, reviewDueAt, ...values } = input; await db.update(courses).set({ ...values, resourceUrl: values.resourceUrl ?? null, reviewDueAt: reviewDueAt ? new Date(`${reviewDueAt}T00:00:00.000Z`) : null }).where(eq(courses.id, id)); return { success: true };
    }),
    captureDocumentUrl: adminProcedure.input(z.object({ url: z.string().url().max(600) })).mutation(async ({ input }) => {
      try { return await capturePublicDocument(input.url); } catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "文档采集失败" }); }
    }),
    uploadCourseMaterialFile: adminProcedure.input(materialUploadInput).mutation(async ({ input }) => {
      const buffer = decodeMaterialUpload(input.dataUrl, input.mimeType); const safeName = input.fileName.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
      const { key, url } = await storagePut(`course-materials/${Date.now()}-${safeName}`, buffer, input.mimeType); return { storageKey: key, url, mimeType: input.mimeType, fileName: input.fileName, sizeBytes: buffer.length };
    }),
    addCourseMaterial: adminProcedure.input(materialInput).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, input.courseId)).limit(1); if (!course) throw new TRPCError({ code: "NOT_FOUND", message: "所属课程不存在" });
      await db.insert(courseMaterials).values({ ...input, description: input.description ?? null, sourceUrl: input.sourceUrl ?? null, storageKey: input.storageKey ?? null, mimeType: input.mimeType ?? null, content: input.content ?? null }); return { success: true };
    }),
    updateCourseMaterial: adminProcedure.input(materialInput.safeExtend({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const { id, ...values } = input; await db.update(courseMaterials).set({ ...values, description: values.description ?? null, sourceUrl: values.sourceUrl ?? null, storageKey: values.storageKey ?? null, mimeType: values.mimeType ?? null, content: values.content ?? null }).where(eq(courseMaterials.id, id)); return { success: true };
    }),
    deleteCourseMaterial: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      // 级联清理：评论、标注、素材进度、实操记录随 FK onDelete:"cascade" 一并删除。
      await db.delete(courseMaterials).where(eq(courseMaterials.id, input.id)); return { success: true };
    }),
    addTopic: adminProcedure.input(topicInput).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      await db.insert(communityTopics).values({ ...input, isEnabled: toFlag(input.isEnabled), isFeatured: toFlag(input.isFeatured) }); return { success: true };
    }),
    updateTopic: adminProcedure.input(topicInput.extend({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const { id, isEnabled, isFeatured, ...values } = input; await db.update(communityTopics).set({ ...values, isEnabled: toFlag(isEnabled), isFeatured: toFlag(isFeatured) }).where(eq(communityTopics.id, id)); return { success: true };
    }),
    setResourceReviewStatus: adminProcedure.input(z.object({ resourceType: z.enum(["source", "provider", "topic", "path", "course"]), id: z.number().int().positive(), reviewStatus: z.enum(["current", "due", "overdue"]) })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      if (input.resourceType === "source") await db.update(newsSources).set({ reviewStatus: input.reviewStatus }).where(eq(newsSources.id, input.id));
      if (input.resourceType === "provider") await db.update(llmProviders).set({ reviewStatus: input.reviewStatus }).where(eq(llmProviders.id, input.id));
      if (input.resourceType === "path") await db.update(learningPaths).set({ reviewStatus: input.reviewStatus }).where(eq(learningPaths.id, input.id));
      if (input.resourceType === "course") await db.update(courses).set({ reviewStatus: input.reviewStatus }).where(eq(courses.id, input.id));
      if (input.resourceType === "topic") await db.update(communityTopics).set({ reviewStatus: input.reviewStatus }).where(eq(communityTopics.id, input.id));
      return { success: true };
    }),
    addSource: adminProcedure.input(sourceInput).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [source] = await db.insert(newsSources).values({ ...input, description: input.description ?? null, isEnabled: toFlag(input.isEnabled) }).$returningId();
      return { success: true, sourceId: source.id, sourceType: input.sourceType };
    }),
    updateSource: adminProcedure.input(sourceInput.extend({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const { id, isEnabled, ...values } = input; await db.update(newsSources).set({ ...values, description: values.description ?? null, isEnabled: toFlag(isEnabled) }).where(eq(newsSources.id, id)); return { success: true };
    }),
    toggleSource: adminProcedure.input(z.object({ id: z.number().int().positive(), isEnabled: z.boolean() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      await db.update(newsSources).set({ isEnabled: toFlag(input.isEnabled) }).where(eq(newsSources.id, input.id)); return { success: true };
    }),
    deleteSource: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      // 硬删除来源本身；其下已导入资讯通过 FK onDelete:"set null" 保留，来源显示回退为“平台运营”。
      await db.delete(newsSources).where(eq(newsSources.id, input.id)); return { success: true };
    }),
    syncSource: adminProcedure.input(z.object({ sourceId: z.number().int().positive(), maxItems: z.number().int().min(1).max(50).default(50) })).mutation(async ({ input }) => {
      try { return await syncRssSourceById(input.sourceId, input.maxItems); }
      catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "RSS 拉取失败" }); }
    }),
    configureDailySourceSync: adminProcedure.input(z.object({ sourceId: z.number().int().positive(), enabled: z.boolean() })).mutation(async ({ input }) => {
      if (process.env.NODE_ENV === "development") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "请先发布当前版本，再启用每日自动同步。" });
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [source] = await db.select().from(newsSources).where(eq(newsSources.id, input.sourceId)).limit(1);
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "资讯源不存在" });
      if (source.sourceType !== "rss") throw new TRPCError({ code: "BAD_REQUEST", message: "仅 RSS 资讯源支持每日自动同步" });
      if (input.enabled) {
        let taskUid = source.scheduleCronTaskUid;
        let nextExecutionAt: string | null | undefined;
        if (taskUid) {
          const schedule = await updateHeartbeatJob(taskUid, { enable: true, cron: DAILY_SYNC_CRON, path: "/api/scheduled/rss-sync", description: `每日同步：${source.name}` }, "");
          nextExecutionAt = schedule.nextExecutionAt;
        } else {
          const schedule = await createHeartbeatJob({ name: `daily-rss-source-${source.id}`, cron: DAILY_SYNC_CRON, path: "/api/scheduled/rss-sync", payload: {}, description: `每日同步：${source.name}` }, "");
          taskUid = schedule.taskUid;
          nextExecutionAt = schedule.nextExecutionAt;
        }
        await db.update(newsSources).set({ scheduleEnabled: 1, scheduleCronTaskUid: taskUid, scheduleLastError: null }).where(eq(newsSources.id, source.id));
        return { success: true, enabled: true, nextExecutionAt: nextExecutionAt ?? null };
      }
      if (source.scheduleCronTaskUid) await updateHeartbeatJob(source.scheduleCronTaskUid, { enable: false }, "");
      await db.update(newsSources).set({ scheduleEnabled: 0 }).where(eq(newsSources.id, source.id));
      return { success: true, enabled: false };
    }),
    addModule: adminProcedure.input(moduleInput).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      await db.insert(featureModules).values({ ...input, isEnabled: toFlag(input.isEnabled) }); return { success: true };
    }),
    updateModule: adminProcedure.input(moduleInput.extend({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const { id, isEnabled, ...values } = input; await db.update(featureModules).set({ ...values, isEnabled: toFlag(isEnabled) }).where(eq(featureModules.id, id)); return { success: true };
    }),
    toggleModule: adminProcedure.input(z.object({ id: z.number().int().positive(), isEnabled: z.boolean() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      await db.update(featureModules).set({ isEnabled: toFlag(input.isEnabled) }).where(eq(featureModules.id, input.id)); return { success: true };
    }),
    addRule: adminProcedure.input(z.object({ agentId: z.number().int().positive().nullable(), name: z.string().min(2).max(140), description: z.string().min(6).max(1200), riskLevel: z.enum(["low", "medium", "high", "critical"]), keywords: stringArray, isEnabled: z.boolean() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      await db.insert(auditRules).values({ ...input, isEnabled: toFlag(input.isEnabled) }); return { success: true };
    }),
    updateRule: adminProcedure.input(z.object({ id: z.number().int().positive(), agentId: z.number().int().positive().nullable(), name: z.string().min(2).max(140), description: z.string().min(6).max(1200), riskLevel: z.enum(["low", "medium", "high", "critical"]), keywords: stringArray, isEnabled: z.boolean() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const { id, isEnabled, ...values } = input; await db.update(auditRules).set({ ...values, isEnabled: toFlag(isEnabled) }).where(eq(auditRules.id, id)); return { success: true };
    }),
    toggleRule: adminProcedure.input(z.object({ id: z.number().int().positive(), isEnabled: z.boolean() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      await db.update(auditRules).set({ isEnabled: toFlag(input.isEnabled) }).where(eq(auditRules.id, input.id)); return { success: true };
    }),
    updateAgent: adminProcedure.input(agentInput).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [selected] = await db.select({ modelId: llmModels.modelId, modelEnabled: llmModels.isEnabled, providerEnabled: llmProviders.isEnabled, providerStatus: llmProviders.healthStatus, gatewayStatus: llmProviders.gatewayStatus }).from(llmModels).innerJoin(llmProviders, eq(llmModels.providerId, llmProviders.id)).where(eq(llmModels.id, input.selectedModelId)).limit(1);
      if (!selected || !selected.modelEnabled || !selected.providerEnabled || selected.providerStatus === "disabled") throw new TRPCError({ code: "BAD_REQUEST", message: "请选择已启用且可用的供应商模型。" });
      if (selected.gatewayStatus !== "verified") throw new TRPCError({ code: "BAD_REQUEST", message: "所选外部模型尚未完成受管网关接入与测试，暂不能启用为审核员。" });
      const { id, isEnabled, ...values } = input; await db.update(auditAgents).set({ ...values, modelPreference: selected.modelId, isEnabled: toFlag(isEnabled) }).where(eq(auditAgents.id, id)); return { success: true };
    }),
    toggleAgent: adminProcedure.input(z.object({ id: z.number().int().positive(), isEnabled: z.boolean() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      await db.update(auditAgents).set({ isEnabled: toFlag(input.isEnabled) }).where(eq(auditAgents.id, input.id)); return { success: true };
    }),
    assignReview: adminProcedure.input(z.object({ recordId: z.number().int().positive(), assigneeId: z.number().int().positive().nullable() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      await db.update(auditRecords).set({ reviewAssigneeId: input.assigneeId }).where(eq(auditRecords.id, input.recordId)); return { success: true };
    }),
    reviewDecision: adminProcedure.input(z.object({ recordId: z.number().int().positive(), decision: z.enum(["approved", "needs_review", "rejected"]), reviewNote: z.string().min(2).max(1200) })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [record] = await db.select().from(auditRecords).where(eq(auditRecords.id, input.recordId)).limit(1);
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "审核记录不存在" });
      await db.update(auditRecords).set({ decision: input.decision, manualDecision: input.decision, reviewerId: ctx.user.id, reviewAssigneeId: ctx.user.id, reviewNote: input.reviewNote, reviewedAt: new Date() }).where(eq(auditRecords.id, input.recordId));
      await db.update(newsItems).set({ reviewStatus: reviewStatusFromDecision(input.decision) }).where(eq(newsItems.id, record.newsId));
      return { success: true };
    }),
    deleteNews: adminProcedure.input(z.object({ newsId: z.number().int().positive(), reason: z.string().min(4).max(1200) })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [item] = await db.select().from(newsItems).where(eq(newsItems.id, input.newsId)).limit(1);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "资讯不存在" });
      if (item.isDeleted) throw new TRPCError({ code: "BAD_REQUEST", message: "资讯已删除" });
      const now = new Date();
      await db.update(newsItems).set({ isDeleted: 1, deletedAt: now, deletedBy: ctx.user.id, deletionReason: input.reason, reviewStatus: "rejected" }).where(eq(newsItems.id, item.id));
      await db.insert(auditRecords).values({ newsId: item.id, decision: "rejected", riskLevel: "high", confidence: 100, reason: `人工删除：${input.reason}`, matchedRules: ["人工删除"], reviewerId: ctx.user.id, reviewAssigneeId: ctx.user.id, manualDecision: "rejected", reviewNote: input.reason, reviewedAt: now });
      return { success: true, newsId: item.id };
    }),
    restoreNews: adminProcedure.input(z.object({ newsId: z.number().int().positive(), reason: z.string().min(4).max(1200) })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [item] = await db.select().from(newsItems).where(eq(newsItems.id, input.newsId)).limit(1);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "资讯不存在" });
      if (!item.isDeleted) throw new TRPCError({ code: "BAD_REQUEST", message: "资讯未处于删除状态" });
      const now = new Date();
      await db.update(newsItems).set({ isDeleted: 0, deletedAt: null, deletedBy: null, deletionReason: null, reviewStatus: "needs_review" }).where(eq(newsItems.id, item.id));
      await db.insert(auditRecords).values({ newsId: item.id, decision: "needs_review", riskLevel: "medium", confidence: 100, reason: `人工恢复：${input.reason}`, matchedRules: ["人工恢复"], reviewerId: ctx.user.id, reviewAssigneeId: ctx.user.id, manualDecision: "needs_review", reviewNote: input.reason, reviewedAt: now });
      return { success: true, newsId: item.id };
    }),
    runAudit: adminProcedure.input(z.object({ newsId: z.number().int().positive(), agentId: z.number().int().positive().optional() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [item] = await db.select().from(newsItems).where(eq(newsItems.id, input.newsId)).limit(1);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "资讯不存在" });
      if (item.isDeleted) throw new TRPCError({ code: "BAD_REQUEST", message: "已删除资讯不可审核，请先恢复" });
      const [agent] = input.agentId ? await db.select().from(auditAgents).where(eq(auditAgents.id, input.agentId)).limit(1) : await db.select().from(auditAgents).where(eq(auditAgents.isEnabled, 1)).limit(1);
      if (!agent) throw new TRPCError({ code: "BAD_REQUEST", message: "没有启用的审核员" });
      const rules = await db.select().from(auditRules).where(eq(auditRules.isEnabled, 1));
      const response = await invokeLLM({
        model: await resolveAuditModelId(db, agent),
        messages: [
          { role: "system", content: "你是企业内容合规审核员。只输出一个 JSON 对象，禁止输出任何其他文字、解释或 markdown 代码块。JSON 字段：decision（approved=可发布 / needs_review=需人工复核 / rejected=建议拒绝）、riskLevel（low/medium/high/critical）、confidence（0-100 整数，表示你对本判断的把握程度）、reason（中文简要说明）、matchedRules（命中的规则名数组，无则空数组）。\n判定基准：内容客观、来源可追溯、不含未公开经营信息或个人隐私时，果断给 approved 且 confidence 不低于 80；明显虚假、违规或不宜内部传播时，给 rejected 且 confidence 不低于 80；只有确实无法判断时才给 needs_review。不要为了显得谨慎而把本可判断的内容推给人工复核。" },
          { role: "user", content: `审核规则：${JSON.stringify(rules.map(rule => ({ name: rule.name, description: rule.description, riskLevel: rule.riskLevel, keywords: rule.keywords })))}\n\n资讯标题：${item.title}\n摘要：${item.summary}\n正文：${item.content ?? "无"}` },
        ],
      });
      const responseContent = response.choices[0]?.message?.content;
      if (typeof responseContent !== "string") {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "审核员未返回可解析的结构化结果" });
      }
      const parsed = parseAuditResult(responseContent); const decision = resolveAutomatedDecision(parsed, agent.confidenceThreshold);
      await db.insert(auditRecords).values({ newsId: item.id, agentId: agent.id, decision, riskLevel: parsed.riskLevel, confidence: parsed.confidence, reason: parsed.reason, matchedRules: parsed.matchedRules });
      await db.update(newsItems).set({ reviewStatus: reviewStatusFromDecision(decision), riskLevel: parsed.riskLevel }).where(eq(newsItems.id, item.id));
      return { ...parsed, decision, agentName: agent.name };
    }),
    runBatchAudit: adminProcedure.input(z.object({ maxItems: z.number().int().min(1).max(10).default(10), agentId: z.number().int().positive().optional() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
      const [agent] = input.agentId ? await db.select().from(auditAgents).where(eq(auditAgents.id, input.agentId)).limit(1) : await db.select().from(auditAgents).where(eq(auditAgents.isEnabled, 1)).limit(1);
      if (!agent || !agent.isEnabled) throw new TRPCError({ code: "BAD_REQUEST", message: "没有启用的审核员" });
      const [rules, candidates] = await Promise.all([
        db.select().from(auditRules).where(eq(auditRules.isEnabled, 1)),
        db.select().from(newsItems).where(and(eq(newsItems.reviewStatus, "pending"), eq(newsItems.isDeleted, 0))).orderBy(desc(newsItems.updatedAt)).limit(input.maxItems),
      ]);
      const result = { requested: candidates.length, processed: 0, approved: 0, needsReview: 0, rejected: 0, failed: 0, failures: [] as number[] };
      const model = await resolveAuditModelId(db, agent);
      for (const item of candidates) {
        try {
          const response = await invokeLLM({
            model,
            messages: [
              { role: "system", content: "你是企业内容预审员。只输出一个 JSON 对象，禁止输出任何其他文字、解释或 markdown 代码块。JSON 字段：decision（approved=可发布 / needs_review=需人工复核 / rejected=建议拒绝）、riskLevel（low/medium/high/critical）、confidence（0-100 整数，表示你对本判断的把握程度）、reason（中文简要说明）、matchedRules（命中的规则名数组，无则空数组）。\n判定基准：常规行业动态、产品更新、技术分享、官方公告等无敏感内容 → approved 且 confidence 不低于 80；明显低质量、营销灌水、虚假夸大、无来源断言或不适合内部传播 → rejected 且 confidence 不低于 80；只有确实无法判断时才给 needs_review。不要把大批正常内容推给人工复核。" },
              { role: "user", content: `审核规则：${JSON.stringify(rules.map(rule => ({ name: rule.name, description: rule.description, riskLevel: rule.riskLevel, keywords: rule.keywords })))}\n\n资讯标题：${item.title}\n摘要：${item.summary}\n正文：${item.content ?? "无"}` },
            ],
          });
          const responseContent = response.choices[0]?.message?.content;
          if (typeof responseContent !== "string") throw new Error("审核员未返回可解析的结构化结果");
          const parsed = parseAuditResult(responseContent);
          const decision = resolveAutomatedDecision(parsed, agent.confidenceThreshold);
          await db.insert(auditRecords).values({ newsId: item.id, agentId: agent.id, decision, riskLevel: parsed.riskLevel, confidence: parsed.confidence, reason: parsed.reason, matchedRules: parsed.matchedRules });
          await db.update(newsItems).set({ reviewStatus: reviewStatusFromDecision(decision), riskLevel: parsed.riskLevel }).where(eq(newsItems.id, item.id));
          result.processed += 1;
          if (decision === "approved") result.approved += 1;
          else if (decision === "rejected") result.rejected += 1;
          else result.needsReview += 1;
        } catch (error) {
          result.failed += 1;
          result.failures.push(item.id);
        }
      }
      return { ...result, agentName: agent.name, threshold: agent.confidenceThreshold };
    }),
  }),
});
