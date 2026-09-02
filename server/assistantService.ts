import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { assistantChats } from "../drizzle/schema";
import { getDb } from "./db";
import { invokeLLM, type Message } from "./_core/llm";

export const ASSISTANT_PAGE_KIND_LABEL: Record<string, string> = {
  home: "工作台首页", learn: "学习中心", learningPath: "学习路径详情", course: "课程学习页",
  newsList: "AI 资讯列表", newsArticle: "资讯文章阅读页", communityList: "实践社区列表", postDetail: "社区帖子详情",
  skillsHub: "Skills 广场", skillDetail: "Skills 详情", profile: "个人空间", operations: "运营管理", apps: "应用中心", other: "其他页面",
};

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

export const assistantInput = z.object({
  question: z.string().trim().min(1).max(2_000),
  pageContext: z.object({
    route: z.string().min(1).max(200),
    pageKind: z.enum(["home", "learn", "learningPath", "course", "newsList", "newsArticle", "communityList", "postDetail", "skillsHub", "skillDetail", "profile", "operations", "apps", "other"]),
    title: z.string().max(300).default(""), excerpt: z.string().max(12_000).default(""), selection: z.string().max(4_000).default(""),
  }).nullable().default(null),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4_000) })).max(16).default([]),
}).strict();

export type AssistantInput = z.infer<typeof assistantInput>;

export function buildAssistantMessages(input: AssistantInput): Message[] {
  const contextBlock = input.pageContext ? [
    "<page_context>",
    `当前用户正在浏览的页面：${input.pageContext.route}（${ASSISTANT_PAGE_KIND_LABEL[input.pageContext.pageKind] ?? input.pageContext.pageKind}）`,
    input.pageContext.title ? `页面标题：${input.pageContext.title}` : "",
    input.pageContext.selection ? `用户在页面上选中的文字：\n${input.pageContext.selection}` : "",
    input.pageContext.excerpt ? `页面正文摘录：\n${input.pageContext.excerpt.slice(0, 12_000)}` : "",
    "</page_context>",
  ].filter(Boolean).join("\n") : "";
  return [
    { role: "system", content: ASSISTANT_SYSTEM_PROMPT.replace("{{PAGE_CONTEXT}}", contextBlock || "（用户未提供当前页面信息）") },
    ...input.history.slice(-16).map(item => ({ role: item.role, content: item.content })),
    { role: "user", content: input.question },
  ];
}

export async function assertAssistantQuota(userId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库暂不可用" });
  const [usage] = await db.select({ count: sql<number>`count(*)` }).from(assistantChats).where(and(eq(assistantChats.userId, userId), sql`date(${assistantChats.createdAt}) = curdate()`));
  if (Number(usage?.count ?? 0) >= 60) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "AI 助手每天最多 60 次问答，请明天再试" });
  return db;
}

export async function persistAssistantAnswer(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, userId: number, input: AssistantInput, answer: string) {
  await db.insert(assistantChats).values({ userId, question: input.question, answer: answer.slice(0, 16_000), pageRoute: input.pageContext?.route.slice(0, 200) ?? null, pageKind: input.pageContext?.pageKind ?? null });
}

export async function answerAssistant(userId: number, input: AssistantInput) {
  const db = await assertAssistantQuota(userId);
  const response = await invokeLLM({ maxTokens: 2_000, messages: buildAssistantMessages(input) });
  const answer = response.choices[0]?.message?.content;
  if (typeof answer !== "string" || !answer.trim()) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI 助手未返回可阅读的答复" });
  await persistAssistantAnswer(db, userId, input, answer);
  return { answer: answer.slice(0, 16_000), modelId: response.model };
}
