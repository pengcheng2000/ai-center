import { useAuth } from "@/_core/hooks/useAuth";
import { ReasonActionDialog } from "@/components/ConfirmActionDialog";
import PlatformShell from "@/components/PlatformShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  ArchiveRestore,
  ArrowLeft,
  Loader2,
  RadioTower,
  Search,
  ServerCog,
  Tags,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useState } from "react";

type Review = "current" | "due" | "overdue";
type NewsAdminStatus =
  | "all"
  | "pending"
  | "approved"
  | "needs_review"
  | "rejected"
  | "deleted";
type LifecycleItem = {
  id: number;
  name: string;
  meta: string;
  active: boolean;
  reviewStatus: Review;
  onToggle: () => void;
  onReview: (status: Review) => void;
};
const reviewText: Record<Review, string> = {
  current: "复审正常",
  due: "需要复审",
  overdue: "复审逾期",
};
const reviewTone: Record<Review, string> = {
  current: "bg-emerald-50 text-emerald-700",
  due: "bg-amber-50 text-amber-700",
  overdue: "bg-rose-50 text-rose-700",
};
const newsStatusTabs: Array<{ value: NewsAdminStatus; label: string }> = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "needs_review", label: "需人工复核" },
  { value: "rejected", label: "已拒绝" },
  { value: "deleted", label: "已删除" },
];
const newsStatusText: Record<string, string> = {
  draft: "草稿",
  pending: "待审核",
  approved: "已通过",
  needs_review: "需人工复核",
  rejected: "已拒绝",
};
const newsStatusTone: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  approved: "bg-emerald-50 text-emerald-700",
  needs_review: "bg-amber-50 text-amber-700",
  rejected: "bg-rose-50 text-rose-700",
  draft: "bg-slate-100 text-slate-500",
};

