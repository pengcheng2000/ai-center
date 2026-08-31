import { useAuth } from "@/_core/hooks/useAuth";
import PlatformShell from "@/components/PlatformShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startLogin } from "@/const";
import { skillVisual } from "@/lib/skillVisual";
import { trpc } from "@/lib/trpc";
import { BookOpenCheck, Loader2, LockKeyhole, Plus, Puzzle, Search, Star } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

type SortMode = "recent" | "rating";

export default function SkillsHub() {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const [sort, setSort] = useState<SortMode>("recent");
  const { data: categories } = trpc.platform.skills.categories.useQuery(undefined, { enabled: isAuthenticated });
  const { data, isLoading } = trpc.platform.skills.list.useQuery({ keyword: keyword || undefined, category, sort }, { enabled: isAuthenticated });
  const { data: mySubmissions } = trpc.platform.skills.mySubmissions.useQuery(undefined, { enabled: isAuthenticated });

  if (loading || (isAuthenticated && isLoading))
    return <PlatformShell><div className="grid min-h-[65vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-violet-600" /></div></PlatformShell>;

  if (!isAuthenticated)
    return (
      <PlatformShell>
        <main className="mx-auto grid min-h-[66vh] max-w-xl place-items-center px-5 text-center">
          <div>
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-50 text-violet-700"><LockKeyhole className="h-6 w-6" /></span>
            <h1 className="mt-5 font-serif text-3xl font-semibold">登录后进入企业 Skills 广场</h1>
            <p className="mt-3 leading-7 text-slate-500">浏览经运营审核的可复用 Skills，分享工作方法，并安全获取当前会话的下载指令。</p>
            <Button onClick={() => startLogin()} className="mt-6 rounded-full">登录后查看 Skills</Button>
          </div>
        </main>
      </PlatformShell>
    );

  return (
    <PlatformShell>
      <main className="mx-auto max-w-[1500px] px-5 py-9 lg:px-10">
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-7 text-white shadow-sm">
          <div className="hero-orb -top-24 right-8 h-60 w-60 bg-violet-600/30" />
          <div className="hero-orb -bottom-28 left-1/3 h-56 w-56 bg-indigo-500/20" />
          <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-bold tracking-[.18em] text-violet-300">SKILLS MARKETPLACE</p>
              <h1 className="mt-2 font-serif text-4xl font-semibold">企业 Skills 广场</h1>
              <p className="mt-3 max-w-2xl leading-7 text-slate-300">把有效的 Agent 工作方法、领域知识和标准流程沉淀为可审阅、可复用的 Skills。</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-violet-100"><Puzzle className="h-4 w-4" />{data?.length ?? 0} 个已上架</span>
              <Button onClick={() => setLocation("/skills/submit")} className="rounded-full bg-white text-slate-900 hover:bg-violet-50"><Plus className="mr-2 h-4 w-4" />分享 Skills</Button>
            </div>
          </div>
        </section>

        {mySubmissions?.length ? (
          <section className="mt-6 rounded-2xl border border-violet-100 bg-violet-50/60 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-violet-950">我的投稿</p>
                <p className="mt-1 text-sm text-violet-800">可查看自己待审核、已上架或被退回的 Skills。</p>
              </div>
              <Badge className="bg-white text-violet-700">{mySubmissions.length} 项</Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {mySubmissions.slice(0, 3).map(skill => (
                <button key={skill.id} onClick={() => setLocation(`/skills/${skill.id}`)} className="rounded-xl bg-white p-4 text-left shadow-sm transition hover:ring-1 hover:ring-violet-200">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium">{skill.name}</p>
                    <SubmissionStatus status={skill.reviewStatus} />
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-slate-500">{skill.skillKey} · {skill.version}</p>
                  {skill.reviewNote && <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">审核说明：{skill.reviewNote}</p>}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input value={keyword} onChange={event => setKeyword(event.target.value)} className="pl-9" placeholder="搜索名称、标识、说明或标签" />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-500">
              <span>排序</span>
              <select value={sort} onChange={event => setSort(event.target.value as SortMode)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-violet-200">
                <option value="recent">最新上架</option>
                <option value="rating">评分优先</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => setCategory(undefined)} size="sm" variant={!category ? "default" : "outline"} className="rounded-full">全部类型</Button>
            {categories?.map(item => (
              <Button key={item.category} onClick={() => setCategory(item.category)} size="sm" variant={category === item.category ? "default" : "outline"} className="rounded-full">{item.category}</Button>
            ))}
          </div>
        </section>

        <p className="mt-4 text-sm text-slate-500">找到 {data?.length ?? 0} 个已上架 Skills{keyword ? ` · “${keyword}”` : ""}{category ? ` · ${category}` : ""}</p>
        <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {data?.map(({ skill, authorName, averageRating, reviewCount }) => (
            <SkillCard key={skill.id} skill={skill} authorName={authorName} averageRating={averageRating} reviewCount={reviewCount} onOpen={() => setLocation(`/skills/${skill.id}`)} />
          ))}
          {!data?.length && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <BookOpenCheck className="mx-auto h-6 w-6 text-violet-600" />
              <h2 className="mt-3 font-semibold">尚无匹配的已上架 Skills</h2>
              <p className="mt-2 text-sm text-slate-500">尝试更换关键词或分类；也可以分享第一个 Skills，提交后会进入运营审核。</p>
            </div>
          )}
        </section>
      </main>
    </PlatformShell>
  );
}

/** 等高卡片：定高的图标行 / 单行标题 / 固定 3 行摘要 / 固定 24px 标签行 + mt-auto 钉底，内容多少都不影响同行卡片对齐 */
function SkillCard({ skill, authorName, averageRating, reviewCount, onOpen }: {
  skill: { name: string; skillKey: string; version: string; summary: string; category: string; tags: string[] };
  authorName: string | null;
  averageRating: number;
  reviewCount: number;
  onOpen: () => void;
}) {
  const { Icon, hue } = skillVisual(skill.skillKey);
  const rating = Number(averageRating);
  const author = authorName || "企业成员";
  const tags = skill.tags.slice(0, 3);
  const overflow = skill.tags.length - tags.length;
  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`查看 ${skill.name} 详情`}
      onClick={onOpen}
      onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } }}
      className="group flex h-full cursor-pointer flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-105 ${hue}`}>
          <Icon className="h-5 w-5" />
        </span>
        <Badge variant="secondary" className="max-w-[60%]"><span className="truncate">{skill.category}</span></Badge>
      </div>
      <h2 className="mt-4 truncate text-base font-bold text-slate-900" title={skill.name}>{skill.name}</h2>
      <p className="mt-1 truncate font-mono text-xs text-violet-600" title={`${skill.skillKey} · ${skill.version}`}>
        {skill.skillKey}<span className="mx-1 text-slate-300">·</span><span className="text-slate-400">{skill.version}</span>
      </p>
      <p className="mt-3 line-clamp-3 min-h-[72px] text-sm leading-6 text-slate-500">{skill.summary}</p>
      <div className="mt-auto pt-4">
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3.5">
          <span className="flex items-center gap-1 text-sm font-semibold text-amber-500">
            <Star className="h-4 w-4 fill-current" />
            {rating ? rating.toFixed(1) : <span className="text-xs font-normal text-slate-400">暂无评分</span>}
            {reviewCount > 0 && <span className="text-xs font-normal text-slate-400">· {reviewCount} 条体验</span>}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-400">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">{author[0]}</span>
            <span className="truncate">{author}</span>
          </span>
        </div>
        <div className="mt-3 flex h-6 items-center gap-1.5 overflow-hidden">
          {tags.map(tag => <span key={tag} className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{tag}</span>)}
          {overflow > 0 && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400">+{overflow}</span>}
        </div>
      </div>
    </article>
  );
}

function SubmissionStatus({ status }: { status: string }) {
  const map: Record<string, string> = { pending: "bg-amber-100 text-amber-700", approved: "bg-emerald-100 text-emerald-700", rejected: "bg-rose-100 text-rose-700", archived: "bg-slate-200 text-slate-700" };
  const labels: Record<string, string> = { pending: "待审核", approved: "已上架", rejected: "已退回", archived: "已下架" };
  return <Badge className={map[status] || map.pending}>{labels[status] || "待审核"}</Badge>;
}
