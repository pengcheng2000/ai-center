// AI 助手的页面上下文采集器：根据当前路由从 tRPC/React Query 缓存中
// 提取页面类型、标题与正文摘录，随提问一起发给后端，让助手“读到”用户正在看的页面。
import { trpc } from "@/lib/trpc";

export type AssistantPageKind = "home" | "learn" | "learningPath" | "course" | "newsList" | "newsArticle" | "communityList" | "postDetail" | "skillsHub" | "skillDetail" | "profile" | "operations" | "apps" | "other";

export type PageContext = { route: string; pageKind: AssistantPageKind; title: string; excerpt: string; selection: string };

function clamp(text: string, max: number) { return text.replace(/\s+/g, " ").trim().slice(0, max); }

// 当前页面的用户选中文本（阅读助手式：划词后可直接问）。
export function captureSelection(): string {
  const text = typeof window !== "undefined" ? window.getSelection()?.toString() ?? "" : "";
  return clamp(text, 4_000);
}

// 解析 wouter 风格路径到页面类型。
export function resolvePageKind(route: string): { kind: AssistantPageKind; id: number | null; secondaryId: number | null } {
  const segments = route.split("?")[0].split("/").filter(Boolean);
  const [first, second, third, fourth] = segments;
  const numeric = (value?: string) => { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : null; };
  if (!first) return { kind: "home", id: null, secondaryId: null };
  if (first === "learn") {
    if (second === undefined) return { kind: "learn", id: null, secondaryId: null };
    if (third === "course" && fourth !== undefined) return { kind: "course", id: numeric(second), secondaryId: numeric(fourth) };
    return { kind: "learningPath", id: numeric(second), secondaryId: null };
  }
  if (first === "news") return second === undefined ? { kind: "newsList", id: null, secondaryId: null } : { kind: "newsArticle", id: numeric(second), secondaryId: null };
  if (first === "community") return second === undefined || second === "new" ? { kind: "communityList", id: null, secondaryId: null } : { kind: "postDetail", id: numeric(second), secondaryId: null };
  if (first === "skills") return second === undefined ? { kind: "skillsHub", id: null, secondaryId: null } : { kind: "skillDetail", id: numeric(second), secondaryId: null };
  if (first === "me") return { kind: "profile", id: null, secondaryId: null };
  if (first === "operations") return { kind: "operations", id: null, secondaryId: null };
  if (first === "apps") return { kind: "apps", id: null, secondaryId: null };
  return { kind: "other", id: null, secondaryId: null };
}