export default function ResourceLifecycleCenter() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const allowed = user?.role === "admin";
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.platform.operations.get.useQuery(undefined, {
    enabled: allowed,
  });
  const [newsStatus, setNewsStatus] = useState<NewsAdminStatus>("all");
  const [newsSearch, setNewsSearch] = useState("");
  const [newsSourceId, setNewsSourceId] = useState<number | undefined>(
    undefined
  );
  const [selectedNews, setSelectedNews] = useState<Set<number>>(new Set());
  const adminNews = trpc.platform.operations.newsAdmin.useQuery(
    {
      status: newsStatus,
      search: newsSearch.trim() || undefined,
      sourceId: newsSourceId,
      limit: 60,
    },
    { enabled: allowed }
  );
  const refresh = () => {
    utils.platform.operations.get.invalidate();
    utils.platform.operations.newsAdmin.invalidate();
  };
  const source = trpc.platform.operations.toggleSource.useMutation({
    onSuccess: refresh,
  });
  const provider = trpc.platform.operations.toggleProvider.useMutation({
    onSuccess: refresh,
  });
  const topic = trpc.platform.operations.updateTopic.useMutation({
    onSuccess: refresh,
  });
  const review = trpc.platform.operations.setResourceReviewStatus.useMutation({
    onSuccess: refresh,
  });
  const deleteNews = trpc.platform.operations.deleteNews.useMutation({
    onSuccess: () => {
      toast.success("资讯已软删除，并已写入人工处置记录");
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const restoreNews = trpc.platform.operations.restoreNews.useMutation({
    onSuccess: () => {
      toast.success("资讯已恢复至人工复核队列");
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const batchDeleteNews = trpc.platform.operations.batchDeleteNews.useMutation({
    onSuccess: result => {
      toast.success(`已批量软删除 ${result.deleted} 条资讯，审计记录已写入`);
      setSelectedNews(new Set());
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const updateNewsFilter = (apply: () => void) => {
    apply();
    setSelectedNews(new Set());
  };
  const toggleNewsSelected = (id: number) =>
    setSelectedNews(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const visibleNews = adminNews.data ?? [];
  const selectableIds = visibleNews
    .filter(item => !item.isDeleted)
    .map(item => item.id);
  const allSelected =
    selectableIds.length > 0 && selectableIds.every(id => selectedNews.has(id));
  const toggleSelectAll = () =>
    setSelectedNews(allSelected ? new Set() : new Set(selectableIds));
  if (loading || (allowed && isLoading))
    return (
      <PlatformShell>
        <div className="grid min-h-[65vh] place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
        </div>
      </PlatformShell>
    );
  if (!allowed || !data)
    return (
      <PlatformShell>
        <main className="grid min-h-[65vh] place-items-center text-center">
          <div>
            <h1 className="font-serif text-3xl font-semibold">
              仅运营管理员可访问
            </h1>
            <Button onClick={() => setLocation("/")} className="mt-6">
              返回工作台
            </Button>
          </div>
        </main>
      </PlatformShell>
    );
  return (
    <PlatformShell>
      <main className="mx-auto max-w-[1300px] px-5 py-8 lg:px-10">
        <button
          onClick={() => setLocation("/operations")}
          className="flex items-center text-sm text-slate-500 hover:text-violet-700"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回运营管理
        </button>
        <div className="mt-6">
          <p className="section-kicker">
            RESOURCE LIFECYCLE / ARCHIVE & REVIEW
          </p>
          <h1 className="mt-2 font-serif text-4xl font-semibold">
            资源生命周期管理
          </h1>
          <p className="mt-3 max-w-3xl text-slate-500">
            归档会停止资源进入业务流，但保留配置、历史记录与追溯关系；复审状态独立标记资源质量与责任节奏，避免“仍启用但已失效”。
          </p>
        </div>
        <div className="mt-7 grid gap-6 lg:grid-cols-3">
          <Lifecycle
            title="资讯源"
            icon={RadioTower}
            note="归档后不再进入资讯处理与审核队列。"
            items={data.sources.map(item => ({
              id: item.id,
              name: item.name,
              meta: `${item.sourceType.toUpperCase()} · ${item.category}`,
              active: Boolean(item.isEnabled),
              reviewStatus: item.reviewStatus,
              onToggle: () =>
                source.mutate({ id: item.id, isEnabled: !item.isEnabled }),
              onReview: status =>
                review.mutate({
                  resourceType: "source",
                  id: item.id,
                  reviewStatus: status,
                }),
            }))}
          />
          <Lifecycle
            title="模型供应商"
            icon={ServerCog}
            note="归档后不再作为路由策略候选，密钥别名与调用历史仍可追溯。"
            items={data.providers.map(item => ({
              id: item.id,
              name: item.name,
              meta: `${item.providerType} · ${item.healthStatus}`,
              active: Boolean(item.isEnabled),
              reviewStatus: item.reviewStatus,
              onToggle: () =>
                provider.mutate({ id: item.id, isEnabled: !item.isEnabled }),
              onReview: status =>
                review.mutate({
                  resourceType: "provider",
                  id: item.id,
                  reviewStatus: status,
                }),
            }))}
          />
          <Lifecycle
            title="社区主题"
            icon={Tags}
            note="归档后不再对员工开放关注和新内容聚合，已有实践标签与历史不删除。"
            items={data.topics.map(item => ({
              id: item.id,
              name: item.name,
              meta: item.description,
              active: Boolean(item.isEnabled),
              reviewStatus: item.reviewStatus,
              onToggle: () =>
                topic.mutate({
                  id: item.id,
                  name: item.name,
                  description: item.description,
                  color: item.color,
                  isEnabled: !item.isEnabled,
                  reviewStatus: item.reviewStatus,
                  isFeatured: Boolean(item.isFeatured),
                }),
              onReview: status =>
                review.mutate({
                  resourceType: "topic",
                  id: item.id,
                  reviewStatus: status,
                }),
            }))}
          />
        </div>
        <section className="mt-7 rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="font-serif text-xl font-semibold">资讯内容维护</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                全量资讯检索与管理：按状态/来源筛选，按标题、摘要或来源名称搜索；支持多选批量删除。删除采用软删除并写入审计记录，恢复后进入人工复核。
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative w-full sm:w-60">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={newsSearch}
                  onChange={event =>
                    updateNewsFilter(() => setNewsSearch(event.target.value))
                  }
                  placeholder="搜索标题 / 摘要 / 来源"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-violet-400"
                />
              </div>
              <select
                value={newsSourceId ?? ""}
                onChange={event =>
                  updateNewsFilter(() =>
                    setNewsSourceId(
                      event.target.value
                        ? Number(event.target.value)
                        : undefined
                    )
                  )
                }
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm"
              >
                <option value="">全部来源</option>
                {data.sources.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {newsStatusTabs.map(tab => (
              <button
                key={tab.value}
                onClick={() => updateNewsFilter(() => setNewsStatus(tab.value))}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${newsStatus === tab.value ? "bg-violet-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {selectedNews.size > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
              <span className="text-sm font-semibold text-rose-800">
                已选 {selectedNews.size} 条
              </span>
              <ReasonActionDialog
                title={`批量删除 ${selectedNews.size} 条资讯`}
                description="所选资讯会从员工端隐藏，记录仍会保留以便审计与恢复。"
                minLength={4}
                pending={batchDeleteNews.isPending}
                onConfirm={reason =>
                  batchDeleteNews.mutate({
                    newsIds: [...selectedNews],
                    reason: reason!,
                  })
                }
                trigger={
                  <Button
                    disabled={batchDeleteNews.isPending}
                    size="sm"
                    className="bg-rose-600 text-white hover:bg-rose-700"
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    批量删除
                  </Button>
                }
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedNews(new Set())}
              >
                取消选择
              </Button>
              <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 accent-violet-600"
                />
                全选本页可删除项
              </label>
            </div>
          )}
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {visibleNews.map(item => (
              <article key={item.id} className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  {!item.isDeleted && (
                    <input
                      type="checkbox"
                      aria-label="选择该资讯"
                      checked={selectedNews.has(item.id)}
                      onChange={() => toggleNewsSelected(item.id)}
                      className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-violet-600"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium line-clamp-2">{item.title}</p>
                    <p className="mt-1.5 text-xs text-slate-500">
                      {item.sourceName || "平台运营"} · {item.category}
                      {item.publishedAt
                        ? ` · ${new Date(item.publishedAt).toLocaleDateString("zh-CN")}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${newsStatusTone[item.reviewStatus] ?? "bg-slate-100 text-slate-600"}`}
                  >
                    {item.isDeleted
                      ? "已删除"
                      : (newsStatusText[item.reviewStatus] ??
                        item.reviewStatus)}
                  </span>
                </div>
                {item.isDeleted && item.deletionReason && (
                  <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
                    删除原因：{item.deletionReason}
                  </p>
                )}
                {item.isDeleted ? (
                  <ReasonActionDialog
                    title={`恢复「${item.title}」`}
                    description="恢复后资讯会进入人工复核队列，原因会写入审计记录。"
                    defaultReason="内容已修正，恢复后重新复核"
                    minLength={4}
                    confirmLabel="恢复并复核"
                    actionTone="positive"
                    pending={restoreNews.isPending}
                    onConfirm={reason =>
                      restoreNews.mutate({ newsId: item.id, reason: reason! })
                    }
                    trigger={
                      <Button
                        disabled={restoreNews.isPending}
                        size="sm"
                        variant="outline"
                        className="mt-3 border-emerald-200 text-emerald-700"
                      >
                        <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />
                        恢复并复核
                      </Button>
                    }
                  />
                ) : (
                  <ReasonActionDialog
                    title={`删除「${item.title}」`}
                    description="资讯会从员工端隐藏，删除原因会写入审计记录。"
                    minLength={4}
                    pending={deleteNews.isPending}
                    onConfirm={reason =>
                      deleteNews.mutate({ newsId: item.id, reason: reason! })
                    }
                    trigger={
                      <Button
                        disabled={deleteNews.isPending}
                        size="sm"
                        variant="outline"
                        className="mt-3 border-rose-200 text-rose-700"
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        删除
                      </Button>
                    }
                  />
                )}
              </article>
            ))}
          </div>
          {adminNews.isLoading && (
            <p className="mt-5 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中…
            </p>
          )}
          {!adminNews.isLoading && !visibleNews.length && (
            <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              当前筛选条件下没有资讯
              {newsSearch.trim() || newsStatus !== "all" || newsSourceId
                ? "，可调整筛选条件"
                : ""}
              。
            </p>
          )}
          {visibleNews.length >= 60 && (
            <p className="mt-3 text-xs text-slate-400">
              已达单次加载上限 60 条，可用筛选或搜索缩小范围。
            </p>
          )}
        </section>
        <p className="mt-8 rounded-2xl border border-violet-100 bg-violet-50 p-4 text-sm leading-6 text-violet-800">
          归档/恢复采用软停用策略：不删除记录、不清理附件，也不改变已完成的审核或学习历史。复审状态可用于建立运营周检、月检与过期资源整改制度。
        </p>
      </main>
    </PlatformShell>
  );
}
function Lifecycle({
  title,
  icon: Icon,
  note,
  items,
}: {
  title: string;
  icon: typeof RadioTower;
  note: string;
  items: LifecycleItem[];
}) {
  return (
    <section className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50">
          <Icon className="h-5 w-5 text-violet-700" />
        </span>
        <div>
          <h2 className="font-serif text-xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">{note}</p>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {items.map(item => (
          <article key={item.id} className="rounded-2xl bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {item.meta}
                </p>
              </div>
              <Badge
                className={
                  item.active
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-200 text-slate-600"
                }
              >
                {item.active ? "运行中" : "已归档"}
              </Badge>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <Badge className={reviewTone[item.reviewStatus]}>
                {reviewText[item.reviewStatus]}
              </Badge>
              <select
                value={item.reviewStatus}
                onChange={event => {
                  item.onReview(event.target.value as Review);
                  toast.success("复审状态已更新");
                }}
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs"
              >
                <option value="current">复审正常</option>
                <option value="due">需要复审</option>
                <option value="overdue">复审逾期</option>
              </select>
            </div>
            <Button
              onClick={() => {
                item.onToggle();
                toast.success(
                  item.active
                    ? "资源已归档，可随时恢复"
                    : "资源已恢复到运营队列"
                );
              }}
              variant="outline"
              size="sm"
              className="mt-4 rounded-lg"
            >
              {item.active ? (
                <>
                  <ArchiveRestore className="mr-2 h-3.5 w-3.5" />
                  归档
                </>
              ) : (
                <>
                  <ArchiveRestore className="mr-2 h-3.5 w-3.5" />
                  恢复
                </>
              )}
            </Button>
          </article>
        ))}
        {!items.length && (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
            暂无可维护资源。
          </p>
        )}
      </div>
    </section>
  );
}
