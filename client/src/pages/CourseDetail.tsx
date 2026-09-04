// 课程学习页：左栏为学习内容（视频/PDF/文档/实操），右栏为学习导航（素材清单+进度+交流）。
// 素材进度自动上报并汇总为课程进度，全素材完成后自动标记课程完成。
import PlatformShell from "@/components/PlatformShell";
import PageSkeleton from "@/components/PageSkeleton";
import DiscussionPanel from "@/components/learn/DiscussionPanel";
import DocReader from "@/components/learn/DocReader";
import HtmlReader from "@/components/learn/HtmlReader";
import PdfReader, { type Annotation } from "@/components/learn/PdfReader";
import VideoPlayer from "@/components/learn/VideoPlayer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  clampPercent,
  formatClock,
  materialKindOf,
  MATERIAL_KIND_LABEL,
  progressState,
  resolveDocumentDisplay,
  videoPercent,
  VIDEO_PLAYBACK_SPEEDS,
} from "@/lib/learnExperience";
import { cn } from "@/lib/utils";
import { workbenchRoutes } from "@/lib/routes";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  Highlighter,
  ListChecks,
  Loader2,
  PlayCircle,
  Settings2,
  Sparkles,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { Streamdown } from "streamdown";
import { toast } from "sonner";

type Material = {
  id: number;
  materialType: "document" | "video" | "practice";
  sourceType: "url" | "file" | "inline";
  title: string;
  description: string | null;
  sourceUrl: string | null;
  signedUrl: string | null;
  mimeType: string | null;
  content: string | null;
  contentHtml?: string | null;
  contentFormat?: "html" | "markdown" | "plain" | null;
  provider?: string | null;
  canonicalUrl?: string | null;
  config: Record<string, unknown>;
  orderIndex: number;
};
type CommentRow = {
  comment: {
    id: number;
    materialId: number;
    content: string;
    videoSecond: number | null;
    isDanmaku: number;
    createdAt: Date;
  };
  authorName: string | null;
};
type ProgressRow = {
  id: number;
  userId: number;
  materialId: number;
  position: number;
  percent: number;
  minutes: number;
};

