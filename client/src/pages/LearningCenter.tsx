// 学习中心：顶部学习统计 + 继续学习 + 等高路径卡片网格（分类筛选/搜索）。
import PlatformShell from "@/components/PlatformShell";
import PageSkeleton from "@/components/PageSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import {
  pathAccent,
  progressState,
  VIDEO_PLAYBACK_SPEEDS,
} from "@/lib/learnExperience";
import { cn } from "@/lib/utils";
import { workbenchRoutes } from "@/lib/routes";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  ChevronRight,
  Clock3,
  Flame,
  Loader2,
  PlayCircle,
  Search,
  Settings2,
  Timer,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

export default function LearningCenter() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: catalog, isLoading } = trpc.platform.catalog.useQuery();
  const { data: personal } = trpc.platform.personal.get.useQuery();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("全部");

  const progress = useMemo(
    () =>
      new Map(
        (personal?.progress ?? []).map(item => [item.courseId, item.progress])
      ),
    [personal?.progress]
  );
  const categories = useMemo(
    () => [
      "全部",
      ...Array.from(new Set((catalog?.paths ?? []).map(path => path.category))),
    ],
    [catalog?.paths]
  );
  const stats = personal?.learningStats ?? {
    weeklyMinutes: 0,
    streak: 0,
    activeDays: 0,
  };

  const visiblePaths = useMemo(
    () =>
      (catalog?.paths ?? []).filter(path => {
        const inCategory = category === "全部" || path.category === category;
        const haystack =
          `${path.title}${path.category}${path.tags.join(" ")}`.toLowerCase();
        return inCategory && haystack.includes(search.trim().toLowerCase());
      }),
    [catalog?.paths, category, search]
  );

  // 每条路径的完成度与“下一节”（首个未完成课程）。
  const pathStats = useMemo(
    () =>
      visiblePaths.map(path => {
        const courses = (catalog?.courses ?? []).filter(
          course => course.pathId === path.id
        );
        const avg = courses.length
          ? Math.round(
              courses.reduce(
                (sum, course) => sum + (progress.get(course.id) ?? 0),
                0
              ) / courses.length
            )
          : 0;
        const next =
          courses.find(course => (progress.get(course.id) ?? 0) < 100) ??
          courses[0];
        return { path, courses, avg, next };
      }),
    [visiblePaths, catalog?.courses, progress]
  );

  const continueTarget = pathStats.find(item => item.avg > 0 && item.avg < 100);
  const totalCompleted = (catalog?.courses ?? []).filter(
    course => progress.get(course.id) === 100
  ).length;

  if (isLoading || !catalog)
    return (
      <PlatformShell>
        <PageSkeleton cards={3} />
      </PlatformShell>
    );

  return (
    <PlatformShell>
      <main className="mx-auto max-w-[1400px] px-4 py-7 lg:px-7">
        {/* 页头 */}
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="section-kicker">LEARNING CENTER</p>
            <h1 className="mt-1 text-3xl font-semibold">
              把学习拆成可完成的任务。
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              选择路径、完成单节内容；观看与阅读进度会自动进入你的学习记录。
            </p>
          </div>
          <div className="flex w-full items-center gap-2 lg:w-auto">
            {user?.role === "admin" && (
              <Button
                variant="outline"
                onClick={() => setLocation("/operations/content")}
                className="hidden shrink-0 rounded-lg border-indigo-200 text-indigo-700 hover:bg-indigo-50 sm:flex"
              >
                <Settings2 className="mr-1.5 h-4 w-4" />
                内容运营
              </Button>
            )}
            <div className="relative flex-1 lg:w-80">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                placeholder="搜索路径、主题或标签"
              />
            </div>
          </div>
        </div>

        {/* 统计条 + 继续学习 */}
        <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_minmax(0,420px)]">
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <Flame className="h-5 w-5 text-orange-500" />
              <p className="mt-3 text-3xl font-bold tabular-nums">
                {stats.streak}
              </p>
              <p className="mt-1 text-xs text-gray-500">连续学习天数</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <Timer className="h-5 w-5 text-indigo-500" />
              <p className="mt-3 text-3xl font-bold tabular-nums">
                {stats.weeklyMinutes}
              </p>
              <p className="mt-1 text-xs text-gray-500">本周学习分钟</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <Check className="h-5 w-5 text-emerald-500" />
              <p className="mt-3 text-3xl font-bold tabular-nums">
                {totalCompleted}
              </p>
              <p className="mt-1 text-xs text-gray-500">已完成节数</p>
            </div>
          </div>
          {continueTarget ? (
            <button
              onClick={() =>
                setLocation(
                  workbenchRoutes.course(
                    continueTarget.path.id,
                    continueTarget.next.id
                  )
                )
              }
              className={cn(
                "group flex items-center gap-4 rounded-xl p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md",
                pathAccent(continueTarget.path.accent).gradient
              )}
            >
              <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", pathAccent(continueTarget.path.accent).icon)}>
                <PlayCircle className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold tracking-[.14em] text-gray-400">
                  继续学习 · {continueTarget.path.title}
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-gray-900">
                  {continueTarget.next.title}
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={cn("h-full rounded-full", pathAccent(continueTarget.path.accent).bar)}
                    style={{ width: `${continueTarget.avg}%` }}
                  />
                </div>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-gray-400 transition group-hover:translate-x-1" />
            </button>
          ) : (
            <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-100">
                <Check className="h-6 w-6 text-emerald-600" />
              </span>
              <div>
                <p className="text-sm font-semibold">暂无进行中的路径</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  从下方挑一条路径开始，进度会自动记录。
                </p>
              </div>
            </div>
          )}
        </section>

        {/* 分类筛选 */}
        <div className="mt-8 flex flex-wrap items-center gap-2">
          {categories.map(item => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              className={cn(
                "rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition",
                category === item
                  ? "border-gray-900 bg-gray-900 text-white shadow-sm"
                  : "border-gray-200 bg-white text-gray-600 hover:border-indigo-300 hover:text-indigo-700"
              )}
            >
              {item}
            </button>
          ))}
        </div>

        {/* 路径卡片网格：等高卡片，课程列表区固定高度滚动保证底边对齐 */}
        {pathStats.length === 0 ? (
          <div className="mt-6 grid place-items-center rounded-xl border border-dashed border-gray-300 bg-white/60 py-20 text-center">
            <BookOpenCheck className="h-8 w-8 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">
              没有匹配的学习路径，换个关键词试试。
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {pathStats.map(({ path, courses, avg, next }) => {
              const accent = pathAccent(path.accent);
              const state = progressState(avg);
              return (
                <article
                  key={path.id}
                  className="group flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-gray-300/60"
                >
                  <div
                    className={cn(
                      "p-5",
                      accent.gradient
                    )}
                  >
                    <div className="flex min-h-10 items-start justify-between">
                      <span className={cn("grid h-10 w-10 place-items-center rounded-xl", accent.icon)}>
                        <BookOpenCheck className="h-5 w-5" />
                      </span>
                      <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", accent.chip)}>
                        {path.category}
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        setLocation(workbenchRoutes.learningPath(path.id))
                      }
                      className="mt-4 line-clamp-1 text-left text-xl font-semibold text-gray-900 transition hover:opacity-75"
                    >
                      {path.title}
                    </button>
                    <p className="mt-2 line-clamp-2 min-h-12 text-sm leading-6 text-gray-500">
                      {path.description}
                    </p>
                    <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" />
                        {path.duration} · {courses.length} 节
                      </span>
                      <span className={cn("font-semibold", accent.text)}>{avg}% 已完成</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className={cn("h-full rounded-full transition-[width]", accent.bar)}
                        style={{ width: `${avg}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <div className="max-h-56 flex-1 space-y-0.5 overflow-y-auto pr-1">
                      {courses.map(course => {
                        const value = progress.get(course.id) ?? 0;
                        return (
                          <button
                            key={course.id}
                            onClick={() =>
                              setLocation(
                                workbenchRoutes.course(path.id, course.id)
                              )
                            }
                            className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition hover:bg-gray-50"
                          >
                            <span
                              className={cn(
                                "grid h-7 w-7 shrink-0 place-items-center rounded-full",
                                value === 100
                                  ? "bg-emerald-100 text-emerald-600"
                                  : value > 0
                                    ? "bg-indigo-100 text-indigo-700"
                                    : "bg-gray-100 text-gray-400"
                              )}
                            >
                              {value === 100 ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <PlayCircle className="h-3.5 w-3.5" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span
                                className={cn(
                                  "block truncate text-sm",
                                  value === 100
                                    ? "font-medium text-gray-400"
                                    : "font-medium text-gray-700"
                                )}
                              >
                                {course.title}
                              </span>
                              <span className="block text-xs text-gray-400">
                                {course.duration} ·{" "}
                                {course.resourceType === "video"
                                  ? "视频"
                                  : course.resourceType === "article"
                                    ? "文章"
                                    : course.resourceType === "exercise"
                                      ? "练习"
                                      : "模板"}
                                {value > 0 && value < 100 ? ` · ${value}%` : ""}
                              </span>
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition group-hover:text-indigo-400" />
                          </button>
                        );
                      })}
                      {courses.length === 0 && (
                        <p className="p-3 text-xs text-gray-400">
                          课程编排中，敬请期待。
                        </p>
                      )}
                    </div>
                    <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                      {next && avg < 100 ? (
                        <Button
                          onClick={() =>
                            setLocation(
                              workbenchRoutes.course(path.id, next.id)
                            )
                          }
                          className={cn("flex-1", accent.button)}
                        >
                          {avg === 0 ? "开始学习" : "继续学习"}
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        onClick={() =>
                          setLocation(workbenchRoutes.learningPath(path.id))
                        }
                        className={cn(
                          "rounded-lg",
                          next && avg < 100 ? "" : "flex-1"
                        )}
                      >
                        路径详情
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </PlatformShell>
  );
}
