import { useAuth } from "@/_core/hooks/useAuth";
import PlatformShell from "@/components/PlatformShell";
import PageSkeleton from "@/components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { workbenchRoutes } from "@/lib/routes";
import { workbenchHandlers } from "@/lib/workbenchHandlers";
import {
  ArrowRight,
  Bookmark,
  BookOpenCheck,
  Clock3,
  Flame,
  LayoutList,
  Loader2,
  MessageSquareText,
  Newspaper,
  Plus,
  Sparkles,
} from "lucide-react";
import { useLocation } from "wouter";
import { startLogin } from "@/const";

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { data: catalog, isLoading } = trpc.platform.catalog.useQuery();
  const { data: personal } = trpc.platform.personal.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: posts } = trpc.platform.community.list.useQuery();
  const { data: knowledge } = trpc.knowledge.list.useQuery(undefined, { enabled: isAuthenticated });
  if (isLoading || !catalog)
    return (
      <PlatformShell>
        <PageSkeleton cards={3} />
      </PlatformShell>
    );
  const featuredKnowledge = knowledge?.items.filter(item => item.editorial?.featured).slice(0, 3) ?? [];
  const knowledgeCards = featuredKnowledge.length ? featuredKnowledge : (knowledge?.items.slice(0, 3) ?? []);
  const knowledgeIsDevelopmentPreview = knowledgeCards[0]?.visibility === "development_preview";
  const progress = personal?.progress ?? [];
  const favorites = personal?.favorites ?? [];
  return (
    <PlatformShell>
      <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-7">
        <div className="flex flex-col justify-between gap-5 rounded-xl border border-gray-200 bg-white p-5 lg:flex-row lg:items-center">
          <div>
            <p className="text-sm text-gray-500">
              {isAuthenticated
                ? `${new Date().getHours() < 12 ? "早上好" : new Date().getHours() < 18 ? "下午好" : "晚上好"}，${user?.name || "同事"}`
                : "企业 AI 能力工作台"}
            </p>
            <h1 className="mt-1 text-3xl font-semibold">
              今天，先完成一件能产生复利的事。
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              学习、资讯与实践不再分散；用你的工作台串起下一步行动。
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setLocation("/learn")}
              className="rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <BookOpenCheck className="mr-2 h-4 w-4" />
              继续学习
            </Button>
            <Button
              onClick={() =>
                isAuthenticated
                  ? workbenchHandlers.openCommunityComposer(setLocation)
                  : startLogin()
              }
              variant="outline"
              className="rounded-lg"
            >
              <Plus className="mr-2 h-4 w-4" />
              发布实践
            </Button>
          </div>
        </div>
        {knowledgeCards.length > 0 && (
          <section className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/50 p-5">
            <div className="flex items-center justify-between">
              <div><p className="section-kicker">KNOWLEDGE & CASES</p><h2 className="mt-1 text-lg font-semibold">{knowledgeIsDevelopmentPreview ? "知识库开发预览" : "精选知识与案例"}</h2></div>
              <Button variant="ghost" size="sm" onClick={() => setLocation(workbenchRoutes.knowledge)}>查看全部 <ArrowRight className="ml-1 h-4 w-4" /></Button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {knowledgeCards.map(item => (
                <button key={item.publicationId ?? item.itemId} onClick={() => setLocation(workbenchRoutes.knowledgeDetail(item.itemId))} className="rounded-lg border border-indigo-100 bg-white p-4 text-left hover:border-indigo-300">
                  <p className="text-xs text-indigo-600">{item.sourceName}</p>
                  {item.visibility === "development_preview" && <p className="mt-1 text-[11px] text-amber-700">开发预览 · 未发布</p>}
                  <p className="mt-2 line-clamp-2 font-semibold">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500">{item.summary}</p>
                </button>
              ))}
            </div>
          </section>
        )}
        <div className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="section-kicker">NEXT ACTIONS</p>
                <h2 className="mt-1 text-xl font-semibold">我的下一步</h2>
              </div>
              <Button
                onClick={() => setLocation("/learn")}
                variant="ghost"
                size="sm"
              >
                全部学习 <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {(personal?.recommendations?.length
                ? personal.recommendations
                : catalog.paths.slice(0, 2).map(path => ({
                    path,
                    progress: 0,
                    reason: "适合作为下一步能力拓展",
                  }))
              ).map(item => (
                <article
                  key={item.path.id}
                  className="rounded-xl border border-gray-100 bg-gray-50 p-4"
                >
                  <div className="flex items-start justify-between">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-100 text-indigo-600">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <span className="text-xs text-gray-400">
                      {item.path.duration}
                    </span>
                  </div>
                  <h3 className="mt-4 font-semibold">{item.path.title}</h3>
                  <p className="mt-1 min-h-10 text-xs leading-5 text-gray-500">
                    {item.reason}
                  </p>
                  <Progress value={item.progress} className="mt-4 h-1.5" />
                  <div className="mt-2 flex justify-between text-xs text-gray-400">
                    <span>
                      {item.progress > 0
                        ? `已完成 ${item.progress}%`
                        : `${item.path.lessonCount} 节内容`}
                    </span>
                    <button
                      onClick={() =>
                        workbenchHandlers.openLearningPath(
                          setLocation,
                          item.path.id
                        )
                      }
                      className="font-medium text-indigo-600"
                    >
                      进入路径
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
          <section className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold tracking-[.16em] text-indigo-400">
                  PERSONAL SIGNAL
                </p>
                <h2 className="mt-1 text-xl font-semibold text-gray-900">我的 AI 画像</h2>
              </div>
              <Flame className="h-5 w-5 text-orange-300" />
            </div>
            <p className="mt-5 text-sm leading-6 text-gray-600">
              {personal?.profile?.headline ||
                "记录能力标签、兴趣方向与成长目标。"}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {((personal?.profile?.abilityTags as string[] | undefined)
                ?.length ?? 0) > 0 ? (
                (personal?.profile?.abilityTags as string[])
                  .slice(0, 4)
                  .map(tag => (
                    <span
                      key={tag}
                      className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs text-indigo-700"
                    >
                      {tag}
                    </span>
                  ))
              ) : (
                <span className="text-xs text-gray-400">还没有标签</span>
              )}
            </div>
            <Button
              onClick={() => setLocation("/me")}
              variant="secondary"
              className="mt-6 w-full rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
            >
              维护我的画像
            </Button>
          </section>
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-3">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <Header
              icon={Newspaper}
              title="收藏与资讯"
              action={() => setLocation("/news")}
            />
            <div className="mt-4 space-y-3">
              {favorites.length ? (
                catalog.news
                  .filter(({ item }) =>
                    favorites.some(favorite => favorite.newsId === item.id)
                  )
                  .slice(0, 3)
                  .map(({ item }) => (
                    <button
                      key={item.id}
                      onClick={() =>
                        workbenchHandlers.openNewsArticle(setLocation, item.id)
                      }
                      className="block w-full rounded-lg bg-gray-50 p-3 text-left hover:bg-blue-50"
                    >
                      <p className="line-clamp-2 text-sm font-medium">
                        {item.title}
                      </p>
                      <p className="mt-1 text-xs text-blue-600">
                        {item.category}
                      </p>
                    </button>
                  ))
              ) : (
                <Empty text="还没有收藏资讯" icon={Bookmark} />
              )}
            </div>
          </section>
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <Header
              icon={MessageSquareText}
              title="社区动态"
              action={() => setLocation("/community")}
            />
            <div className="mt-4 space-y-3">
              {posts?.length ? (
                posts.slice(0, 3).map(({ post, authorName }) => (
                  <button
                    key={post.id}
                    onClick={() => setLocation(`/community/${post.id}`)}
                    className="block w-full rounded-lg bg-gray-50 p-3 text-left hover:bg-emerald-50"
                  >
                    <p className="line-clamp-1 text-sm font-medium">
                      {post.title}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {authorName || "平台成员"} · {post.commentCount} 条讨论
                    </p>
                  </button>
                ))
              ) : (
                <Empty text="社区等待第一份实践" icon={MessageSquareText} />
              )}
            </div>
          </section>
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <Header
              icon={LayoutList}
              title="工作区快捷任务"
              action={() => setLocation("/me")}
            />
            <div className="mt-4 space-y-2">
              {personal?.workspace?.length ? (
                personal.workspace.slice(0, 4).map(item => (
                  <button
                    key={item.id}
                    onClick={() =>
                      setLocation(
                        item.destination.startsWith("/")
                          ? item.destination
                          : "/me"
                      )
                    }
                    className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-gray-50"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-orange-100 text-orange-600">
                      <Sparkles className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {item.title}
                      </span>
                      <span className="block truncate text-xs text-gray-500">
                        {item.description}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <Empty
                  text="添加你的第一个快捷任务"
                  icon={Clock3}
                  action={() => setLocation("/me")}
                  actionLabel="去添加"
                />
              )}
            </div>
          </section>
        </div>
      </main>
    </PlatformShell>
  );
}
function Header({
  icon: Icon,
  title,
  action,
}: {
  icon: typeof Newspaper;
  title: string;
  action: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gray-100 text-gray-600">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="font-semibold">{title}</h2>
      </div>
      <button onClick={action} className="text-xs font-medium text-gray-600">
        查看全部
      </button>
    </div>
  );
}
function Empty({
  text,
  icon: Icon,
  action,
  actionLabel,
}: {
  text: string;
  icon: typeof Clock3;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="grid min-h-28 place-items-center rounded-lg border border-dashed border-gray-200 text-center">
      <div>
        <Icon className="mx-auto h-4 w-4 text-gray-400" />
        <p className="mt-2 text-xs text-gray-500">{text}</p>
        {action && (
          <button
            type="button"
            onClick={action}
            className="mt-2 text-xs font-semibold text-indigo-600 hover:underline"
          >
            {actionLabel || "立即处理"}
          </button>
        )}
      </div>
    </div>
  );
}