export default function CourseDetail() {
  const [, params] = useRoute("/learn/:pathId/course/:courseId");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const pathId = Number(params?.pathId);
  const courseId = Number(params?.courseId);
  const { data: catalog, isLoading } = trpc.platform.catalog.useQuery();
  const {
    data: experience,
    isLoading: experienceLoading,
    isError: experienceIsError,
    error: experienceError,
    refetch: refetchExperience,
  } = trpc.platform.learning.courseExperience.useQuery(
    { courseId },
    { enabled: Number.isInteger(courseId) && courseId > 0 }
  );
  const utils = trpc.useUtils();
  const [localProgress, setLocalProgress] = useState<Map<number, ProgressRow>>(
    new Map()
  );
  const saveProgress = trpc.platform.learning.saveMaterialProgress.useMutation({
    onSuccess: (result, variables) => {
      setShownCoursePercent(current =>
        Math.max(current ?? 0, result.coursePercent)
      );
      setLocalProgress(current => {
        const next = new Map(current);
        const previous = next.get(variables.materialId);
        next.set(variables.materialId, {
          id: previous?.id ?? 0,
          userId: previous?.userId ?? user?.id ?? 0,
          materialId: variables.materialId,
          position: Math.max(previous?.position ?? 0, variables.position),
          percent: Math.max(previous?.percent ?? 0, result.materialPercent),
          minutes: (previous?.minutes ?? 0) + (variables.minutesDelta ?? 0),
        });
        return next;
      });
      void utils.platform.personal.get.invalidate();
    },
  });
  const [activeId, setActiveId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number> | null>(null);
  const [shownCoursePercent, setShownCoursePercent] = useState<number | null>(
    null
  );
  const materialEnterRef = useRef<Map<number, number>>(new Map());
  // 学习分钟数按“距上次上报的增量”累计：视频用累计播放秒，PDF/文档用页面停留秒，避免重复累计。
  const minutesReportRef = useRef<Map<number, number>>(new Map());

  const materials = experience?.materials as Material[] | undefined;
  const comments = (experience?.comments ?? []) as CommentRow[];
  const [localComments, setLocalComments] = useState<CommentRow[]>([]);
  useEffect(() => {
    setLocalComments(comments);
  }, [experience?.comments]);
  const appendComment = useCallback(
    (comment: CommentRow) => setLocalComments(current => [...current, comment]),
    []
  );
  const materialProgress = (experience?.materialProgress ??
    []) as ProgressRow[];
  const annotations = (experience?.annotations ?? []) as Annotation[];

  const progressByMaterial = useMemo(() => {
    const merged = new Map(
      materialProgress.map(item => [item.materialId, item])
    );
    for (const [materialId, item] of localProgress) {
      const persisted = merged.get(materialId);
      if (!persisted || item.percent >= persisted.percent)
        merged.set(materialId, item);
    }
    return merged;
  }, [materialProgress, localProgress]);
  const activeMaterial = useMemo(() => {
    if (!materials?.length) return null;
    return (
      materials.find(item => item.id === activeId) ??
      materials.find(
        item => (progressByMaterial.get(item.id)?.percent ?? 0) < 100
      ) ??
      materials[0]
    );
  }, [materials, activeId, progressByMaterial]);

  // 进入素材时记录开始时间，用于换算学习分钟数。
  const beginMaterial = useCallback((materialId: number) => {
    if (!materialEnterRef.current.has(materialId))
      materialEnterRef.current.set(materialId, Date.now());
  }, []);

  // 默认只挂载当前（或首个未完成）素材，避免 PDF/视频等重组件同时初始化。
  const defaultMaterialId = activeMaterial?.id ?? null;
  const isExpanded = (materialId: number) =>
    expandedIds?.has(materialId) ?? materialId === defaultMaterialId;
  const selectMaterial = useCallback(
    (materialId: number) => {
      setActiveId(materialId);
      beginMaterial(materialId);
      setExpandedIds(new Set([materialId]));
      window.requestAnimationFrame(() =>
        document
          .querySelector(`[data-material="${materialId}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
    },
    [beginMaterial]
  );

  // 素材进度统一入口：position 视素材类型为秒数/页码/百分比；watchedSeconds 为本会话累计秒（缺省按页面停留时长）。
  const reportProgress = useCallback(
    (
      material: Material,
      payload: { position: number; percent?: number; watchedSeconds?: number }
    ) => {
      const enterAt = materialEnterRef.current.get(material.id) ?? Date.now();
      if (!materialEnterRef.current.has(material.id))
        materialEnterRef.current.set(material.id, enterAt);
      const elapsedSeconds =
        payload.watchedSeconds ?? Math.floor((Date.now() - enterAt) / 1000);
      const previous = minutesReportRef.current.get(material.id) ?? 0;
      const minutesDelta = Math.max(
        0,
        Math.floor(elapsedSeconds / 60) - Math.floor(previous / 60)
      );
      minutesReportRef.current.set(material.id, elapsedSeconds);
      const persisted = progressByMaterial.get(material.id);
      saveProgress.mutate({
        materialId: material.id,
        position: Math.max(persisted?.position ?? 0, payload.position),
        percent: Math.max(
          persisted?.percent ?? 0,
          clampPercent(payload.percent ?? 0)
        ),
        minutesDelta,
      });
    },
    [progressByMaterial, saveProgress]
  );

  if (isLoading || !catalog)
    return (
      <PlatformShell>
        <PageSkeleton cards={2} />
      </PlatformShell>
    );
  const path = catalog.paths.find(item => item.id === pathId);
  const course = catalog.courses.find(
    item => item.id === courseId && item.pathId === pathId
  );
  if (!path || !course)
    return (
      <PlatformShell>
        <main className="mx-auto max-w-3xl px-4 py-20">
          <h1 className="font-serif text-3xl">该课程暂不可用</h1>
          <Button
            onClick={() => setLocation(`/learn/${pathId}`)}
            className="mt-6 rounded-lg"
          >
            返回学习路径
          </Button>
        </main>
      </PlatformShell>
    );
  if (experienceLoading)
    return (
      <PlatformShell>
        <PageSkeleton cards={2} />
      </PlatformShell>
    );
  if (experienceIsError)
    return (
      <PlatformShell>
        <main className="mx-auto grid min-h-[65vh] max-w-xl place-items-center px-5 text-center">
          <div>
            <h1 className="font-serif text-3xl font-semibold">
              课程资源加载失败
            </h1>
            <p className="mt-4 text-sm leading-6 text-slate-500">
              {experienceError?.message || "学习内容暂时不可用，请稍后重试。"}
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Button
                variant="outline"
                onClick={() => void refetchExperience()}
              >
                重试
              </Button>
              <Button onClick={() => setLocation(`/learn/${pathId}`)}>
                返回学习路径
              </Button>
            </div>
          </div>
        </main>
      </PlatformShell>
    );

  const coursePercent =
    shownCoursePercent ?? experience?.courseProgressRow?.progress ?? 0;
  const courseState = progressState(coursePercent);
  const Icon =
    course.resourceType === "video"
      ? Video
      : course.resourceType === "article"
        ? FileText
        : PlayCircle;
  const pathCourses = catalog.courses.filter(item => item.pathId === pathId);
  const courseIndex = pathCourses.findIndex(item => item.id === courseId);
  const prevCourse = courseIndex > 0 ? pathCourses[courseIndex - 1] : null;
  const nextCourse =
    courseIndex >= 0 && courseIndex < pathCourses.length - 1
      ? pathCourses[courseIndex + 1]
      : null;

  return (
    <PlatformShell>
      <main className="mx-auto max-w-[1440px] px-4 py-7 lg:px-7">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <button
            onClick={() => setLocation("/learn")}
            className="hover:text-violet-700"
          >
            学习中心
          </button>
          <ChevronRight className="h-3.5 w-3.5" />
          <button
            onClick={() => setLocation(workbenchRoutes.learningPath(pathId))}
            className="max-w-64 truncate hover:text-violet-700"
          >
            {path.title}
          </button>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="max-w-72 truncate font-medium text-slate-800">
            {course.title}
          </span>
        </div>

        <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* 左栏：学习内容 */}
          <div className="min-w-0">
            <div className="rounded-2xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 p-6 text-white md:p-8">
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <p className="text-xs font-bold tracking-[.16em] text-violet-300">
                    COURSE / {path.category}
                  </p>
                  <h1 className="mt-2.5 font-serif text-3xl leading-tight md:text-4xl">
                    {course.title}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                    {course.summary}
                  </p>
                </div>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10">
                  <Icon className="h-6 w-6 text-violet-200" />
                </span>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <span className="flex items-center rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">
                  <Clock3 className="mr-1.5 h-3.5 w-3.5" />
                  {course.duration}
                </span>
                {(course.tags as string[]).slice(0, 4).map(tag => (
                  <Badge
                    key={tag}
                    className="bg-white/10 text-violet-100 hover:bg-white/10"
                  >
                    {tag}
                  </Badge>
                ))}
                <span
                  className={cn(
                    "ml-auto rounded-full px-3 py-1 text-xs font-semibold",
                    courseState.tone === "done"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : courseState.tone === "active"
                        ? "bg-violet-500/25 text-violet-200"
                        : "bg-white/10 text-slate-300"
                  )}
                >
                  {courseState.label}
                </span>
              </div>
            </div>

            {/* 无素材时的兜底 */}
            {!materials?.length &&
              (course.resourceUrl ? (
                <a
                  href={course.resourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-6 flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50 px-5 py-4 text-sm font-semibold text-violet-800 transition hover:bg-violet-100"
                >
                  <span>打开课程资源（资源负责人尚未挂载结构化素材）</span>
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : (
                <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-800">
                    本课程暂无可学习资源
                  </p>
                  <p className="mt-1">
                    内容运营尚未挂载 PDF、视频或文档素材，请稍后再来。
                  </p>
                </div>
              ))}

            {/* 素材内容 */}
            {materials?.map(material => {
              const kind = materialKindOf(material);
              const row = progressByMaterial.get(material.id);
              const state = progressState(row?.percent ?? 0);
              const isActive = activeMaterial?.id === material.id;
              const url = material.signedUrl || material.sourceUrl;
              return (
                <section
                  key={material.id}
                  data-material={material.id}
                  className={cn(
                    "mt-6 overflow-hidden rounded-2xl border bg-white shadow-sm",
                    isActive
                      ? "border-violet-300 ring-1 ring-violet-200"
                      : "border-slate-200"
                  )}
                >
                  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                    <button
                      type="button"
                      aria-expanded={isExpanded(material.id)}
                      aria-controls={`material-panel-${material.id}`}
                      onClick={() =>
                        setExpandedIds(current => {
                          const next = new Set(
                            current ??
                              (defaultMaterialId ? [defaultMaterialId] : [])
                          );
                          if (next.has(material.id)) next.delete(material.id);
                          else next.add(material.id);
                          return next;
                        })
                      }
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      <span aria-hidden="true" className="mt-1 text-slate-400">
                        {isExpanded(material.id) ? "▾" : "▸"}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {MATERIAL_KIND_LABEL[kind]}
                          </Badge>
                          <h2 className="truncate font-semibold">
                            {material.title}
                          </h2>
                          {state.tone === "done" && (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                          )}
                        </div>
                        {material.description && (
                          <p className="mt-1.5 text-sm text-slate-500">
                            {material.description}
                          </p>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-3">
                      {kind !== "practice" && (
                        <span className="w-24 shrink-0 text-right text-xs text-slate-500">
                          {state.label}
                        </span>
                      )}
                      {material.sourceUrl && (
                        <a
                          href={material.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-violet-700 hover:underline"
                        >
                          原始来源
                        </a>
                      )}
                    </div>
                  </header>

                  {isExpanded(material.id) && (
                    <div
                      id={`material-panel-${material.id}`}
                      role="region"
                      className="p-5"
                    >
                      {kind === "video" && url && (
                        <VideoPlayer
                          materialId={material.id}
                          src={url}
                          title={material.title}
                          comments={localComments.filter(
                            item => item.comment.materialId === material.id
                          )}
                          resumeSecond={
                            row?.position && row.percent < 100
                              ? row.position
                              : null
                          }
                          initialPercent={row?.percent ?? 0}
                          onProgress={payload =>
                            reportProgress(material, payload)
                          }
                          onCommentAdded={appendComment}
                        />
                      )}
                      {kind === "video" && !url && (
                        <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
                          视频文件正在维护。
                        </p>
                      )}
                      {kind === "pdf" && url && (
                        <PdfReader
                          materialId={material.id}
                          src={url}
                          annotations={annotations.filter(
                            item => item.materialId === material.id
                          )}
                          resumePage={
                            row?.position && row.percent < 100
                              ? row.position
                              : null
                          }
                          initialPercent={row?.percent ?? 0}
                          onProgress={payload =>
                            reportProgress(material, {
                              position: payload.page,
                              percent: clampPercent(
                                (payload.page / payload.totalPages) * 100
                              ),
                            })
                          }
                        />
                      )}
                      {kind === "document" &&
                        (() => {
                          const contentHtml =
                            material.contentHtml ||
                            (typeof material.config.contentHtml === "string"
                              ? material.config.contentHtml
                              : null);
                          const contentFormat =
                            material.contentFormat ||
                            (typeof material.config.contentFormat === "string"
                              ? material.config.contentFormat
                              : null);
                          const display = resolveDocumentDisplay({
                            content: material.content,
                            contentHtml,
                            contentFormat,
                            mimeType: material.mimeType,
                            url,
                          });
                          if (display === "html" && contentHtml)
                            return (
                              <HtmlReader
                                html={contentHtml}
                                title={material.title}
                                sourceUrl={
                                  material.canonicalUrl || material.sourceUrl
                                }
                                initialPercent={row?.percent ?? 0}
                                onProgress={percent =>
                                  reportProgress(material, {
                                    position: 0,
                                    percent,
                                  })
                                }
                              />
                            );
                          if (display === "markdown")
                            return (
                              <DocReader
                                content={material.content || ""}
                                title={material.title}
                                initialPercent={row?.percent ?? 0}
                                onProgress={percent =>
                                  reportProgress(material, {
                                    position: 0,
                                    percent,
                                  })
                                }
                              />
                            );
                          if (display === "image" && url)
                            return (
                              <img
                                className="max-h-[620px] w-full rounded-xl border border-slate-200 object-contain"
                                src={url}
                                alt={material.title}
                              />
                            );
                          if (display === "link" && url)
                            return (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center justify-between rounded-xl bg-violet-50 px-4 py-3 text-sm font-medium text-violet-800"
                              >
                                打开或下载文档{" "}
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            );
                          return (
                            <p className="rounded-xl bg-slate-50 p-5 text-sm text-amber-700">
                              文档内容正在维护。
                            </p>
                          );
                        })()}
                      {kind === "practice" && (
                        <PracticePanel
                          material={material}
                          runs={(experience?.runs ?? []).filter(
                            item => item.materialId === material.id
                          )}
                          onCompleted={() =>
                            reportProgress(material, {
                              position: 1,
                              percent: 100,
                            })
                          }
                        />
                      )}
                    </div>
                  )}
                </section>
              );
            })}

            {/* 课程讨论区（挂在课程级，素材为空也可交流） */}
            <div className="mt-6">
              {materials?.length ? (
                <DiscussionPanel
                  materialId={activeMaterial?.id ?? materials[0].id}
                  comments={localComments}
                  placeholder="关于这门课的任何问题、心得或补充材料"
                />
              ) : null}
            </div>

            {/* 上一课/下一课 */}
            <div className="mt-6 flex items-center justify-between gap-3">
              {prevCourse ? (
                <Button
                  variant="outline"
                  onClick={() =>
                    setLocation(workbenchRoutes.course(pathId, prevCourse.id))
                  }
                  className="rounded-lg"
                >
                  <ChevronLeft className="mr-1.5 h-4 w-4" />
                  {prevCourse.title}
                </Button>
              ) : (
                <span />
              )}
              {nextCourse ? (
                <Button
                  onClick={() =>
                    setLocation(workbenchRoutes.course(pathId, nextCourse.id))
                  }
                  className="rounded-lg bg-violet-600 hover:bg-violet-500"
                >
                  {nextCourse.title}
                  <ChevronRight className="ml-1.5 h-4 w-4" />
                </Button>
              ) : courseState.tone === "done" ? (
                <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  本路径已全部完成 🎉
                </span>
              ) : null}
            </div>
          </div>

          {/* 右栏：学习导航 */}
          <aside className="xl:sticky xl:top-24 xl:self-start">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <ListChecks className="h-4 w-4 text-violet-600" />
                学习进度
              </p>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>课程整体完成度</span>
                <span className="font-semibold text-violet-700">
                  {coursePercent}%
                </span>
              </div>
              <Progress value={coursePercent} className="mt-2 h-2" />
              <p className="mt-2 text-[11px] leading-4 text-slate-400">
                进度随视频观看、PDF
                翻页与文档阅读自动累计，全部素材完成后自动结课。
              </p>
              {saveProgress.isError && (
                <p className="mt-2 rounded bg-rose-50 p-2 text-[11px] text-rose-600">
                  进度保存失败：{saveProgress.error.message}
                </p>
              )}

              <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-4">
                {materials?.map((material, index) => {
                  const kind = materialKindOf(material);
                  const row = progressByMaterial.get(material.id);
                  const state = progressState(row?.percent ?? 0);
                  const isActive = activeMaterial?.id === material.id;
                  return (
                    <button
                      key={material.id}
                      onClick={() => selectMaterial(material.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left transition",
                        isActive
                          ? "border-violet-300 bg-violet-50/70"
                          : "border-transparent hover:bg-slate-50"
                      )}
                      aria-current={isActive ? "step" : undefined}
                    >
                      <span
                        className={cn(
                          "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                          state.tone === "done"
                            ? "bg-emerald-100 text-emerald-600"
                            : isActive
                              ? "bg-violet-600 text-white"
                              : "bg-slate-100 text-slate-500"
                        )}
                      >
                        {state.tone === "done" ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-slate-800">
                          {material.title}
                        </span>
                        <span className="block text-[10px] text-slate-400">
                          {MATERIAL_KIND_LABEL[kind]} · {state.label}
                        </span>
                      </span>
                      <span className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-slate-100">
                        <span
                          className={cn(
                            "block h-full",
                            state.tone === "done"
                              ? "bg-emerald-500"
                              : "bg-violet-500"
                          )}
                          style={{ width: `${row?.percent ?? 0}%` }}
                        />
                      </span>
                    </button>
                  );
                })}
                {!materials?.length && (
                  <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                    本课暂无结构化素材。
                  </p>
                )}
              </div>

              {annotations.length > 0 && (
                <p className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                  <Highlighter className="h-3.5 w-3.5 text-violet-500" />
                  已有 {annotations.length} 条 PDF 标注
                </p>
              )}
            </div>

            {/* 同路径其他课程 */}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold">路径其他内容</p>
              <div className="mt-3 space-y-1">
                {pathCourses
                  .filter(item => item.id !== courseId)
                  .slice(0, 6)
                  .map(item => (
                    <button
                      key={item.id}
                      onClick={() =>
                        setLocation(workbenchRoutes.course(pathId, item.id))
                      }
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-slate-600 transition hover:bg-slate-50 hover:text-violet-700"
                    >
                      <PlayCircle className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                      <span className="truncate">{item.title}</span>
                    </button>
                  ))}
              </div>
            </div>
            {/* 内容运营入口（仅管理员）：课程信息与素材（视频/PDF/文档）都在运营台账维护 */}
            {user?.role === "admin" && (
              <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-violet-800">
                  <Settings2 className="h-4 w-4" />
                  内容运营
                </p>
                <p className="mt-1.5 text-xs leading-5 text-violet-700/80">
                  编辑课程信息、上传视频（MP4/WebM）、PDF
                  与文档素材，都在「内容运营台账」完成。
                </p>
                <Button
                  onClick={() => setLocation("/operations/content")}
                  variant="outline"
                  className="mt-3 w-full rounded-lg border-violet-300 bg-white text-violet-700 hover:bg-violet-100"
                >
                  去维护这门课的素材
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </aside>
        </div>
      </main>
    </PlatformShell>
  );
}

// 受控模型实操台（沿用原有能力，样式对齐新页面）。
function PracticePanel({
  material,
  runs,
  onCompleted,
}: {
  material: Material;
  runs: Array<{
    id: number;
    prompt: string;
    output: string;
    modelId: string;
    createdAt: Date;
  }>;
  onCompleted: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const run = trpc.platform.learning.runPractice.useMutation({
    onSuccess: result => {
      setOutput(result.output);
      onCompleted();
    },
    onError: error => toast.error(error.message),
  });
  return (
    <div className="rounded-xl bg-slate-950 p-5 text-white">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-300" />
        <p className="text-sm font-semibold">受控模型实操台</p>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-300">
        仅运行课程定义的 AI 任务，不执行代码、浏览器或外部系统操作；每天最多 5
        次，结果仅归属当前学习者。
      </p>
      <Textarea
        value={prompt}
        onChange={event => setPrompt(event.target.value)}
        className="mt-4 border-white/20 bg-white/10 text-white placeholder:text-slate-400"
        placeholder="输入你的业务素材或任务描述"
      />
      <Button
        disabled={prompt.trim().length < 2 || run.isPending}
        onClick={() =>
          run.mutate({ materialId: material.id, prompt: prompt.trim() })
        }
        className="mt-3 bg-violet-500 hover:bg-violet-400"
      >
        {run.isPending ? "正在运行" : "运行并获取结果"}
      </Button>
      {output && (
        <div className="prose prose-invert mt-5 max-w-none rounded-xl bg-white/10 p-4">
          <Streamdown>{output}</Streamdown>
        </div>
      )}
      {runs.length > 0 && (
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="text-xs font-semibold text-slate-300">我的最近运行</p>
          {runs.slice(0, 3).map(item => (
            <p
              key={item.id}
              className="mt-2 line-clamp-2 text-xs text-slate-400"
            >
              {item.modelId} · {item.prompt}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
