import PlatformShell from "@/components/PlatformShell";
import KnowledgeRenderer from "@/components/knowledge/KnowledgeRenderer";
import { safeKnowledgeReturn } from "@/components/knowledge/KnowledgeControls";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Link, useRoute, useSearch } from "wouter";
import { categoryName } from "@shared/knowledge";
import { Button } from "@/components/ui/button";
export default function KnowledgeDetail() {
  const [, params] = useRoute("/learn/knowledge/:id");
  const from = safeKnowledgeReturn(
    new URLSearchParams(useSearch()).get("from")
  );
  const itemId = Number(params?.id);
  const query = trpc.knowledge.detail.useQuery(
    { id: itemId },
    { enabled: Number.isInteger(itemId) && itemId > 0 }
  );
  const data = query.data;
  return (
    <PlatformShell>
      <main className="mx-auto max-w-[1120px] px-4 py-7 lg:px-8">
        <Link
          href={from}
          className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500"
        >
          <ArrowLeft className="h-4 w-4" />
          知识与案例
        </Link>
        {query.isLoading ? (
          <p role="status">正在加载正文…</p>
        ) : query.isError || !data ? (
          <div role="alert" className="rounded-xl border p-10 text-center">
            <h1 className="text-xl font-semibold">该内容暂不可阅读</h1>
            <p className="mt-3 text-sm text-gray-500">
              内容可能尚未发布、已撤回，或加载失败。
            </p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => void query.refetch()}
            >
              重新加载
            </Button>
          </div>
        ) : (
          <>
            <header className="mb-7 max-w-[800px]">
              <div className="flex flex-wrap gap-2 text-sm text-indigo-700">
                <Link
                  href={`/learn/knowledge?category=${data.editorial.category}`}
                >
                  {categoryName(data.editorial.category)}
                </Link>
                {data.editorial.topic && (
                  <>
                    <span>/</span>
                    <Link
                      href={`/learn/knowledge?topic=${encodeURIComponent(data.editorial.topic)}`}
                    >
                      {data.editorial.topic}
                    </Link>
                  </>
                )}
              </div>
              <h1 className="mt-3 text-2xl font-semibold leading-snug text-gray-900 sm:text-3xl">
                {data.content.titleSnapshot}
              </h1>
              {data.editorial.summary && (
                <p className="mt-3 text-base leading-7 text-gray-600">
                  {data.editorial.summary}
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
                <span>
                  {data.updatedAt
                    ? new Date(data.updatedAt).toLocaleDateString("zh-CN")
                    : ""}{" "}
                  · 第 {data.content.versionNo} 版
                </span>
                {data.visibility === "development_preview" && (
                  <span className="text-amber-700">开发预览 · 未发布</span>
                )}
                {data.item.sourceUrl && (
                  <a
                    href={data.item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-700"
                  >
                    查看飞书原文
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </header>
            {data.children.length > 0 && (
              <details
                className="mb-6 rounded-lg border p-4"
                open={!data.content.bodyMarkdown?.trim()}
              >
                <summary className="cursor-pointer text-sm font-medium">
                  相关子页面（{data.children.length}）
                </summary>
                <nav
                  aria-label="子页面"
                  className="mt-4 grid gap-3 sm:grid-cols-2"
                >
                  {data.children.map(c => (
                    <Link
                      className="rounded-lg border p-4 text-indigo-700 hover:bg-indigo-50"
                      key={c.id}
                      href={`/learn/knowledge/${c.id}?from=${encodeURIComponent(from)}`}
                    >
                      {c.title}
                    </Link>
                  ))}
                </nav>
              </details>
            )}
            <KnowledgeRenderer
              key={data.content.id}
              content={data.content}
              itemId={data.item.id}
              links={data.links}
            />
            {(data.previous || data.next) && (
              <nav
                aria-label="专题阅读"
                className="mt-10 grid gap-4 border-t pt-6 sm:grid-cols-2"
              >
                {[
                  ["上一篇", data.previous],
                  ["下一篇", data.next],
                ].map(([label, value]) => {
                  const row = value as typeof data.previous;
                  return row ? (
                    <Link
                      key={String(label)}
                      href={`/learn/knowledge/${row.id}?from=${encodeURIComponent(from)}`}
                      onClick={() => window.scrollTo(0, 0)}
                      className="rounded-xl border p-4 hover:border-indigo-300"
                    >
                      <span className="text-xs text-gray-500">
                        {String(label)}
                      </span>
                      <p className="mt-2 text-sm font-medium">{row.title}</p>
                    </Link>
                  ) : (
                    <div key={String(label)} />
                  );
                })}
              </nav>
            )}
          </>
        )}
      </main>
    </PlatformShell>
  );
}