// 从 React Query 缓存读取当前页面主体内容（标题 + 正文摘录），不触发网络请求。
export function collectPageContext(route: string, utils: ReturnType<typeof trpc.useUtils>): PageContext {
  const { kind, id, secondaryId } = resolvePageKind(route);
  const context: PageContext = { route: route || "/", pageKind: kind, title: "", excerpt: "", selection: captureSelection() };
  const catalog = utils.platform.catalog.getData();
  const personal = utils.platform.personal.get.getData();

  if (kind === "learn" && catalog) {
    const started = (personal?.progress ?? []).filter(item => item.progress > 0 && item.progress < 100).length;
    context.title = "学习中心";
    context.excerpt = `共 ${catalog.paths.length} 条学习路径、${catalog.courses.length} 门课程；你正在学习其中 ${started} 门。支持分类筛选与搜索，卡片可直接进入课程。`;
  } else if (kind === "learningPath" && id && catalog) {
    const path = catalog.paths.find(item => item.id === id);
    if (path) {
      const courses = catalog.courses.filter(item => item.pathId === id);
      context.title = path.title;
      context.excerpt = `学习路径：${path.description} 等级 ${path.level}，时长 ${path.duration}，共 ${courses.length} 节：${courses.map(course => `${course.title}（${course.resourceType}，${course.duration}）`).join("；")}。`;
    }
  } else if (kind === "course" && id && secondaryId && catalog) {
    const course = catalog.courses.find(item => item.id === secondaryId);
    const experience = utils.platform.learning.courseExperience.getData({ courseId: secondaryId });
    if (course) {
      const materials = (experience?.materials ?? []).map(material => {
        if (material.content?.trim()) return `${material.title}：${clamp(material.content, 3_000)}`;
        return `${material.title}（${material.mimeType ?? material.materialType}，未内联正文）`;
      });
      context.title = course.title;
      context.excerpt = `课程：${course.title}。${course.summary}。学习素材：${materials.join("\n\n") || "暂无结构化素材"}`;
    }
  } else if (kind === "newsList" && catalog) {
    context.title = "AI 资讯";
    context.excerpt = `共 ${catalog.news.length} 条已审核资讯，例如：${catalog.news.slice(0, 8).map(row => row.item.title).join("；")}。`;
  } else if (kind === "newsArticle" && id && catalog) {
    const row = catalog.news.find(item => item.item.id === id);
    if (row) {
      context.title = row.item.title;
      context.excerpt = `${row.item.summary}\n\n${clamp(row.item.content ?? "", 10_000)}`;
    }
  } else if (kind === "communityList") {
    const posts = utils.platform.community.list.getData();
    if (posts) context.excerpt = `社区最新帖子：${posts.slice(0, 8).map(item => `${item.post.title}（${item.post.postType}）`).join("；")}。`;
    context.title = "实践社区";
  } else if (kind === "postDetail" && id) {
    const detail = utils.platform.community.detail.getData({ postId: id });
    if (detail) {
      context.title = detail.post.title;
      context.excerpt = `${detail.post.title}\n\n${clamp(detail.post.content, 8_000)}\n\n评论：${detail.comments.map(item => `${item.authorName || "员工"}：${clamp(item.comment.content, 200)}`).join("；")}`;
    }
  } else if (kind === "skillsHub") {
    const skills = utils.platform.skills.list.getData();
    if (skills) context.excerpt = `Skills 广场共 ${skills.length} 个技能包，例如：${skills.slice(0, 8).map(row => `${row.skill.name}（${row.skill.category}）`).join("；")}。`;
    context.title = "Skills 广场";
  } else if (kind === "skillDetail" && id) {
    const detail = utils.platform.skills.detail.getData({ id });
    if (detail) {
      context.title = detail.skill.name;
      context.excerpt = `${detail.skill.summary}\n\n${clamp(detail.skill.description, 6_000)}\n\n使用指南：${clamp(detail.skill.usageGuide, 3_000)}`;
    }
  } else if (kind === "home" && catalog && personal) {
    context.title = "工作台";
    context.excerpt = `个人画像：${personal.profile?.headline ?? ""}，能力标签 ${(personal.profile?.abilityTags ?? []).join("、")}。推荐学习：${(personal.recommendations ?? []).map(rec => `${rec.path.title}（${rec.reason}）`).join("；")}。`;
  } else if (kind === "profile" && personal) {
    context.title = "个人空间";
    context.excerpt = `学习统计：连续 ${personal.learningStats?.streak ?? 0} 天，本周 ${personal.learningStats?.weeklyMinutes ?? 0} 分钟。已完成课程 ${(personal.progress ?? []).filter(item => item.progress === 100).length} 门。`;
  }
  context.excerpt = clamp(context.excerpt, 12_000);
  return context;
}

// 快捷指令按页面类型变化：文章页偏阅读，功能页偏指导。
export function quickPromptsFor(kind: AssistantPageKind): string[] {
  switch (kind) {
    case "newsArticle": return ["这篇文章讲了什么？", "帮我提炼 3 个关键要点", "用通俗的话解释核心概念", "这篇文章对我们的工作有什么启发？"];
    case "course": return ["这节课的素材重点是什么？", "帮我制定本课的学习计划", "解释我在页面选中的内容", "这个知识点怎么用到实际工作？"];
    case "learningPath": return ["这条路径适合谁？学完能做什么？", "帮我规划学习顺序", "各节内容之间有什么关系？"];
    case "learn": return ["怎么记录学习进度？", "PDF 怎么标注？", "视频弹幕怎么发？", "推荐我从哪条路径开始？"];
    case "postDetail": return ["这个帖子的讨论有什么价值？", "帮我总结楼主的实践经验"];
    case "skillDetail": return ["这个 Skill 适合什么场景？", "怎么安装使用这个 Skill？"];
    case "home": return ["平台上有什么值得先体验的功能？", "我该学什么？", "怎么用好这个平台？"];
    default: return ["平台上有什么功能？", "学习中心怎么用？", "怎么发弹幕和做 PDF 标注？", "帮我理解当前页面内容"];
  }
}
