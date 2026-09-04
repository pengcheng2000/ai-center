import PlatformShell from "@/components/PlatformShell";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes, skillVisual } from "@/lib/skillVisual";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronRight,
  Clipboard,
  ClipboardList,
  Copy,
  Download,
  FileCode2,
  Loader2,
  MessageSquareText,
  Send,
  ShieldCheck,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

type DetailTab = "overview" | "usage" | "reviews";

export default function SkillDetail() {
  const [, params] = useRoute("/skills/:id");
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const id = Number(params?.id);
  const { data, isLoading, error } = trpc.platform.skills.detail.useQuery(
    { id },
    { enabled: Number.isInteger(id) && id > 0 }
  );
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [tab, setTab] = useState<DetailTab>("overview");

  useEffect(() => {
    if (data?.myReview) {
      setRating(data.myReview.rating);
      setComment(data.myReview.comment);
    } else {
      setRating(5);
      setComment("");
    }
  }, [data?.myReview]);

  const requestDownload = trpc.platform.skills.requestDownload.useMutation({
    onError: err => toast.error(err.message),
  });
  const saveReview = trpc.platform.skills.upsertReview.useMutation({
    onSuccess: () => {
      toast.success("使用体验已保存");
      utils.platform.skills.detail.invalidate({ id });
    },
    onError: err => toast.error(err.message),
  });
  const removeReview = trpc.platform.skills.deleteReview.useMutation({
    onSuccess: () => {
      toast.success("已删除你的评论");
      setRating(5);
      setComment("");
      utils.platform.skills.detail.invalidate({ id });
    },
    onError: err => toast.error(err.message),
  });
  const getDownload = async () => requestDownload.mutateAsync({ skillId: id });
  const startDownload = async () => {
    const result = await getDownload();
    window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
    toast.success("已生成受控下载链接，并记录到我的 Skills");
  };
  const copyInstall = async () => {
    const result = await getDownload();
    await navigator.clipboard.writeText(result.installCommand);
    toast.success("安装指令已复制");
  };
  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(data?.skill.skillMd ?? "");
    toast.success("SKILL.md 内容已复制");
  };

  if (isLoading)
    return (
      <PlatformShell>
        <div className="grid min-h-[65vh] place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
        </div>
      </PlatformShell>
    );

  if (error || !data)
    return (
      <PlatformShell>
        <main className="mx-auto grid min-h-[65vh] max-w-xl place-items-center px-5 text-center">
          <div>
            <h1 className="font-serif text-3xl font-semibold">
              该 Skills 暂不可查看
            </h1>
            <p className="mt-3 text-slate-500">
              它可能仍在审核中，或你没有查看权限。
            </p>
            <Button onClick={() => setLocation("/skills")} className="mt-6">
              返回 Skills 广场
            </Button>
          </div>
        </main>
      </PlatformShell>
    );

  const { skill } = data;
  const isPublished = skill.reviewStatus === "approved";
  const reviewVerb = data.myReview ? "更新体验" : "发布体验";
  const { Icon, hue } = skillVisual(skill.skillKey);
  const ratingValue = Number(data.averageRating);
  const tabs: { value: DetailTab; label: string; count?: number }[] = [
    { value: "overview", label: "SKILL.md" },
    { value: "usage", label: "使用方法" },
    { value: "reviews", label: "使用反馈", count: data.reviewCount },
  ];

  return (
    <PlatformShell>
      <main className="mx-auto max-w-[1160px] px-5 py-9 lg:px-10">
        <nav
          aria-label="面包屑"
          className="flex items-center gap-1 text-sm text-slate-400"
        >
          <button
            onClick={() => setLocation("/skills")}
            className="flex items-center font-medium text-slate-500 transition hover:text-violet-700"
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Skills 广场
          </button>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="max-w-60 truncate font-mono text-xs">
            {skill.skillKey}
          </span>
        </nav>

        <div className="mt-4 grid gap-6 xl:grid-cols-[1fr_.34fr] xl:items-start">
          <section className="space-y-6">
            <div className="relative overflow-hidden rounded-xl border border-violet-100 bg-violet-50/40 p-7 md:p-8">
              <div className="relative">
                <div className="flex items-start gap-4">
                  <span
                    className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${hue}`}
                  >
                    <Icon className="h-7 w-7" />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-600">
                        {skill.category}
                      </span>
                      <span className="font-mono text-xs text-gray-500">
                        {skill.skillKey}
                      </span>
                      {skill.version && (
                        <span className="rounded-full bg-white px-2 py-0.5 font-mono text-xs text-gray-500">
                          {skill.version}
                        </span>
                      )}
                    </div>
                    <h1 className="mt-2.5 text-3xl font-semibold text-gray-900 md:text-4xl">
                      {skill.name}
                    </h1>
                  </div>
                </div>
                <p className="mt-5 max-w-3xl leading-7 text-gray-600">
                  {skill.summary}
                </p>
                {skill.tags.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {skill.tags.map(tag => (
                      <span
                        key={tag}
                        className="rounded-full bg-violet-100 px-2.5 py-1 text-xs text-violet-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {isPublished && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                  label="综合评分"
                  value={ratingValue ? ratingValue.toFixed(1) : "—"}
                  suffix={ratingValue ? "/5" : undefined}
                  accent="text-amber-500"
                />
                <StatCard
                  label="使用反馈"
                  value={String(data.reviewCount)}
                  suffix="条"
                />
                <StatCard
                  label="累计下载"
                  value={
                    data.totalDownloads
                      ? data.totalDownloads.toLocaleString()
                      : "0"
                  }
                  suffix="次"
                />
                <StatCard
                  label="上架时间"
                  value={
                    skill.publishedAt
                      ? new Date(skill.publishedAt).toLocaleDateString()
                      : "等待审核"
                  }
                />
              </div>
            )}

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 px-4 pt-3">
                {tabs.map(item => (
                  <button
                    key={item.value}
                    onClick={() => setTab(item.value)}
                    aria-pressed={tab === item.value}
                    className={`relative rounded-t-lg px-4 py-2.5 text-sm font-medium transition ${tab === item.value ? "text-violet-700" : "text-slate-500 hover:text-slate-800"}`}
                  >
                    {item.label}
                    {item.count !== undefined && item.count > 0 && (
                      <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-xs font-semibold text-violet-700">
                        {item.count}
                      </span>
                    )}
                    <span
                      className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full transition ${tab === item.value ? "bg-violet-600" : "bg-transparent"}`}
                    />
                  </button>
                ))}
              </div>

              {tab === "overview" && (
                <div>
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
                    <p className="truncate text-xs text-slate-400">
                      投稿时提交的原始 Markdown
                      文本，供审核时核对与下载包的一致性
                    </p>
                    <Button
                      onClick={copyMarkdown}
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      复制
                    </Button>
                  </div>
                  <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap bg-slate-50/60 p-5 font-mono text-[13px] leading-6 text-slate-700">
                    {skill.skillMd}
                  </pre>
                </div>
              )}

              {tab === "usage" && (
                <div className="p-6">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-50 text-violet-700">
                      <ClipboardList className="h-4 w-4" />
                    </span>
                    <h2 className="text-base font-bold">使用方法</h2>
                  </div>
                  <p className="mt-4 whitespace-pre-wrap leading-7 text-slate-600">
                    {skill.usageGuide}
                  </p>
                  <div className="mt-5 flex gap-2.5 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      Skills 可能包含自动化步骤或外部依赖。请先阅读 SKILL.md
                      与安装包内容，并遵守企业数据、权限和变更管理规范。
                    </p>
                  </div>
                </div>
              )}

              {tab === "reviews" && (
                <div className="p-6">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-50 text-violet-700">
                      <MessageSquareText className="h-4 w-4" />
                    </span>
                    <h2 className="text-base font-bold">使用体验与反馈</h2>
                    <span className="text-sm text-slate-400">
                      {data.reviewCount} 条
                    </span>
                  </div>

                  <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-700">
                        为这个 Skills 评分并分享体验
                      </p>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(value => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setRating(value)}
                            aria-label={`${value} 星评分`}
                            className="rounded p-1 transition hover:bg-amber-50"
                          >
                            <Star
                              className={`h-5 w-5 transition ${value <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300"}`}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                    <Textarea
                      value={comment}
                      onChange={event => setComment(event.target.value)}
                      maxLength={1000}
                      className="mt-3 min-h-24 bg-white"
                      placeholder="分享适用场景、实际效果或改进建议（2–1000 字）。"
                    />
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-slate-400">
                        {data.myReview
                          ? `上次更新：${new Date(data.myReview.updatedAt).toLocaleDateString()}`
                          : "你的评分与体验将展示给其他同事"}
                        {` · ${comment.length}/1000`}
                      </span>
                      <div className="flex gap-2">
                        {data.myReview && (
                          <ConfirmActionDialog
                            title="删除我的使用反馈"
                            description="评分与评论会立即从 Skills 详情中移除，此操作不可撤销。"
                            pending={removeReview.isPending}
                            onConfirm={() =>
                              removeReview.mutate({ skillId: id })
                            }
                            trigger={
                              <Button
                                disabled={removeReview.isPending}
                                variant="ghost"
                                size="sm"
                                className="text-rose-600"
                              >
                                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                删除
                              </Button>
                            }
                          />
                        )}
                        <Button
                          onClick={() =>
                            saveReview.mutate({ skillId: id, rating, comment })
                          }
                          disabled={
                            comment.trim().length < 2 || saveReview.isPending
                          }
                          size="sm"
                        >
                          <Send className="mr-1.5 h-3.5 w-3.5" />
                          {reviewVerb}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 space-y-5">
                    {data.reviews.map(({ review, reviewerName }) => (
                      <article key={review.id} className="flex gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
                          {(reviewerName || "企业成员")[0]}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                            <p className="text-sm font-semibold">
                              {reviewerName || "企业成员"}
                            </p>
                            <div
                              className="flex items-center gap-0.5"
                              aria-label={`${review.rating} 星评分`}
                            >
                              {[1, 2, 3, 4, 5].map(value => (
                                <Star
                                  key={value}
                                  className={`h-3.5 w-3.5 ${value <= review.rating ? "fill-amber-400 text-amber-400" : "text-slate-200"}`}
                                />
                              ))}
                            </div>
                          </div>
                          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                            {review.comment}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {new Date(review.updatedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </article>
                    ))}
                    {!data.reviews.length && (
                      <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">
                        还没有使用反馈，成为第一个分享体验的员工。
                      </p>
                    )}
                  </div>
                </div>
              )}
            </section>

            {data.related.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-bold">同分类推荐</h2>
                  <button
                    onClick={() => setLocation("/skills")}
                    className="flex items-center text-xs font-medium text-violet-700 transition hover:text-violet-900"
                  >
                    查看全部
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {data.related.map(item => {
                    const visual = skillVisual(item.skillKey);
                    return (
                      <button
                        key={item.id}
                        onClick={() => setLocation(`/skills/${item.id}`)}
                        className="group rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-left transition hover:border-violet-200 hover:bg-white hover:shadow-sm"
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${visual.hue}`}
                          >
                            <visual.Icon className="h-4 w-4" />
                          </span>
                          <span className="truncate text-sm font-semibold text-slate-900">
                            {item.name}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-slate-500">
                          {item.summary}
                        </p>
                        <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-violet-600">
                          查看详情
                          <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </section>

          <aside className="space-y-4 xl:sticky xl:top-20">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold">下载与安装</h2>
              <div className="mt-3 rounded-xl bg-slate-950 p-4">
                <p className="text-xs font-medium tracking-wide text-slate-400">
                  将提示词发送给你的 AI
                </p>
                <p className="mt-2 font-mono text-xs leading-5 text-slate-200">
                  安装 Skills「{skill.name}」，获取下载链接后按指引安装。
                </p>
                <Button
                  disabled={requestDownload.isPending}
                  onClick={copyInstall}
                  variant="secondary"
                  size="sm"
                  className="mt-3 w-full bg-white/90 text-slate-900 hover:bg-white"
                >
                  <Clipboard className="mr-1.5 h-3.5 w-3.5" />
                  复制一句话安装
                </Button>
              </div>
              <Button
                disabled={requestDownload.isPending}
                onClick={startDownload}
                variant="outline"
                className="mt-3 w-full"
              >
                <Download className="mr-2 h-4 w-4" />
                下载 Zip 安装包
              </Button>
              <dl className="mt-5 space-y-2.5 border-t border-slate-100 pt-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="shrink-0 text-slate-400">文件</dt>
                  <dd
                    className="truncate font-mono text-xs text-slate-600"
                    title={skill.packageFileName}
                  >
                    {skill.packageFileName}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-400">大小</dt>
                  <dd className="text-slate-600">
                    {formatBytes(skill.packageSizeBytes)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-400">版本</dt>
                  <dd className="font-mono text-xs text-slate-600">
                    {skill.version}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-xs leading-5 text-slate-400">
                每次下载都会记录到“我的
                Skills”；链接按当前会话临时签发，失效后请重新进入本页。
              </p>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold">安装指令说明</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                点击“复制一句话安装”后，系统会生成含 Skills
                名称和当前受控下载链接的指令，可直接粘贴给已授权的 Agent。
              </p>
            </section>
            <p className="px-1 text-xs text-slate-400">
              分享者：{data.authorName || "企业成员"}
            </p>
          </aside>
        </div>
      </main>
    </PlatformShell>
  );
}

function StatCard({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: string;
  suffix?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 truncate text-lg font-bold tabular-nums">
        <span className={accent}>{value}</span>
        {suffix && (
          <span className="ml-0.5 text-xs font-normal text-slate-400">
            {suffix}
          </span>
        )}
      </p>
    </div>
  );
}
