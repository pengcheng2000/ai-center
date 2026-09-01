// 学习路径详情：路径概览 + 逐节任务列表（进度徽标、直达入口、前后课程导航）。
import PlatformShell from "@/components/PlatformShell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { pathAccent, progressState } from "@/lib/learnExperience";
import { cn } from "@/lib/utils";
import { workbenchRoutes } from "@/lib/routes";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowLeft, Check, ChevronRight, CirclePlay, Clock3, FileText, Highlighter, ListChecks, Settings2, Sparkles, Video } from "lucide-react";
import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";

export default function LearningPathDetail() {
  const [, params] = useRoute("/learn/:id");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const pathId = Number(params?.id);
  const { data: catalog, isLoading } = trpc.platform.catalog.useQuery();
  const { data: personal } = trpc.platform.personal.get.useQuery();
  const progress = useMemo(() => new Map((personal?.progress ?? []).map(item => [item.courseId, item.progress])), [personal?.progress]);

  if (isLoading || !catalog) return <PlatformShell><div className="grid min-h-[70vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-violet-600" /></div></PlatformShell>;
  const path = catalog.paths.find(item => item.id === pathId);
  if (!path) return <PlatformShell><main className="mx-auto max-w-4xl px-4 py-20"><h1 className="font-serif text-3xl">该学习路径暂不可用</h1><Button onClick={() => setLocation("/learn")} className="mt-6 rounded-lg">返回学习中心</Button></main></PlatformShell>;

  const courses = catalog.courses.filter(item => item.pathId === path.id);
  const completed = courses.filter(item => progress.get(item.id) === 100).length;
  const percent = courses.length ? Math.round(completed / courses.length * 100) : 0;
  const accent = pathAccent(path.accent);
  const nextCourse = courses.find(item => (progress.get(item.id) ?? 0) < 100);

  return <PlatformShell>
    <main className="mx-auto max-w-5xl px-4 py-8">
      <button onClick={() => setLocation("/learn")} className="flex items-center text-sm text-slate-500 transition hover:text-violet-700"><ArrowLeft className="mr-2 h-4 w-4" />返回学习中心</button>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className={cn("bg-gradient-to-br p-7 text-white md:p-10", accent.gradient)}>
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-start">
            <div>
              <p className="text-xs font-bold tracking-[.16em] text-white/80">LEARNING PATH / {path.category}</p>
              <h1 className="mt-3 font-serif text-4xl leading-tight">{path.title}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/90">{path.description}</p>
              <div className="mt-5 flex flex-wrap gap-2">{(path.tags as string[]).map(tag => <span key={tag} className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">{tag}</span>)}</div>
            </div>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/15 backdrop-blur"><Sparkles className="h-6 w-6" /></span>
          </div>
          <div className="mt-8 max-w-xl">
            <div className="flex justify-between text-xs text-white/85"><span>{completed}/{courses.length} 节已完成 · {path.duration}</span><span className="font-semibold">{percent}%</span></div>
            <Progress value={percent} className="mt-2 h-2 bg-black/25" />
            <div className="mt-4 flex flex-wrap gap-2">
              {nextCourse && <Button onClick={() => setLocation(workbenchRoutes.course(path.id, nextCourse.id))} className="rounded-lg bg-white text-violet-800 hover:bg-white/90">{percent === 0 ? "从第一节开始" : `继续：${nextCourse.title}`}<ChevronRight className="ml-1 h-4 w-4" /></Button>}
              {user?.role === "admin" && <Button onClick={() => setLocation("/operations/content")} variant="outline" className="rounded-lg border-white/40 bg-white/10 text-white hover:bg-white/20"><Settings2 className="mr-1.5 h-4 w-4" />维护路径与素材</Button>}
            </div>
          </div>
        </div>

        <div className="p-5 md:p-7">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">路径任务</h2>
            <p className="flex items-center gap-1.5 text-xs text-slate-500"><ListChecks className="h-3.5 w-3.5 text-violet-500" />观看、阅读与标注会自动更新进度</p>
          </div>
          <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {courses.map((course, index) => {
              const value = progress.get(course.id) ?? 0;
              const state = progressState(value);
              const Icon = course.resourceType === "video" ? Video : course.resourceType === "article" ? FileText : CirclePlay;
              return <div key={course.id} className="flex flex-col gap-3 p-4 transition hover:bg-slate-50/60 md:flex-row md:items-center md:gap-4">
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold", state.tone === "done" ? "bg-emerald-100 text-emerald-600" : state.tone === "active" ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500")}>{state.tone === "done" ? <Check className="h-4 w-4" /> : String(index + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setLocation(workbenchRoutes.course(path.id, course.id))} className="font-medium transition hover:text-violet-700 hover:underline">{course.title}</button>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", state.tone === "done" ? "bg-emerald-100 text-emerald-700" : state.tone === "active" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500")}>{state.label}</span>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Icon className="h-3.5 w-3.5" />{course.resourceType === "video" ? "视频（支持弹幕）" : course.resourceType === "article" ? "图文（支持进度记录）" : course.resourceType === "exercise" ? "AI 实操" : "模板"} · <Clock3 className="ml-1 h-3.5 w-3.5" />{course.duration}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{course.summary}</p>
                </div>
                <div className="flex shrink-0 gap-2 md:flex-col">
                  <Button onClick={() => setLocation(workbenchRoutes.course(path.id, course.id))} variant={state.tone === "active" ? "default" : "outline"} className="rounded-lg">{state.tone === "active" ? "继续学习" : state.tone === "done" ? "再看一遍" : "开始学习"}<ChevronRight className="ml-1 h-3.5 w-3.5" /></Button>
                </div>
              </div>;
            })}
            {courses.length === 0 && <div className="p-6 text-center text-sm text-slate-500">课程编排中，敬请期待。</div>}
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400"><Highlighter className="h-3.5 w-3.5" />进入课程后可对 PDF 原文圈选标注、发弹幕、评论交流。</p>
        </div>
      </section>
    </main>
  </PlatformShell>;
}

function Loader2({ className }: { className?: string }) { return <span className={cn("inline-block h-6 w-6 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600", className)} />; }
