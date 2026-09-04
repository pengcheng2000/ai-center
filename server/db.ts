import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { isFullTextNews } from "../shared/news";
import { deriveNewsSignals } from "../shared/newsSignals";
import { drizzle } from "drizzle-orm/mysql2";
import {
  agentImportJobs,
  agentImportKeys,
  auditAgents,
  auditRecords,
  auditRules,
  communityPosts,
  communityTopicFollows,
  communityTopics,
  courseMaterialProgress,
  courseMaterials,
  courseProgress,
  courses,
  enterpriseApps,
  featureModules,
  learningPaths,
  llmModels,
  llmProviders,
  modelRoutingPolicies,
  newsFavorites,
  newsReadEvents,
  newsItems,
  newsSources,
  postComments,
  postAttachments,
  postLikes,
  type InsertUser,
  type User,
  userProfiles,
  users,
  workspaceItems,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

type RecommendationPath = { id: number; title: string; tags: string[]; isFeatured: number; duration?: string; lessonCount?: number };
type RecommendationCourse = { id: number; pathId: number };
type RecommendationProgress = { courseId: number; progress: number };
type RecommendationProfile = { abilityTags: string[]; interestTags: string[] } | null;

// 以本地日期计算连续学习天数：今天没有记录时从昨天起算，避免“当晚 23:59 学习、次日 00:01 断签”。
export function computeLearningStats(rows: Array<{ minutes: number; updatedAt: Date }>, now = new Date()) {
  const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const weeklyMinutes = rows.filter(row => row.updatedAt.getTime() >= weekAgo).reduce((sum, row) => sum + row.minutes, 0);
  const activeDays = new Set(rows.map(row => dayKey(row.updatedAt)));
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!activeDays.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (activeDays.has(dayKey(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
  return { weeklyMinutes, streak, activeDays: activeDays.size };
}

export function buildLearningRecommendations(paths: RecommendationPath[], courseRows: RecommendationCourse[], progressRows: RecommendationProgress[], profile: RecommendationProfile) {
  const preferenceTags = new Set([...(profile?.abilityTags ?? []), ...(profile?.interestTags ?? [])].map(tag => tag.toLowerCase()));
  const progressByCourse = new Map(progressRows.map(item => [item.courseId, item.progress]));
  return paths.map(path => {
    const pathCourses = courseRows.filter(course => course.pathId === path.id);
    const averageProgress = pathCourses.length ? Math.round(pathCourses.reduce((sum, course) => sum + (progressByCourse.get(course.id) ?? 0), 0) / pathCourses.length) : 0;
    const matches = path.tags.filter(tag => preferenceTags.has(tag.toLowerCase()));
    const isInProgress = averageProgress > 0 && averageProgress < 100;
    const score = matches.length * 10 + (isInProgress ? 40 : 0) + (averageProgress === 0 ? 6 : 0) + (path.isFeatured ? 2 : 0);
    const reason = isInProgress ? `你已完成该路径约 ${averageProgress}%，建议继续完成` : matches.length ? `与你关注的“${matches.slice(0, 2).join("、")}”相关` : "适合作为下一步能力拓展";
    return { path, score, progress: averageProgress, reason };
  }).filter(item => item.progress < 100).sort((a, b) => b.score - a.score).slice(0, 2);
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId, lastSignedIn: new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: new Date() };
  (["name", "email", "loginMethod", "username"] as const).forEach(field => {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });
  if (user.passwordHash !== undefined) {
    values.passwordHash = user.passwordHash ?? null;
    updateSet.passwordHash = user.passwordHash ?? null;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function ensurePlatformBootstrap() {
  const db = await getDb();
  if (!db) return;
  const [existingModule] = await db.select({ id: featureModules.id }).from(featureModules).limit(1);
  if (existingModule) return;

  await db.insert(featureModules).values([
    { moduleKey: "learn", name: "学习中心", description: "从理解到应用的 AI 能力路径", destination: "/#learn", icon: "graduation-cap", audience: "employee", isEnabled: 1, orderIndex: 1 },
    { moduleKey: "news", name: "AI 资讯", description: "已审核的趋势、案例与学习资源", destination: "/#news", icon: "newspaper", audience: "employee", isEnabled: 1, orderIndex: 2 },
    { moduleKey: "community", name: "实践社区", description: "分享经验、提问和资源共建", destination: "/#community", icon: "messages-square", audience: "employee", isEnabled: 1, orderIndex: 3 },
    { moduleKey: "workspace", name: "我的 Workspace", description: "把常用能力组织成个人工作台", destination: "/#workspace", icon: "sparkles", audience: "employee", isEnabled: 1, orderIndex: 4 },
  ]);

  const [agent] = await db.insert(auditAgents).values({
    name: "资讯合规审核员",
    description: "以企业内部传播规范为边界，对进入资讯中心的内容给出风险分级、原因说明与人工复核建议。",
    modelPreference: "deepseek-v4",
    confidenceThreshold: 72,
    isEnabled: 1,
  }).$returningId();
  await db.insert(auditRules).values([
    { agentId: agent.id, name: "敏感经营信息", description: "识别未经公开披露的经营、项目、客户或财务信息。", riskLevel: "high", keywords: ["未公开", "客户名单", "报价", "财务数据"] },
    { agentId: agent.id, name: "个人与隐私信息", description: "识别可直接或间接关联到个人的敏感信息。", riskLevel: "high", keywords: ["身份证", "手机号", "住址", "个人信息"] },
    { agentId: agent.id, name: "事实与来源可追溯", description: "提示缺少来源、夸大效果或可能引发误解的 AI 内容。", riskLevel: "medium", keywords: ["保证", "绝对", "内幕", "100%"] },
  ]);

  const pathIds = await db.insert(learningPaths).values([
    { title: "AI 素养起步", description: "理解生成式 AI 的基本原理、边界与企业使用规范，建立安全且高效的第一步。", level: "beginner", category: "通识基础", duration: "4 小时", lessonCount: 4, accent: "violet", tags: ["零基础", "安全", "提示词"], prerequisitePathIds: [], isFeatured: 1 },
    { title: "把 AI 用进日常工作", description: "围绕会议、写作、分析和信息处理，形成可迁移的个人工作流。", level: "intermediate", category: "办公提效", duration: "6 小时", lessonCount: 5, accent: "orange", tags: ["效率", "工作流", "模板"], prerequisitePathIds: [], isFeatured: 1 },
    { title: "业务场景 AI 实践", description: "从问题界定到方案验证，学习将 AI 价值连接到具体业务结果。", level: "advanced", category: "业务创新", duration: "8 小时", lessonCount: 6, accent: "emerald", tags: ["实践", "案例", "协作"], prerequisitePathIds: [], isFeatured: 1 },
  ]).$returningId();
  await db.insert(courses).values([
    { pathId: pathIds[0].id, title: "认识生成式 AI", summary: "建立能力地图，理解它能做什么、不能做什么。", duration: "35 分钟", orderIndex: 1, resourceType: "article", tags: ["通识"], prerequisiteCourseIds: [] },
    { pathId: pathIds[0].id, title: "高质量提示词的结构", summary: "把需求讲清楚，让 AI 给出更稳定的结果。", duration: "50 分钟", orderIndex: 2, resourceType: "video", tags: ["提示词"], prerequisiteCourseIds: [] },
    { pathId: pathIds[0].id, title: "企业场景安全使用清单", summary: "在体验效率之前，先守好数据与信息边界。", duration: "40 分钟", orderIndex: 3, resourceType: "exercise", tags: ["安全"], prerequisiteCourseIds: [] },
    { pathId: pathIds[1].id, title: "一页完成周报初稿", summary: "复用结构化模板，让汇报更聚焦结果。", duration: "45 分钟", orderIndex: 1, resourceType: "template", tags: ["写作"], prerequisiteCourseIds: [] },
    { pathId: pathIds[1].id, title: "会议纪要的提炼与追踪", summary: "从记录到行动项，减少沟通损耗。", duration: "55 分钟", orderIndex: 2, resourceType: "video", tags: ["会议"], prerequisiteCourseIds: [] },
    { pathId: pathIds[2].id, title: "从业务问题到 AI 方案", summary: "用可验证的目标定义 AI 试点。", duration: "70 分钟", orderIndex: 1, resourceType: "exercise", tags: ["方案"], prerequisiteCourseIds: [] },
  ]);

  const sourceIds = await db.insert(newsSources).values([
    { name: "企业 AI 观察", url: "https://example.com/ai-observatory", sourceType: "manual", category: "企业实践", description: "企业内部及可信公开来源的 AI 应用观察。", isEnabled: 1, totalProcessed: 12, lastProcessedAt: new Date() },
    { name: "前沿模型周刊", url: "https://example.com/model-weekly", sourceType: "rss", category: "模型趋势", description: "关注模型能力、产品更新与开发者生态。", isEnabled: 1, totalProcessed: 20, lastProcessedAt: new Date() },
    { name: "AI 学习资源库", url: "https://example.com/learning", sourceType: "website", category: "学习资源", description: "适合企业员工的入门与进阶学习资料。", isEnabled: 1, totalProcessed: 8, lastProcessedAt: new Date() },
  ]).$returningId();
  await db.insert(newsItems).values([
    { sourceId: sourceIds[0].id, title: "从“会用”到“用好”：企业 AI 学习的三个关键动作", summary: "围绕场景优先、模板沉淀和结果复盘，建立可复制的 AI 能力成长路径。", content: "本篇内容聚焦企业内部推广 AI 时，如何用真实工作场景串联学习、练习和知识沉淀。", sourceUrl: "https://example.com/ai-learning", category: "企业实践", tags: ["学习路径", "企业实践"], reviewStatus: "approved", riskLevel: "low", isFeatured: 1, publishedAt: new Date() },
    { sourceId: sourceIds[1].id, title: "本周模型能力观察：更可控的推理与更长的上下文", summary: "梳理近期模型能力更新，并提示企业场景应优先评估数据边界和实际任务稳定性。", content: "模型能力增强并不等于可以跳过验证，建议先建立小范围可测的试点任务。", sourceUrl: "https://example.com/model-update", category: "模型趋势", tags: ["大模型", "趋势"], reviewStatus: "needs_review", riskLevel: "medium", publishedAt: new Date() },
    { sourceId: sourceIds[2].id, title: "提示词模板：把模糊需求拆成清晰任务", summary: "一套可直接复用的任务背景、目标、约束和输出格式模板，适合刚开始使用 AI 的员工。", content: "清晰的任务定义是可用输出的前提。", sourceUrl: "https://example.com/prompt-template", category: "学习资源", tags: ["提示词", "模板"], reviewStatus: "approved", riskLevel: "low", publishedAt: new Date() },
  ]);
}

export async function ensureGovernanceBootstrap() {
  const db = await getDb();
  if (!db) return;
  const [managedProvider] = await db.select({ id: llmProviders.id }).from(llmProviders).where(eq(llmProviders.name, "企业模型网关")).limit(1);
  if (!managedProvider) {
    const [provider] = await db.insert(llmProviders).values({ name: "企业模型网关", providerType: "custom", baseUrl: ENV.llmBaseUrl || "https://ai-model.chint.com/api", keyAlias: "LLM_API_KEY", healthStatus: "healthy", gatewayStatus: "verified", gatewayCheckedAt: new Date(), isEnabled: 1, orderIndex: 1 }).$returningId();
    const [model] = await db.insert(llmModels).values({ providerId: provider.id, modelId: ENV.llmModel || "deepseek-v4", displayName: "DeepSeek V4", capabilityTags: ["结构化输出", "内容审核"], scenarioTags: ["audit", "content"], contextWindow: 128000, isDefault: 1, isEnabled: 1, orderIndex: 1 }).$returningId();
    await db.insert(modelRoutingPolicies).values([
      { name: "默认对话策略", scenario: "default", primaryModelId: model.id, fallbackModelIds: [], isEnabled: 1 },
      { name: "内容审核策略", scenario: "audit", primaryModelId: model.id, fallbackModelIds: [], isEnabled: 1 },
    ]);
  }
  const [defaultAuditModel] = await db.select({ id: llmModels.id }).from(llmModels).where(and(eq(llmModels.modelId, ENV.llmModel || "deepseek-v4"), eq(llmModels.isEnabled, 1))).orderBy(desc(llmModels.isDefault), asc(llmModels.orderIndex)).limit(1);
  if (defaultAuditModel) await db.update(auditAgents).set({ selectedModelId: defaultAuditModel.id }).where(and(isNull(auditAgents.selectedModelId), eq(auditAgents.modelPreference, "deepseek-v4")));
  const [existingTopic] = await db.select({ id: communityTopics.id }).from(communityTopics).limit(1);
  if (!existingTopic) {
    await db.insert(communityTopics).values([
      { name: "提示词与工作流", description: "可复用的提示词、流程和自动化方法。", color: "violet", isEnabled: 1, isFeatured: 1 },
      { name: "业务实践", description: "围绕具体业务目标验证 AI 价值的案例。", color: "emerald", isEnabled: 1, isFeatured: 1 },
      { name: "安全与治理", description: "数据边界、审核规范与可信使用讨论。", color: "orange", isEnabled: 1, isFeatured: 0 },
    ]);
  }
}

export function filterCatalogNews<T extends { item: { content: string | null; summary: string } }>(rows: T[], fullTextOnly: boolean) {
  return fullTextOnly ? rows.filter(row => isFullTextNews(row.item)) : rows;
}
export function shapeCatalogNews<T extends { id: number; content: string | null; summary: string; isFeatured: number; publishedAt: Date | null; createdAt: Date }>(rows: Array<{ item: T; sourceName: string | null }>, readStats: Array<{ newsId: number; count: number }>, favoriteStats: Array<{ newsId: number; count: number }>, now = new Date()) {
  const readsByNews = new Map(readStats.map(item => [item.newsId, Number(item.count)])); const favoritesByNews = new Map(favoriteStats.map(item => [item.newsId, Number(item.count)]));
  return rows.map(({ item, sourceName }) => ({ item: { ...item, isFullText: isFullTextNews(item), ...deriveNewsSignals(item, now), readCount: readsByNews.get(item.id) ?? 0, favoriteCount: favoritesByNews.get(item.id) ?? 0 }, sourceName }));
}
export function filterPublishedCourses<T extends { lifecycleStatus: "draft" | "published" | "archived" }>(rows: T[]) { return rows.filter(row => row.lifecycleStatus === "published"); }
export function filterApprovedNews<T extends { reviewStatus: string; isDeleted?: number }>(rows: T[]) { return rows.filter(row => row.reviewStatus === "approved" && !row.isDeleted); }
export function countResourceGaps<T extends { id: number; resourceUrl: string | null }, M extends { courseId: number }>(courseRows: T[], materialRows: M[]) {
  const coveredCourseIds = new Set(materialRows.map(item => item.courseId));
  return courseRows.filter(item => !item.resourceUrl && !coveredCourseIds.has(item.id)).length;
}

export async function getPublicCatalog(category?: string, fullTextOnly = false) {
  await ensurePlatformBootstrap();
  const db = await getDb();
  if (!db) return { paths: [], courses: [], news: [], newsCategories: [], modules: [], apps: [], posts: [] };
  const fullTextCondition = sql`char_length(coalesce(${newsItems.content}, '')) > char_length(${newsItems.summary}) + 80`;
  const visibleNews = and(eq(newsItems.isDeleted, 0), eq(newsItems.reviewStatus, "approved"), category ? eq(newsItems.category, category) : undefined, fullTextOnly ? fullTextCondition : undefined);
  const [paths, courseRows, news, newsCategories, modules, apps, posts, readStats, favoriteStats] = await Promise.all([
    db.select().from(learningPaths).where(eq(learningPaths.isPublished, 1)).orderBy(desc(learningPaths.isFeatured), asc(learningPaths.id)),
    db.select().from(courses).where(eq(courses.lifecycleStatus, "published")).orderBy(asc(courses.pathId), asc(courses.orderIndex)),
    db.select({ item: newsItems, sourceName: newsSources.name }).from(newsItems).leftJoin(newsSources, eq(newsItems.sourceId, newsSources.id)).where(visibleNews).orderBy(desc(newsItems.isFeatured), desc(newsItems.publishedAt)),
    db.select({ category: newsItems.category }).from(newsItems).where(and(eq(newsItems.isDeleted, 0), eq(newsItems.reviewStatus, "approved"))).groupBy(newsItems.category),
    db.select().from(featureModules).where(and(eq(featureModules.isEnabled, 1), sql`${featureModules.audience} != 'admin'`)).orderBy(asc(featureModules.orderIndex)),
    db.select().from(enterpriseApps).where(and(eq(enterpriseApps.isEnabled, 1), sql`${enterpriseApps.audience} != 'admin'`)).orderBy(asc(enterpriseApps.orderIndex)),
    db.select({ post: communityPosts, authorName: users.name }).from(communityPosts).leftJoin(users, eq(communityPosts.authorId, users.id)).where(eq(communityPosts.isDeleted, 0)).orderBy(desc(communityPosts.isPinned), desc(communityPosts.createdAt)).limit(12),
    db.select({ newsId: newsReadEvents.newsId, count: sql<number>`count(*)` }).from(newsReadEvents).groupBy(newsReadEvents.newsId),
    db.select({ newsId: newsFavorites.newsId, count: sql<number>`count(*)` }).from(newsFavorites).groupBy(newsFavorites.newsId),
  ]);
  const catalogNews = shapeCatalogNews(news, readStats, favoriteStats);
  return { paths, courses: filterPublishedCourses(courseRows), news: filterCatalogNews(catalogNews, fullTextOnly), newsCategories: newsCategories.map(item => item.category), modules, apps, posts };
}

export async function getPersonalSpaceByUserId(userId: number) {
  const db = await getDb();
  if (!db) return { profile: null, progress: [], favorites: [], likedPosts: [], workspace: [], recommendations: [], learningStats: { weeklyMinutes: 0, streak: 0, activeDays: 0 } };
  await db.insert(userProfiles).values({ userId, abilityTags: ["AI 学习者"], interestTags: ["办公提效"], growthGoals: ["建立一个可复用的 AI 工作流"] }).onDuplicateKeyUpdate({ set: { userId } });
  const [profile, progress, favorites, likedPosts, workspace, availablePaths, courseRows, activityRows] = await Promise.all([
    db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1),
    db.select().from(courseProgress).where(eq(courseProgress.userId, userId)),
    db.select().from(newsFavorites).where(eq(newsFavorites.userId, userId)),
    db.select().from(postLikes).where(eq(postLikes.userId, userId)),
    db.select().from(workspaceItems).where(eq(workspaceItems.userId, userId)).orderBy(asc(workspaceItems.orderIndex)),
    db.select().from(learningPaths).where(eq(learningPaths.isPublished, 1)),
    db.select({ id: courses.id, pathId: courses.pathId, lifecycleStatus: courses.lifecycleStatus }).from(courses).where(eq(courses.lifecycleStatus, "published")),
    db.select({ minutes: courseMaterialProgress.minutes, updatedAt: courseMaterialProgress.updatedAt }).from(courseMaterialProgress).where(eq(courseMaterialProgress.userId, userId)),
  ]);
  const profileRow = profile[0] ?? null;
  const recommendations = buildLearningRecommendations(availablePaths, courseRows, progress, profileRow ? { abilityTags: profileRow.abilityTags, interestTags: profileRow.interestTags } : null);
  return { profile: profileRow, progress, favorites, likedPosts, workspace, recommendations, learningStats: computeLearningStats(activityRows) };
}

export async function getPersonalSpace(user: User) {
  return getPersonalSpaceByUserId(user.id);
}

export async function deleteWorkspaceForUser(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用");
  await db.delete(workspaceItems).where(and(eq(workspaceItems.id, id), eq(workspaceItems.userId, userId)));
  return { success: true } as const;
}

export async function discardDraftAttachmentForUser(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用");
  await db.delete(postAttachments).where(and(eq(postAttachments.id, id), eq(postAttachments.ownerId, userId), isNull(postAttachments.postId)));
  return { success: true } as const;
}

export async function getOperationsData() {
  await ensurePlatformBootstrap();
  await ensureGovernanceBootstrap();
  const db = await getDb();
  if (!db) return { sources: [], modules: [], apps: [], agents: [], rules: [], records: [], news: [], deletedNews: [], providers: [], models: [], policies: [], paths: [], courses: [], materials: [], topics: [], reviewers: [], importKeys: [], importJobs: [], metrics: { content: 0, pending: 0, learners: 0, posts: 0 }, learningMetrics: { publishedPaths: 0, totalPaths: 0, publishedCourses: 0, totalCourses: 0, resourceGaps: 0, reviewRisk: 0, completionRate: 0 } };
  const [sources, modules, apps, agents, rules, records, news, deletedNews, providers, models, policies, paths, courseRows, materials, topics, reviewers, importKeys, importJobs, metrics, averageProgress] = await Promise.all([
    db.select().from(newsSources).orderBy(desc(newsSources.updatedAt)),
    db.select().from(featureModules).orderBy(asc(featureModules.orderIndex)),
    db.select().from(enterpriseApps).orderBy(asc(enterpriseApps.orderIndex)),
    db.select().from(auditAgents).orderBy(desc(auditAgents.updatedAt)),
    db.select().from(auditRules).orderBy(desc(auditRules.updatedAt)),
    db.select({ record: auditRecords, title: newsItems.title, agentName: auditAgents.name }).from(auditRecords).leftJoin(newsItems, eq(auditRecords.newsId, newsItems.id)).leftJoin(auditAgents, eq(auditRecords.agentId, auditAgents.id)).orderBy(desc(auditRecords.createdAt)).limit(16),
    db.select().from(newsItems).where(eq(newsItems.isDeleted, 0)).orderBy(desc(newsItems.updatedAt)).limit(16),
    db.select().from(newsItems).where(eq(newsItems.isDeleted, 1)).orderBy(desc(newsItems.deletedAt)).limit(16),
    db.select().from(llmProviders).orderBy(asc(llmProviders.orderIndex)),
    db.select({ model: llmModels, providerName: llmProviders.name }).from(llmModels).leftJoin(llmProviders, eq(llmModels.providerId, llmProviders.id)).orderBy(asc(llmModels.orderIndex)),
    db.select().from(modelRoutingPolicies).orderBy(asc(modelRoutingPolicies.scenario)),
    db.select().from(learningPaths).orderBy(asc(learningPaths.category), asc(learningPaths.id)),
    db.select().from(courses).orderBy(asc(courses.pathId), asc(courses.orderIndex)),
    db.select().from(courseMaterials).orderBy(asc(courseMaterials.courseId), asc(courseMaterials.orderIndex)),
    db.select().from(communityTopics).orderBy(desc(communityTopics.isFeatured), asc(communityTopics.name)),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.role, "admin")),
    db.select({ id: agentImportKeys.id, name: agentImportKeys.name, tokenPrefix: agentImportKeys.tokenPrefix, allowedTargets: agentImportKeys.allowedTargets, isEnabled: agentImportKeys.isEnabled, lastUsedAt: agentImportKeys.lastUsedAt, expiresAt: agentImportKeys.expiresAt, revokedAt: agentImportKeys.revokedAt, createdAt: agentImportKeys.createdAt }).from(agentImportKeys).orderBy(desc(agentImportKeys.createdAt)),
    db.select({ job: agentImportJobs, keyName: agentImportKeys.name }).from(agentImportJobs).leftJoin(agentImportKeys, eq(agentImportJobs.importKeyId, agentImportKeys.id)).orderBy(desc(agentImportJobs.createdAt)).limit(40),
    Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(newsItems),
      db.select({ count: sql<number>`count(*)` }).from(newsItems).where(inArray(newsItems.reviewStatus, ["pending", "needs_review"])),
      db.select({ count: sql<number>`count(distinct ${courseProgress.userId})` }).from(courseProgress),
      db.select({ count: sql<number>`count(*)` }).from(communityPosts).where(eq(communityPosts.isDeleted, 0)),
    ]),
    db.select({ average: sql<number>`coalesce(avg(${courseProgress.progress}), 0)` }).from(courseProgress),
  ]);
  const publishedPaths = paths.filter(item => item.lifecycleStatus === "published").length;
  const publishedCourses = courseRows.filter(item => item.lifecycleStatus === "published");
  const resourceGaps = countResourceGaps(publishedCourses, materials);
  const reviewRisk = [...paths, ...courseRows].filter(item => item.reviewStatus !== "current").length;
  return { sources, modules, apps, agents, rules, records, news, deletedNews, providers, models, policies, paths, courses: courseRows, materials, topics, reviewers, importKeys, importJobs, metrics: { content: Number(metrics[0][0]?.count ?? 0), pending: Number(metrics[1][0]?.count ?? 0), learners: Number(metrics[2][0]?.count ?? 0), posts: Number(metrics[3][0]?.count ?? 0) }, learningMetrics: { publishedPaths, totalPaths: paths.length, publishedCourses: publishedCourses.length, totalCourses: courseRows.length, resourceGaps, reviewRisk, completionRate: Math.round(Number(averageProgress[0]?.average ?? 0)) } };
}

export const tables = { auditAgents, auditRecords, auditRules, communityPosts, communityTopicFollows, communityTopics, courseProgress, enterpriseApps, featureModules, learningPaths, llmModels, llmProviders, modelRoutingPolicies, newsFavorites, newsItems, newsSources, postComments, postLikes, userProfiles, workspaceItems };
