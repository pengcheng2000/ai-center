import PlatformShell from "@/components/PlatformShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes, skillVisual } from "@/lib/skillVisual";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Clipboard, ClipboardList, Copy, Download, FileCode2, Loader2, MessageSquareText, Send, ShieldCheck, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

export default function SkillDetail() {
  const [, params] = useRoute("/skills/:id");
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const id = Number(params?.id);
  const { data, isLoading, error } = trpc.platform.skills.detail.useQuery({ id }, { enabled: Number.isInteger(id) && id > 0 });
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  useEffect(() => { if (data?.myReview) { setRating(data.myReview.rating); setComment(data.myReview.comment); } else { setRating(5); setComment(""); } }, [data?.myReview]);

  const requestDownload = trpc.platform.skills.requestDownload.useMutation({ onError: err => toast.error(err.message) });
  const saveReview = trpc.platform.skills.upsertReview.useMutation({ onSuccess: () => { toast.success("使用体验已保存"); utils.platform.skills.detail.invalidate({ id }); }, onError: err => toast.error(err.message) });
  const removeReview = trpc.platform.skills.deleteReview.useMutation({ onSuccess: () => { toast.success("已删除你的评论"); setRating(5); setComment(""); utils.platform.skills.detail.invalidate({ id }); }, onError: err => toast.error(err.message) });
  const getDownload = async () => requestDownload.mutateAsync({ skillId: id });
  const startDownload = async () => { const result = await getDownload(); window.open(result.downloadUrl, "_blank", "noopener,noreferrer"); toast.success("已生成受控下载链接，并记录到我的 Skills"); };
  const copyInstall = async () => { const result = await getDownload(); await navigator.clipboard.writeText(result.installCommand); toast.success("安装指令已复制"); };
  const copyMarkdown = async () => { await navigator.clipboard.writeText(data?.skill.skillMd ?? ""); toast.success("SKILL.md 内容已复制"); };

  if (isLoading)
    return <PlatformShell><div className="grid min-h-[65vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-violet-600" /></div></PlatformShell>;

  if (error || !data)
    return (
      <PlatformShell>
        <main className="mx-auto grid min-h-[65vh] max-w-xl place-items-center px-5 text-center">
          <div>
            <h1 className="font-serif text-3xl font-semibold">该 Skills 暂不可查看</h1>
            <p className="mt-3 text-slate-500">它可能仍在审核中，或你没有查看权限。</p>
            <Button onClick={() => setLocation("/skills")} className="mt-6">返回 Skills 广场</Button>
          </div>
        </main>
      </PlatformShell>
    );

  const { skill } = data;
  const isPublished = skill.reviewStatus === "approved";
  const reviewVerb = data.myReview ? "更新体验" : "发布体验";
  const { Icon, hue } = skillVisual(skill.skillKey);
  const ratingValue = Number(data.averageRating);

  return (
    <PlatformShell>
      <main className="mx-auto max-w-[1160px] px-5 py-9 lg:px-10">
        <button onClick={() => setLocation("/skills")} className="group flex items-center text-sm font-medium text-slate-500 transition hover:text-violet-700">
          <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-0.5" />返回 Skills 广场
        </button>

        <div className="mt-5 grid gap-6 xl:grid-cols-[1fr_.34fr] xl:items-start">
          <section className="space-y-6">
            <div className="relative overflow-hidden rounded-[28px] bg-slate-950 p-7 text-white shadow-sm md:p-8">
              <div className="hero-orb -top-28 right-0 h-64 w-64 bg-violet-600/25" />
              <div className="hero-orb -bottom-32 -left-12 h-60 w-60 bg-indigo-500/20" />
              <div className="relative">
                <div className="flex items-start gap-4">
                  <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${hue}`}><Icon className="h-7 w-7" /></span>
                  <div className="min-w-0 pt-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-violet-400/15 px-2.5 py-1 text-xs font-medium text-violet-100">{skill.category}</span>
                      <span className="font-mono text-xs text-violet-300">{skill.skillKey}</span>
                    </div>
                    <h1 className="mt-2.5 font-serif text-3xl font-semibold md:text-4xl">{skill.name}</h1>
                  </div>
                </div>
                <p className="mt-5 max-w-3xl leading-7 text-slate-300">{skill.summary}</p>
                <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 md:grid-cols-4">
                  <Meta label="版本" value={skill.version} mono />
                  <Meta label="综合评分" value={ratingValue ? `${ratingValue.toFixed(1)} 分` : "暂无评分"} />
                  <Meta label="体验分享" value={`${data.reviewCount} 条`} />
                  <Meta label="上架时间" value={skill.publishedAt ? new Date(skill.publishedAt).toLocaleDateString() : "等待审核"} />
                </dl>
                {skill.tags.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {skill.tags.map(tag => <span key={tag} className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-violet-100">{tag}</span>)}
                  </div>
                )}
              </div>
            </div>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-700"><FileCode2 className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-bold">SKILL.md 预览</h2>
                    <p className="truncate text-xs text-slate-400">投稿时提交的原始 Markdown 文本，供审核时核对与下载包的一致性</p>
                  </div>
                </div>
                <Button onClick={copyMarkdown} variant="outline" size="sm" className="shrink-0"><Copy className="mr-1.5 h-3.5 w-3.5" />复制</Button>
              </div>
              <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap bg-slate-50/60 p-5 font-mono text-[13px] leading-6 text-slate-700">{skill.skillMd}</pre>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-50 text-violet-700"><ClipboardList className="h-4 w-4" /></span>
                <h2 className="text-base font-bold">使用方法</h2>
              </div>
              <p className="mt-4 whitespace-pre-wrap leading-7 text-slate-600">{skill.usageGuide}</p>
              <div className="mt-5 flex gap-2.5 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Skills 可能包含自动化步骤或外部依赖。请先阅读 SKILL.md 与安装包内容，并遵守企业数据、权限和变更管理规范。</p>
              </div>
            </section>

            {isPublished && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-50 text-violet-700"><MessageSquareText className="h-4 w-4" /></span>
                  <h2 className="text-base font-bold">使用体验与反馈</h2>
                  <span className="text-sm text-slate-400">{data.reviewCount} 条</span>
                </div>

                <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-700">为这个 Skills 评分并分享体验</p>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map(value => (
                        <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} 星评分`} className="rounded p-1 transition hover:bg-amber-50">
                          <Star className={`h-5 w-5 transition ${value <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <Textarea value={comment} onChange={event => setComment(event.target.value)} className="mt-3 min-h-24 bg-white" placeholder="分享适用场景、实际效果或改进建议（2–1000 字）。" />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-slate-400">
                      {data.myReview ? `上次更新：${new Date(data.myReview.updatedAt).toLocaleDateString()}` : "你的评分与体验将展示给其他同事"}
                    </span>
                    <div className="flex gap-2">
                      {data.myReview && (
                        <Button onClick={() => removeReview.mutate({ skillId: id })} disabled={removeReview.isPending} variant="ghost" size="sm" className="text-rose-600">
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />删除
                        </Button>
                      )}
                      <Button onClick={() => saveReview.mutate({ skillId: id, rating, comment })} disabled={comment.trim().length < 2 || saveReview.isPending} size="sm">
                        <Send className="mr-1.5 h-3.5 w-3.5" />{reviewVerb}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-y-5">
                  {data.reviews.map(({ review, reviewerName }) => (
                    <article key={review.id} className="flex gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">{(reviewerName || "企业成员")[0]}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <p className="text-sm font-semibold">{reviewerName || "企业成员"}</p>
                          <div className="flex items-center gap-0.5" aria-label={`${review.rating} 星评分`}>
                            {[1, 2, 3, 4, 5].map(value => (
                              <Star key={value} className={`h-3.5 w-3.5 ${value <= review.rating ? "fill-amber-400 text-amber-400" : "text-slate-200"}`} />
                            ))}
                          </div>
                        </div>
                        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-slate-600">{review.comment}</p>
                        <p className="mt-1 text-xs text-slate-400">{new Date(review.updatedAt).toLocaleDateString()}</p>
                      </div>
                    </article>
                  ))}
                  {!data.reviews.length && (
                    <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">还没有使用反馈，成为第一个分享体验的员工。</p>
                  )}
                </div>
              </section>
            )}
          </section>

          <aside className="space-y-4 xl:sticky xl:top-20">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold">下载与安装</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">每次下载都会记录到你的“我的 Skills”。下载链接按当前会话临时签发，失效后请重新进入本页。</p>
              <Button disabled={requestDownload.isPending} onClick={startDownload} className="mt-4 w-full"><Download className="mr-2 h-4 w-4" />下载安装包</Button>
              <Button disabled={requestDownload.isPending} onClick={copyInstall} variant="outline" className="mt-2 w-full"><Clipboard className="mr-2 h-4 w-4" />复制一句话安装</Button>
              <dl className="mt-5 space-y-2.5 border-t border-slate-100 pt-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="shrink-0 text-slate-400">文件</dt>
                  <dd className="truncate font-mono text-xs text-slate-600" title={skill.packageFileName}>{skill.packageFileName}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-400">大小</dt>
                  <dd className="text-slate-600">{formatBytes(skill.packageSizeBytes)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-400">版本</dt>
                  <dd className="font-mono text-xs text-slate-600">{skill.version}</dd>
                </div>
              </dl>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold">安装指令说明</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">点击“复制一句话安装”后，系统会生成含 Skills 名称和当前受控下载链接的指令，可直接粘贴给已授权的 Agent。</p>
            </section>
            <p className="px-1 text-xs text-slate-400">分享者：{data.authorName || "企业成员"}</p>
          </aside>
        </div>
      </main>
    </PlatformShell>
  );
}

function Meta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-white/5 px-4 py-3">
      <dt className="text-[11px] font-medium tracking-wide text-slate-400">{label}</dt>
      <dd className={`mt-1 truncate ${mono ? "font-mono text-[13px]" : "text-sm"} font-semibold text-white`}>{value}</dd>
    </div>
  );
}
