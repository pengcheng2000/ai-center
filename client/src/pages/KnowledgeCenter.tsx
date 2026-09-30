import PlatformShell from "@/components/PlatformShell";
import { PageHeader } from "@/components/ProductSurface";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpenText,
  Search,
  Star,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  KNOWLEDGE_CATEGORIES,
  categoryName,
  cleanExcerpt,
} from "@shared/knowledge";
import {
  KnowledgePagination,
  knowledgeInput,
  useKnowledgeQuery,
} from "@/components/knowledge/KnowledgeControls";

export default function KnowledgeCenter() {
  const { params, search, set } = useKnowledgeQuery();
  const q = params.get("q") ?? "",
    category = params.get("category") ?? "all",
    topic = params.get("topic") ?? "all";
  const sort = params.get("sort") === "recent" ? "recent" : "recommended";
  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);
  const request = trpc.knowledge.list.useQuery({
    query: q,
    category,
    topic,
    sort,
    page: Math.max(1, Number(params.get("page")) || 1),
  });
  const data = request.data;
  const listUrl = "/learn/knowledge" + (search ? "?" + search : "");
  useEffect(() => {
    if (data) {
      const y = sessionStorage.getItem("knowledge-scroll:" + listUrl);
      if (y) requestAnimationFrame(() => window.scrollTo(0, Number(y)));
    }
  }, [data, listUrl]);
  const filters = !!q || category !== "all" || topic !== "all";
  return (
    <PlatformShell>
      <main className="mx-auto max-w-[1280px] px-4 py-8 lg:px-8">
        <Link
          href="/learn"
          className="mb-5 inline-flex items-center gap-1 text-sm text-gray-500"
        >
          <ArrowLeft className="h-4 w-4" />
          学习中心
        </Link>
        <PageHeader
          title="知识与案例"
          description="从基础认知到业务实践，找到适合你的下一步。"
        />
        {data?.visibility === "development_preview" && (
          <p className="mt-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
            本机开发预览 · 内容尚未正式发布
          </p>
        )}
        <form
          className="mt-6 flex gap-2"
          onSubmit={e => {
            e.preventDefault();
            set({ q: draft });
          }}
        >
          <label className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input
              aria-label="搜索知识"
              placeholder="搜索标题、简介或专题"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              className={knowledgeInput + " w-full pl-10"}
            />
          </label>
          <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700">
            搜索
          </Button>
        </form>
        <nav
          aria-label="知识栏目"
          className="mt-6 flex max-w-full gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-7"
        >
          {[
            { id: "all", name: "全部", description: "浏览所有知识" },
            ...KNOWLEDGE_CATEGORIES,
          ].map(c => (
            <button
              key={c.id}
              type="button"
              aria-pressed={category === c.id}
              onClick={() => set({ category: c.id, topic: "all" })}
              className={`min-w-28 shrink-0 rounded-xl border px-3 py-3 text-left transition-colors lg:min-w-0 lg:py-4 ${category === c.id ? "border-indigo-500 bg-indigo-50 text-indigo-800" : "border-gray-200 bg-white text-gray-600 hover:border-indigo-200"}`}
            >
              <span className="block text-sm font-semibold">{c.name}</span>
              <span className="mt-2 block text-xs opacity-75">
                {c.id === "all"
                  ? (data?.allCount ?? 0)
                  : (data?.categories.find(x => x.id === c.id)?.count ??
                    0)}{" "}
                篇内容
              </span>
            </button>
          ))}
        </nav>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            {category === "all"
              ? "发现值得阅读的知识"
              : KNOWLEDGE_CATEGORIES.find(c => c.id === category)?.description}
          </p>
          <div className="flex max-w-full gap-2">
            <select
              aria-label="专题"
              className={knowledgeInput + " max-w-52"}
              value={topic}
              onChange={e => set({ topic: e.target.value })}
            >
              <option value="all">全部专题</option>
              {data?.topics.map(t => (
                <option key={t.name} value={t.name}>
                  {t.name}（{t.count}）
                </option>
              ))}
            </select>
            <select
              aria-label="排序"
              className={knowledgeInput}
              value={sort}
              onChange={e => set({ sort: e.target.value })}
            >
              <option value="recommended">推荐排序</option>
              <option value="recent">最近更新</option>
            </select>
          </div>
        </div>
        {request.isError ? (
          <div role="alert" className="mt-8 rounded-xl border p-8 text-center">
            <p>知识列表加载失败，请重试。</p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => void request.refetch()}
            >
              重试
            </Button>
          </div>
        ) : request.isLoading ? (
          <p role="status" className="py-16 text-center text-gray-500">
            正在加载知识…
          </p>
        ) : !data?.items.length ? (
          <div className="mt-6 rounded-xl border border-dashed p-10 text-center">
            <BookOpenText className="mx-auto mb-4 h-7 w-7 text-gray-400" />
            <h2 className="font-semibold">
              {filters ? "没有找到匹配内容" : "暂时没有可阅读的知识"}
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              {filters
                ? "尝试其他关键词，或清空筛选。"
                : "内容整理发布后会出现在这里。"}
            </p>
            {filters && (
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => set({ q: "", category: "all", topic: "all" })}
              >
                清空筛选
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="mt-5 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map(item => (
                <Link
                  key={item.itemId}
                  href={`/learn/knowledge/${item.itemId}?from=${encodeURIComponent(listUrl)}`}
                  onClick={() =>
                    sessionStorage.setItem(
                      "knowledge-scroll:" + listUrl,
                      String(window.scrollY)
                    )
                  }
                  className="group flex min-h-56 min-w-0 flex-col rounded-xl border border-gray-200 bg-white p-5 transition hover:border-indigo-300 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-indigo-600"
                >
                  <div className="flex items-center justify-between text-xs font-medium text-indigo-700">
                    <span>{categoryName(item.editorial?.category)}</span>
                    {item.editorial?.featured && (
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3 w-3" />
                        精选
                      </span>
                    )}
                  </div>
                  <h2 className="mt-3 line-clamp-2 text-lg font-semibold leading-7 text-gray-900 group-hover:text-indigo-700">
                    {item.title}
                  </h2>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-600">
                    {item.editorial?.summary ||
                      cleanExcerpt(item.summary) ||
                      "查看正文与相关资料"}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-5 text-xs text-gray-500">
                    <span>
                      {item.sourceUpdatedAt
                        ? new Date(item.sourceUpdatedAt).toLocaleDateString(
                            "zh-CN"
                          )
                        : ""}
                      {item.renderStatus !== "complete"
                        ? " · 部分内容未展示"
                        : ""}
                    </span>
                    <ArrowUpRight className="h-4 w-4 shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
            <KnowledgePagination
              page={data.page}
              pages={data.pages}
              total={data.total}
              onPage={page => {
                sessionStorage.removeItem("knowledge-scroll:" + listUrl);
                set({ page });
                window.scrollTo(0, 0);
              }}
            />
          </>
        )}
      </main>
    </PlatformShell>
  );
}
