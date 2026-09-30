import { useAuth } from "@/_core/hooks/useAuth";
import PlatformShell from "@/components/PlatformShell";
import KnowledgeRenderer from "@/components/knowledge/KnowledgeRenderer";
import KnowledgeTree from "@/components/knowledge/KnowledgeTree";
import {
  knowledgeInput,
  safeKnowledgeReturn,
  useKnowledgeQuery,
} from "@/components/knowledge/KnowledgeControls";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { trpc } from "@/lib/trpc";
import { Link, useRoute } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import {
  KNOWLEDGE_CATEGORIES,
  categoryName,
  defaultEditorial,
  sameEditorialPresentation,
  type KnowledgeCategory,
} from "@shared/knowledge";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
type Preview = inferRouterOutputs<AppRouter>["knowledge"]["admin"]["preview"];
const issueNames: Record<string, string> = {
  asset_budget: "附件超过本次容量限制，可稍后重试",
  unsupported_inline: "来源未返回完整引用内容",
  missing_image: "图片未能读取",
  missing_attachment: "附件未能读取",
  grid_linearized: "分栏转为顺序阅读",
  view_linearized: "视图转为顺序阅读",
  grid_column_linearized: "分栏转为顺序阅读",
  board: "画板未展示",
  iframe: "嵌入内容未展示",
  sub_page_list: "子页面目录",
  chat_card: "群聊卡片未展示",
  merged_table_cells: "合并单元格版式已简化",
  source_synced: "引用块尚未展开",
  undefined: "特殊内容未转换",
};
function ReviewBody({
  preview,
  versions,
}: {
  preview: Preview;
  versions:
    | inferRouterOutputs<AppRouter>["knowledge"]["admin"]["versions"]
    | undefined;
}) {
  const content = preview.content!;
  const initial = preview.item.editorial ?? defaultEditorial();
  const [editorial, setEditorial] = useState(initial),
    [checked, setChecked] = useState(initial.reviewedContentId === content.id),
    [saved, setSaved] = useState(initial.reviewedContentId === content.id);
  const [owner, setOwner] = useState(""),
    [share, setShare] = useState(false),
    [ack, setAck] = useState(false),
    [rawOpen, setRawOpen] = useState(false),
    [panelOpen, setPanelOpen] = useState(false);
  const utils = trpc.useUtils();
  const refresh = () => {
    void utils.knowledge.admin.invalidate();
    void utils.knowledge.list.invalidate();
    void utils.knowledge.detail.invalidate();
  };
  const save = trpc.knowledge.admin.saveEditorial.useMutation({
    onSuccess: (_result, input) => {
      setSaved(
        input.editorial.reviewedContentId === content.id &&
          sameEditorialPresentation(input.editorial, editorial)
      );
      toast.success("编目草稿已保存");
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const approve = trpc.knowledge.admin.approve.useMutation({
    onSuccess: () => {
      setOwner("");
      setShare(false);
      setAck(false);
      toast.success("当前版本已批准，可确认发布");
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const publish = trpc.knowledge.admin.publish.useMutation({
    onSuccess: () => {
      toast.success("指定版本已发布");
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const withdraw = trpc.knowledge.admin.withdraw.useMutation({
    onSuccess: () => {
      toast.success("已撤回");
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const raw = trpc.knowledge.admin.rawSnapshot.useQuery(
    { contentId: content.id },
    { enabled: rawOpen }
  );
  const change = (value: Partial<typeof editorial>) => {
    setEditorial(e => ({ ...e, ...value }));
    setSaved(false);
    setShare(false);
  };
  const selectedPub = versions?.publications.find(
    p =>
      p.contentId === content.id &&
      p.status === "approved" &&
      sameEditorialPresentation(p.editorialSnapshot, editorial)
  );
  const published = versions?.publications.find(p => p.status === "published");
  const issues = Object.entries(content.unsupportedSummary ?? {});
  const canApprove =
    saved &&
    checked &&
    editorial.included &&
    !!owner.trim() &&
    share &&
    (content.renderStatus === "complete" || ack) &&
    !approve.isPending &&
    !selectedPub &&
    !preview.approvalIssue &&
    preview.item.syncStatus === "active" &&
    content.renderStatus !== "preview_only";
  const reviewPanel = (
    <div className="space-y-5 rounded-xl border bg-white p-5 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-auto">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">审核第 {content.versionNo} 版</h2>
        <Button
          variant="ghost"
          size="sm"
          className="lg:hidden"
          onClick={() => setPanelOpen(false)}
        >
          关闭
        </Button>
      </div>
      <section className="text-sm">
        <p className="font-medium">内容质量</p>
        {preview.approvalIssue && (
          <p
            role="alert"
            className="mt-2 rounded-lg bg-amber-50 p-3 text-amber-800"
          >
            {preview.approvalIssue}
          </p>
        )}
        <p className="mt-2 text-gray-600">
          {content.renderStatus === "complete"
            ? "结构转换完整，仍需核对正文与图片实际显示。"
            : "存在缺失或版式转换，请核对原文后决定是否发布。"}
        </p>
        {issues.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-amber-800">
            {issues.map(([k, n]) => (
              <li key={k}>
                {issueNames[k] ?? "特殊结构未完整展示"} × {n}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-3 border-t pt-4 text-sm">
        <h3 className="font-medium">栏目与简介</h3>
        <label className="block">
          栏目
          <select
            className={knowledgeInput + " mt-1 w-full"}
            value={editorial.category}
            onChange={e =>
              change({ category: e.target.value as KnowledgeCategory })
            }
          >
            {KNOWLEDGE_CATEGORIES.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          短简介{" "}
          <span className="text-xs text-gray-400">
            {editorial.summary.length}/120
          </span>
          <textarea
            maxLength={120}
            rows={3}
            className="mt-1 w-full resize-y rounded-lg border p-3 text-sm"
            placeholder="用一两句话说明读者可以学到什么"
            value={editorial.summary}
            onChange={e => change({ summary: e.target.value })}
          />
        </label>
        <label className="block">
          专题
          <input
            maxLength={100}
            className={knowledgeInput + " mt-1 w-full"}
            value={editorial.topic}
            placeholder="无明确系列时留空"
            onChange={e => change({ topic: e.target.value })}
          />
        </label>
        <label className="block">
          专题顺序
          <input
            type="number"
            min={0}
            max={10000}
            className={knowledgeInput + " mt-1 w-full"}
            value={editorial.topicOrder}
            onChange={e =>
              change({ topicOrder: Math.max(0, Number(e.target.value) || 0) })
            }
          />
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={editorial.included}
            onChange={e => change({ included: e.target.checked })}
          />
          收录到学习中心
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={editorial.featured}
            onChange={e => change({ featured: e.target.checked })}
          />
          设为精选
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={checked}
            onChange={e => {
              setChecked(e.target.checked);
              setSaved(false);
              setShare(false);
            }}
          />
          已核对当前版本的内容与编目
        </label>
        <Button
          variant="outline"
          className="w-full"
          disabled={save.isPending}
          onClick={() =>
            save.mutate({
              itemId: preview.item.id,
              editorial: {
                ...editorial,
                reviewedContentId: checked ? content.id : null,
              },
            })
          }
        >
          {saved ? "保存编目" : "保存编目草稿"}
        </Button>
        <p className="text-xs text-gray-500">
          修改仅保存为草稿，重新批准和发布后才影响正式页面。
        </p>
      </section>
      <section className="space-y-3 border-t pt-4 text-sm">
        <h3 className="font-medium">负责人确认</h3>
        <label className="block">
          确认共享的知识负责人
          <input
            className={knowledgeInput + " mt-1 w-full"}
            maxLength={160}
            value={owner}
            onChange={e => setOwner(e.target.value)}
          />
        </label>
        <label className="flex items-start gap-2 text-xs leading-5">
          <input
            type="checkbox"
            className="mt-1 shrink-0"
            checked={share}
            onChange={e => setShare(e.target.checked)}
          />
          负责人已确认该版本可向所有已登录账号（含自注册账号）共享
        </label>
        {content.renderStatus !== "complete" && (
          <label className="flex items-start gap-2 text-xs leading-5">
            <input
              type="checkbox"
              className="mt-1 shrink-0"
              checked={ack}
              onChange={e => setAck(e.target.checked)}
            />
            已核对缺失内容，确认当前副本仍适合发布
          </label>
        )}
        {!saved && (
          <p className="text-xs text-amber-800">
            请先完成并保存当前版本的编目复核。
          </p>
        )}
        {!editorial.included && (
          <p className="text-xs text-amber-800">
            未收录内容不能发布到学习中心。
          </p>
        )}
        {preview.item.syncStatus !== "active" && (
          <p className="text-xs text-amber-800">
            来源同步状态异常，需先检查同步结果。
          </p>
        )}
        <Button
          className="w-full bg-indigo-600 hover:bg-indigo-700"
          disabled={!canApprove}
          onClick={() =>
            approve.mutate({
              contentId: content.id,
              ownerConfirmedBy: owner,
              allowIncomplete: ack,
            })
          }
        >
          {selectedPub ? "此版本已批准" : "批准第 " + content.versionNo + " 版"}
        </Button>
      </section>
      {selectedPub && (
        <section className="border-t pt-4">
          <p className="mb-3 text-sm">
            第 {content.versionNo} 版已批准，尚未发布。
          </p>
          <ConfirmActionDialog
            trigger={
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700">
                发布此版本
              </Button>
            }
            title={`发布《${content.titleSnapshot}》第 ${content.versionNo} 版？`}
            description="将向所有已登录账号（含自注册账号）开放此版本及批准时的编目信息；旧发布版本会撤回。"
            confirmLabel="确认发布"
            pending={publish.isPending}
            onConfirm={() => publish.mutate({ publicationId: selectedPub.id })}
          />
        </section>
      )}
      {published && (
        <section className="border-t pt-4">
          <p className="mb-3 text-sm">
            已发布：第{" "}
            {
              versions?.contents.find(c => c.id === published.contentId)
                ?.versionNo
            }{" "}
            版
          </p>
          <ConfirmActionDialog
            trigger={
              <Button variant="outline" className="w-full">
                撤回已发布版本
              </Button>
            }
            title={`撤回《${preview.item.title}》？`}
            description="员工将无法继续阅读，旧附件地址也会失效。"
            confirmLabel="确认撤回"
            pending={withdraw.isPending}
            onConfirm={() => withdraw.mutate({ publicationId: published.id })}
          />
        </section>
      )}
      <details className="border-t pt-4 text-xs">
        <summary className="cursor-pointer">审批与发布记录</summary>
        <ul className="mt-3 space-y-2 text-gray-500">
          {versions?.publications.map(p => (
            <li key={p.id}>
              第 {versions.contents.find(c => c.id === p.contentId)?.versionNo}{" "}
              版 ·{" "}
              {p.status === "published"
                ? "已发布"
                : p.status === "approved"
                  ? "已批准"
                  : "已撤回"}{" "}
              · {new Date(p.approvedAt).toLocaleDateString("zh-CN")}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
  return (
    <>
      <div className="mt-6 grid min-w-0 gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          <KnowledgeRenderer key={content.id} content={content} admin />
          <details
            className="mt-8 rounded-lg border p-4"
            onToggle={e => setRawOpen(e.currentTarget.open)}
          >
            <summary className="cursor-pointer text-sm text-gray-500">
              原始快照（技术排查）
            </summary>
            {rawOpen && (
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
                {raw.isError
                  ? "快照加载失败"
                  : (raw.data?.snapshot ?? "加载中…")}
              </pre>
            )}
          </details>
        </section>
        <aside id="knowledge-review-panel" className="hidden min-w-0 lg:block">
          {reviewPanel}
        </aside>
      </div>
      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-white p-3 lg:hidden">
          <SheetTrigger asChild>
            <Button className="w-full bg-indigo-600">
              审核第 {content.versionNo} 版 · 编目与发布
            </Button>
          </SheetTrigger>
        </div>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-auto p-4">
          <SheetTitle className="sr-only">文章审核与发布</SheetTitle>
          <SheetDescription className="sr-only">
            核对内容和编目，记录负责人确认后发布。
          </SheetDescription>
          {reviewPanel}
        </SheetContent>
      </Sheet>
    </>
  );
}
export default function KnowledgeReview() {
  const { user } = useAuth(),
    [, route] = useRoute("/operations/knowledge/:id"),
    { params, set } = useKnowledgeQuery();
  const itemId = Number(route?.id),
    contentId = Number(params.get("version")) || undefined,
    from = safeKnowledgeReturn(params.get("from"), true);
  const enabled = user?.role === "admin" && itemId > 0;
  const preview = trpc.knowledge.admin.preview.useQuery(
    { itemId, contentId },
    { enabled }
  );
  const versions = trpc.knowledge.admin.versions.useQuery(
    { itemId },
    { enabled }
  );
  const item = preview.data?.item,
    content = preview.data?.content;
  const tree = trpc.knowledge.admin.tree.useQuery(
    { sourceId: item?.sourceId ?? 0 },
    { enabled: enabled && !!item }
  );
  const queueParams = new URLSearchParams(from.split("?")[1] ?? "");
  const queue = trpc.knowledge.admin.catalog.useQuery(
    {
      sourceId: item?.sourceId ?? 0,
      query: queueParams.get("q") ?? "",
      category: queueParams.get("category") ?? "all",
      topic: queueParams.get("topic") ?? "all",
      status: queueParams.get("status") ?? "all",
      quality: queueParams.get("quality") ?? "all",
      page: 1,
    },
    { enabled: enabled && !!item }
  );
  const ids = queue.data?.reviewQueue ?? [],
    pos = ids.indexOf(itemId),
    next = ids[pos + 1] ?? ids.find(id => id !== itemId);
  const path: string[] = [];
  const seen = new Set<number>();
  let parent = tree.data?.find(n => n.id === item?.parentItemId);
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id);
    path.unshift(parent.title);
    parent = tree.data?.find(n => n.id === parent?.parentItemId);
  }
  if (!enabled)
    return (
      <PlatformShell hideMobileNav>
        <p className="p-10 text-center">仅管理员可访问知识审核。</p>
      </PlatformShell>
    );
  return (
    <PlatformShell hideMobileNav>
      <main className="mx-auto max-w-[1440px] px-4 pb-24 pt-6 lg:px-8 lg:pb-10">
        <div className="mb-5 flex flex-wrap justify-between gap-3 text-sm">
          <Link href={from} className="text-gray-500">
            ← 返回内容队列
          </Link>
          {next && (
            <Link
              className="text-indigo-700"
              href={`/operations/knowledge/${next}?from=${encodeURIComponent(from)}`}
            >
              下一篇待审核 →
            </Link>
          )}
        </div>
        {preview.isError ? (
          <div role="alert" className="rounded-xl border p-8">
            <p>文章预览加载失败：{preview.error.message}</p>
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => void preview.refetch()}
            >
              重试
            </Button>
          </div>
        ) : preview.isLoading || !item ? (
          <p role="status">正在加载当前版本…</p>
        ) : (
          <>
            <header className="sticky top-[72px] z-20 border-b bg-white/95 py-3 backdrop-blur">
              <p
                className="truncate text-xs text-gray-500"
                title={path.join(" / ")}
              >
                {categoryName(item.editorial?.category)} ·{" "}
                {path.join(" / ") || "知识库根目录"}
              </p>
              <h1 className="mt-2 text-xl font-semibold leading-7 sm:text-2xl">
                {content?.titleSnapshot ?? item.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <label>
                  预览版本{" "}
                  <select
                    aria-label="预览版本"
                    className={knowledgeInput}
                    value={contentId ?? ""}
                    onChange={e => set({ version: e.target.value })}
                  >
                    <option value="">最新可读版本</option>
                    {versions.data?.contents
                      .filter(c => c.ingestStatus === "ready")
                      .map(c => (
                        <option key={c.id} value={c.id}>
                          第 {c.versionNo} 版
                        </option>
                      ))}
                  </select>
                </label>
                <span className="text-gray-500">
                  {content ? `当前第 ${content.versionNo} 版` : "没有可读版本"}
                </span>
                <span className="text-gray-500">
                  {(() => {
                    const published = versions.data?.publications.find(
                      p => p.status === "published"
                    );
                    const version = versions.data?.contents.find(
                      c => c.id === published?.contentId
                    );
                    return version
                      ? `已发布第 ${version.versionNo} 版`
                      : "尚未发布";
                  })()}
                </span>
                {item.sourceUrl && (
                  <a
                    className="text-indigo-700"
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    查看飞书原文 ↗
                  </a>
                )}
              </div>
            </header>
            <div className="mt-4">
              <KnowledgeTree
                items={tree.data ?? []}
                selected={itemId}
                from={from}
              />
            </div>
            {content ? (
              <ReviewBody
                key={`${itemId}-${content.id}`}
                preview={preview.data!}
                versions={versions.data}
              />
            ) : (
              <section className="mt-6 rounded-xl border bg-gray-50 p-8">
                <h2 className="font-semibold">此节点暂不可预览</h2>
                <p className="mt-3 text-sm text-gray-600">
                  {item.kind === "shortcut"
                    ? "这是飞书快捷方式，仅保留来源引用，不会自动读取其他空间。"
                    : item.lastContentErrorCode
                      ? "正文或附件读取未完成，请检查飞书资源授权和同步记录。"
                      : "该节点尚未生成可读的正文版本。"}
                </p>
                <Link
                  className="mt-4 inline-block text-sm text-indigo-700"
                  href={`/operations/knowledge?tab=sync&source=${item.sourceId}`}
                >
                  查看来源与同步 →
                </Link>
              </section>
            )}
          </>
        )}
      </main>
    </PlatformShell>
  );
}
