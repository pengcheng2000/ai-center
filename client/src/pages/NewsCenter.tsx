import PlatformShell from "@/components/PlatformShell";
import PageSkeleton from "@/components/PageSkeleton";
import { trpc } from "@/lib/trpc";
import { sortNewsTimeline } from "../../../shared/newsSignals";
import {
  Bookmark,
  Clock3,
  Eye,
  FileText,
  Flame,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type SortMode = "latest" | "value";
const buckets = ["今日", "近 7 天", "近期", "历史"] as const;
const valueTone: Record<string, string> = {
  运营精选: "bg-blue-100 text-blue-700",
  全文解读: "bg-amber-100 text-amber-800",
  精选资讯: "bg-gray-100 text-gray-600",
};
function timelineTime(value: Date | string | null) {
  if (!value) return "时间待补充";
  const hours = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000)
  );
  if (hours < 1) return "刚刚";
  if (hours < 24) return `${hours} 小时前`;
  if (hours < 48) return "昨天";
  return new Date(value).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

export default function NewsCenter() {
  const [, setLocation] = useLocation();
  const [category, setCategory] = useState<string | undefined>();
  const [fullTextOnly, setFullTextOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [favoriteOverrides, setFavoriteOverrides] = useState<
    Map<number, boolean>
  >(new Map());
  const catalogInput = useMemo(
    () => (category || fullTextOnly ? { category, fullTextOnly } : undefined),
    [category, fullTextOnly]
  );
  const { data, isLoading } = trpc.platform.catalog.useQuery(catalogInput);
  const { data: personal } = trpc.platform.personal.get.useQuery();
  const utils = trpc.useUtils();
  const favorite = trpc.platform.personal.toggleFavorite.useMutation({
    onSuccess: (result, variables) => {
      setFavoriteOverrides(current =>
        new Map(current).set(variables.newsId, result.favorited)
      );
      void utils.platform.personal.get.invalidate();
      void utils.platform.catalog.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  if (isLoading || !data)
    return (
      <PlatformShell>
        <PageSkeleton cards={6} />
      </PlatformShell>
    );
  const saved = new Set((personal?.favorites ?? []).map(item => item.newsId));
  const visible = sortNewsTimeline(
    data.news
      .filter(({ item }) =>
        `${item.title}${item.summary}${item.tags.join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
      .map(row => ({
        ...row,
        publishedAt: row.item.publishedAt ?? row.item.createdAt,
        valueTier: row.item.valueTier,
        readCount: row.item.readCount,
        favoriteCount: row.item.favoriteCount,
      })),
    sortMode
  ).map(row => ({
    item: data.news.find(candidate => candidate.item.id === row.item.id)!.item,
    sourceName: row.sourceName,
  }));
  const todayCount = visible.filter(
    ({ item }) => item.freshness === "今日"
  ).length;
  const valueCount = visible.filter(
    ({ item }) => item.valueTier === "运营精选"
  ).length;
  const readers = visible.reduce((sum, row) => sum + row.item.readCount, 0);
  return (
    <PlatformShell>
      <main className="mx-auto max-w-[1400px] px-4 py-7 lg:px-7">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-semibold tracking-wide text-blue-600">AI 资讯</p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-gray-900 md:text-3xl">可信 AI 资讯中心</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              按时效、价值与企业聚合阅读信号组织的工作情报流；阅读和收藏均不展示个人身份。
            </p>
          </div>
          <div className="flex w-full items-center gap-3 lg:w-auto">
            <div className="relative flex-1 lg:w-72 lg:flex-none">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                placeholder="搜索资讯内容"
              />
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => setCategory(undefined)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${!category ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            全部
          </button>
          <button
            onClick={() => setFullTextOnly(value => !value)}
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${fullTextOnly ? "bg-amber-400 text-gray-950" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            <FileText className="h-3.5 w-3.5" />
            精选全文
          </button>
          {data.newsCategories.map(item => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${category === item ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {item}
            </button>
          ))}
        </div>
        {data.newsDigest && (
          <section className="mt-5 rounded-xl border border-blue-100 bg-blue-50/50 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex items-center gap-2 text-blue-600">
                  <Sparkles className="h-4 w-4" />
                  <p className="text-xs font-semibold tracking-wide">员工端定时摘要</p>
                </div>
                <h2 className="mt-2 text-lg font-semibold text-gray-900">
                  {data.newsDigest.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  {data.newsDigest.summary}
                </p>
                <p className="mt-2 text-xs text-gray-400">
                  {new Date(data.newsDigest.generatedAt).toLocaleString("zh-CN")} 生成 · 共 {data.newsDigest.itemCount} 条
                </p>
              </div>
              <div className="grid min-w-0 gap-2 lg:w-96">
                {data.newsDigest.items.slice(0, 3).map(({ item }) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setLocation(`/news/${item.id}`)}
                    className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-white px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:border-blue-200 hover:text-blue-600"
                  >
                    <span className="line-clamp-1">{item.title}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}
        <section className="mt-5 grid gap-3 md:grid-cols-3">
          <Pulse
            icon={Clock3}
            value={String(todayCount)}
            label="今日更新"
            note="优先处理新增动态"
          />
          <Pulse
            icon={Sparkles}
            value={String(valueCount)}
            label="运营精选"
            note="已沉淀的高价值内容"
          />
          <Pulse
            icon={Eye}
            value={String(readers)}
            label="聚合阅读"
            note="去重后的员工阅读人数"
          />
        </section>
        <section className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
          <div>
            <p className="font-semibold">资讯时间线</p>
            <p className="mt-1 text-sm text-gray-500">
              先看今日，再依运营精选和阅读信号安排深入阅读。
            </p>
          </div>
          <div className="flex rounded-xl bg-gray-100 p-1 text-sm">
            <button
              onClick={() => setSortMode("latest")}
              className={`rounded-lg px-3 py-1.5 ${sortMode === "latest" ? "bg-white font-semibold text-blue-600 shadow-sm" : "text-gray-500"}`}
            >
              最新优先
            </button>
            <button
              onClick={() => setSortMode("value")}
              className={`rounded-lg px-3 py-1.5 ${sortMode === "value" ? "bg-white font-semibold text-blue-600 shadow-sm" : "text-gray-500"}`}
            >
              价值优先
            </button>
          </div>
        </section>
        <div className="mt-6 space-y-10">
          {buckets.map(bucket => {
            const rows = visible.filter(
              ({ item }) => item.freshness === bucket
            );
            if (!rows.length) return null;
            return (
              <section key={bucket}>
                <div className="mb-4 flex items-center gap-3">
                  <span
                    className={`grid h-8 min-w-8 place-items-center rounded-full text-xs font-bold ${bucket === "今日" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}
                  >
                    {bucket === "今日" ? (
                      <Flame className="h-4 w-4" />
                    ) : (
                      rows.length
                    )}
                  </span>
                  <h2 className="text-2xl">{bucket}</h2>
                  <span className="text-sm text-gray-400">
                    {bucket === "今日"
                      ? "需要快速判断的新增信息"
                      : "可按业务价值安排阅读"}
                  </span>
                </div>
                <div className="grid gap-4 xl:grid-cols-3">
                  {rows.map(({ item, sourceName }) => {
                    const baseSaved = saved.has(item.id);
                    const isSaved = favoriteOverrides.get(item.id) ?? baseSaved;
                    const pending =
                      favorite.isPending &&
                      favorite.variables?.newsId === item.id;
                    const favoriteCount =
                      item.favoriteCount + Number(isSaved) - Number(baseSaved);
                    return (
                      <article
                        key={item.id}
                        className={`group flex min-h-72 flex-col rounded-xl border bg-white p-5 transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-blue-300 ${item.isNew ? "border-blue-200" : "border-gray-200"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600">
                              {item.category}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${valueTone[item.valueTier]}`}
                            >
                              {item.valueTier}
                            </span>
                            {item.isFullText && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                <FileText className="h-3 w-3" />
                                全文
                              </span>
                            )}
                          </div>
                          <button
                            disabled={pending}
                            aria-label={isSaved ? "取消收藏资讯" : "收藏资讯"}
                            aria-pressed={isSaved}
                            onClick={() => favorite.mutate({ newsId: item.id })}
                            className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg disabled:cursor-wait disabled:opacity-50 ${isSaved ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400"}`}
                          >
                            <Bookmark
                              className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`}
                            />
                          </button>
                        </div>
                        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-gray-400">
                          <Clock3 className="h-3.5 w-3.5" />
                          {timelineTime(item.publishedAt ?? item.createdAt)}
                          {item.isNew && (
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-600">
                              NEW
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setLocation(`/news/${item.id}`)}
                          className="mt-3 text-left focus-visible:outline-none"
                        >
                          <h3 className="text-lg font-semibold leading-7 transition-colors group-hover:text-blue-600">
                            {item.title}
                          </h3>
                          <p className="mt-3 line-clamp-3 text-sm leading-6 text-gray-500">
                            {item.summary}
                          </p>
                        </button>
                        <div className="mt-auto flex items-center justify-between gap-3 border-t border-gray-100 pt-4 text-xs text-gray-400">
                          <span>{sourceName || "平台运营"}</span>
                          <span className="flex items-center gap-3">
                            <span className="inline-flex items-center gap-1">
                              <Eye className="h-3.5 w-3.5" />
                              {item.readCount}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Bookmark className="h-3.5 w-3.5" />
                              {favoriteCount}
                            </span>
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setLocation(`/news/${item.id}`)}
                          className="mt-2 inline-flex w-fit items-center gap-1 px-0 text-sm font-medium text-blue-600 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                        >
                          进入阅读{" "}
                          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        {!visible.length && (
          <div className="mt-6 rounded-xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-500">
            当前筛选条件下没有可阅读的资讯。
          </div>
        )}
      </main>
    </PlatformShell>
  );
}
function Pulse({
  icon: Icon,
  value,
  label,
  note,
}: {
  icon: typeof Eye;
  value: string;
  label: string;
  note: string;
}) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50">
        <Icon className="h-4 w-4 text-blue-600" />
      </span>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs text-gray-400">{note}</p>
    </article>
  );
}
