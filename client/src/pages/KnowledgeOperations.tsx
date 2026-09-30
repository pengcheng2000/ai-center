import { useAuth } from "@/_core/hooks/useAuth";
import PlatformShell from "@/components/PlatformShell";
import { PageHeader } from "@/components/ProductSurface";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  KNOWLEDGE_CATEGORIES,
  categoryName,
  type KnowledgeCategory,
} from "@shared/knowledge";
import {
  KnowledgePagination,
  knowledgeInput,
  useKnowledgeQuery,
} from "@/components/knowledge/KnowledgeControls";
import KnowledgeSources from "@/components/knowledge/KnowledgeSources";
import KnowledgeTree from "@/components/knowledge/KnowledgeTree";
const statusLabels: Record<string, string> = {
  review: "待审核",
  approved: "待发布",
  published: "已发布",
  updated: "有更新",
  issue: "异常内容",
};
export default function KnowledgeOperations() {
  const { user } = useAuth(),
    { params, search, set } = useKnowledgeQuery();
  const sources = trpc.knowledge.admin.sources.useQuery(undefined, {
    enabled: user?.role === "admin",
  });
  const sourceId = Number(params.get("source")) || sources.data?.[0]?.id || 0;
  const tab = params.get("tab") === "sync" ? "sync" : "content";
  const input = {
    sourceId,
    query: params.get("q") ?? "",
    category: params.get("category") ?? "all",
    topic: params.get("topic") ?? "all",
    status: params.get("status") ?? "all",
    quality: params.get("quality") ?? "all",
    page: Math.max(1, Number(params.get("page")) || 1),
  };
  const query = trpc.knowledge.admin.catalog.useQuery(input, {
    enabled: user?.role === "admin" && sourceId > 0 && tab === "content",
  });
  const tree = trpc.knowledge.admin.tree.useQuery(
    { sourceId },
    { enabled: user?.role === "admin" && sourceId > 0 && tab === "content" }
  );
  const [draft, setDraft] = useState(input.query),
    [selected, setSelected] = useState<number[]>([]),
    [bulkCategory, setBulkCategory] = useState<KnowledgeCategory>("basics");
  useEffect(() => {
    setDraft(input.query);
    setSelected([]);
  }, [search]);
  const utils = trpc.useUtils();
  const bulk = trpc.knowledge.admin.bulkEditorial.useMutation({
    onSuccess: r => {
      toast.success(`已更新 ${r.count} 篇内容的编目草稿，尚未发布`);
      setSelected([]);
      void utils.knowledge.admin.catalog.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const data = query.data,
    from = "/operations/knowledge" + (search ? "?" + search : "");
  useEffect(() => {
    if (data) {
      const y = sessionStorage.getItem("knowledge-scroll:" + from);
      if (y) requestAnimationFrame(() => window.scrollTo(0, Number(y)));
    }
  }, [data, from]);
  if (user?.role !== "admin")
    return (
      <PlatformShell>
        <p className="p-10 text-center">仅管理员可访问知识管理。</p>
      </PlatformShell>
    );
  return (
    <PlatformShell>
      <main className="mx-auto max-w-[1440px] px-4 py-7 lg:px-8">
        <Link
          href="/operations"
          className="mb-5 inline-block text-sm text-gray-500"
        >
          ← 运营后台
        </Link>
        <PageHeader
          title="企业知识管理"
          description="整理内容、核对质量，再把确认可共享的版本发布给员工。"
          actions={
            <select
              aria-label="知识来源"
              className={knowledgeInput}
              value={sourceId}
              onChange={e => set({ source: e.target.value })}
            >
              {sources.data?.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          }
        />
        <nav className="mt-6 flex gap-6 border-b" aria-label="管理页签">
          {[
            ["content", "内容管理"],
            ["sync", "来源与同步"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => set({ tab: id })}
              className={`border-b-2 px-1 pb-3 text-sm font-medium ${tab === id ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500"}`}
            >
              {label}
            </button>
          ))}
        </nav>
        {sources.isError ? (
          <p role="alert" className="mt-5">
            来源加载失败。
            <Button variant="outline" onClick={() => void sources.refetch()}>
              重试
            </Button>
          </p>
        ) : tab === "sync" && sourceId ? (
          <KnowledgeSources sourceId={sourceId} />
        ) : (
          <>
            <div className="mt-6 grid grid-cols-3 gap-2 lg:grid-cols-5 lg:gap-3">
              {Object.entries(statusLabels).map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={input.status === id}
                  onClick={() =>
                    set({ status: input.status === id ? "all" : id })
                  }
                  className={`rounded-xl border p-4 text-left ${input.status === id ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white hover:border-indigo-200"}`}
                >
                  <span className="text-sm text-gray-600">{label}</span>
                  <span className="mt-2 block text-2xl font-semibold">
                    {data?.counts[id as keyof typeof data.counts] ?? 0}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-5">
              <KnowledgeTree items={tree.data ?? []} from={from} />
            </div>
            <section className="mt-5 rounded-xl border bg-white p-4 sm:p-5">
              <form
                className="flex flex-wrap gap-2"
                onSubmit={e => {
                  e.preventDefault();
                  set({ q: draft });
                }}
              >
                <input
                  aria-label="搜索文章标题"
                  className={knowledgeInput + " min-w-40 flex-1"}
                  placeholder="搜索文章标题"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                />
                <Button type="submit" variant="outline">
                  搜索
                </Button>
                <select
                  aria-label="栏目"
                  className={knowledgeInput}
                  value={input.category}
                  onChange={e => set({ category: e.target.value })}
                >
                  <option value="all">全部栏目</option>
                  {KNOWLEDGE_CATEGORIES.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="专题"
                  className={knowledgeInput + " max-w-48"}
                  value={input.topic}
                  onChange={e => set({ topic: e.target.value })}
                >
                  <option value="all">全部专题</option>
                  {data?.topics.map(t => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <select
                  aria-label="发布状态"
                  className={knowledgeInput}
                  value={input.status}
                  onChange={e => set({ status: e.target.value })}
                >
                  <option value="all">全部状态</option>
                  {Object.entries(statusLabels).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="内容质量"
                  className={knowledgeInput}
                  value={input.quality}
                  onChange={e => set({ quality: e.target.value })}
                >
                  <option value="all">全部质量</option>
                  <option value="complete">转换完整</option>
                  <option value="incomplete">部分缺失</option>
                  <option value="failed">不可预览</option>
                </select>
              </form>
              {selected.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-indigo-50 p-3 text-sm">
                  <span>已选 {selected.length} 篇</span>
                  <select
                    aria-label="批量栏目"
                    className={knowledgeInput}
                    value={bulkCategory}
                    onChange={e =>
                      setBulkCategory(e.target.value as KnowledgeCategory)
                    }
                  >
                    {KNOWLEDGE_CATEGORIES.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={bulk.isPending}
                    onClick={() =>
                      bulk.mutate({ itemIds: selected, category: bulkCategory })
                    }
                  >
                    设置栏目
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={bulk.isPending}
                    onClick={() =>
                      bulk.mutate({ itemIds: selected, included: true })
                    }
                  >
                    收录草稿
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={bulk.isPending}
                    onClick={() =>
                      bulk.mutate({ itemIds: selected, included: false })
                    }
                  >
                    不收录
                  </Button>
                  <span className="text-xs text-gray-500">
                    仅更新草稿，不执行审核或发布
                  </span>
                </div>
              )}
              {query.isLoading ? (
                <p role="status" className="py-10 text-center">
                  正在加载内容…
                </p>
              ) : query.isError ? (
                <div role="alert" className="py-8 text-center">
                  <p>内容加载失败</p>
                  <Button
                    variant="outline"
                    onClick={() => void query.refetch()}
                  >
                    重试
                  </Button>
                </div>
              ) : !data?.items.length ? (
                <div className="py-10 text-center">
                  <p>没有匹配的内容</p>
                  <Button
                    className="mt-4"
                    variant="outline"
                    onClick={() =>
                      set({
                        q: "",
                        category: "all",
                        topic: "all",
                        status: "all",
                        quality: "all",
                      })
                    }
                  >
                    清空筛选
                  </Button>
                </div>
              ) : (
                <>
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[740px] text-left text-sm">
                      <thead className="border-y bg-gray-50 text-gray-600">
                        <tr>
                          <th className="p-3">
                            <input
                              type="checkbox"
                              aria-label="选择本页"
                              checked={
                                data.items.length > 0 &&
                                data.items.every(i => selected.includes(i.id))
                              }
                              onChange={e =>
                                setSelected(
                                  e.target.checked
                                    ? data.items.map(i => i.id)
                                    : []
                                )
                              }
                            />
                          </th>
                          {[
                            "文章与栏目",
                            "版本",
                            "发布状态",
                            "内容质量",
                            "更新时间",
                            "操作",
                          ].map(h => (
                            <th key={h} className="p-3 font-medium">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map(item => (
                          <tr
                            key={item.id}
                            className="border-b align-top hover:bg-gray-50/70"
                          >
                            <td className="p-3">
                              <input
                                type="checkbox"
                                aria-label={`选择 ${item.title}`}
                                checked={selected.includes(item.id)}
                                onChange={e =>
                                  setSelected(s =>
                                    e.target.checked
                                      ? [...s, item.id]
                                      : s.filter(id => id !== item.id)
                                  )
                                }
                              />
                            </td>
                            <td className="max-w-80 p-3">
                              <p className="font-medium leading-6">
                                {item.title}
                              </p>
                              <p className="mt-1 text-xs text-gray-500">
                                {categoryName(item.editorial.category)}
                                {!item.editorial.included ? " · 未收录" : ""}
                                {item.editorial.reviewedContentId !==
                                item.latest?.id
                                  ? " · 待编目复核"
                                  : ""}
                              </p>
                            </td>
                            <td className="whitespace-nowrap p-3 text-xs leading-6">
                              最新{" "}
                              {item.latest ? "v" + item.latest.versionNo : "—"}
                              <br />
                              发布{" "}
                              {item.publishedVersion
                                ? "v" + item.publishedVersion
                                : "—"}
                            </td>
                            <td className="whitespace-nowrap p-3">
                              {statusLabels[item.status] ?? "暂不可审核"}
                            </td>
                            <td className="whitespace-nowrap p-3">
                              <span
                                className={
                                  item.quality === "complete"
                                    ? "text-gray-600"
                                    : "text-amber-700"
                                }
                              >
                                {item.quality === "complete"
                                  ? "转换完整"
                                  : item.quality === "incomplete"
                                    ? "部分缺失"
                                    : "不可预览"}
                              </span>
                            </td>
                            <td className="whitespace-nowrap p-3 text-xs text-gray-500">
                              {item.sourceUpdatedAt
                                ? new Date(
                                    item.sourceUpdatedAt
                                  ).toLocaleDateString("zh-CN")
                                : "—"}
                            </td>
                            <td className="whitespace-nowrap p-3">
                              <Link
                                className="font-medium text-indigo-700 hover:underline"
                                href={`/operations/knowledge/${item.id}?from=${encodeURIComponent(from)}`}
                                onClick={() =>
                                  sessionStorage.setItem(
                                    "knowledge-scroll:" + from,
                                    String(window.scrollY)
                                  )
                                }
                              >
                                查看并审核 →
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <KnowledgePagination
                    page={data.page}
                    pages={data.pages}
                    total={data.total}
                    onPage={page => {
                      set({ page });
                      window.scrollTo(0, 0);
                    }}
                  />
                </>
              )}
            </section>
          </>
        )}
      </main>
    </PlatformShell>
  );
}
