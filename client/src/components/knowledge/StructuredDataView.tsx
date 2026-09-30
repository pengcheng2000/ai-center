import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
type StructuredContent = {
  id: number;
  structuredSchema?: Record<string, unknown> | null;
  structuredData?: Record<string, unknown> | null;
  structuredPreview?: Record<string, unknown> | null;
  rowCount?: number | null;
  columnCount?: number | null;
};
export default function StructuredDataView({
  content,
  itemId,
  admin = false,
}: {
  content: StructuredContent;
  itemId?: number;
  admin?: boolean;
}) {
  const [groupIndex, setGroupIndex] = useState(0),
    [page, setPage] = useState(0);
  const groups = (content.structuredSchema?.groups ??
    content.structuredPreview?.groups ??
    []) as Array<{ name?: string; title?: string }>;
  const input = { contentId: content.id, groupIndex, page, pageSize: 50 };
  const viewer = trpc.knowledge.structuredPage.useQuery(
    { ...input, itemId: itemId ?? 0 },
    { enabled: !admin && !!itemId }
  );
  const operator = trpc.knowledge.admin.structuredPage.useQuery(input, {
    enabled: admin,
  });
  const query = admin ? operator : viewer;
  const data = query.data;
  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap gap-2" aria-label="工作表">
        {groups.map((g, i) => (
          <Button
            key={i}
            variant={i === groupIndex ? "default" : "outline"}
            onClick={() => {
              setGroupIndex(i);
              setPage(0);
            }}
          >
            {g.name ?? g.title ?? `数据表 ${i + 1}`}
          </Button>
        ))}
      </div>
      {query.isError ? (
        <div role="alert" className="rounded-lg border p-5">
          {query.error.message}
          <Button
            variant="outline"
            className="ml-3"
            onClick={() => void query.refetch()}
          >
            重试
          </Button>
        </div>
      ) : query.isLoading ? (
        <p role="status">正在加载表格…</p>
      ) : !data?.rows.length ? (
        <p>该数据表暂无记录。</p>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            {data.total} 条记录 · {data.columns.length} 列
            <span className="ml-2 text-xs sm:hidden">左右滑动查看全部列</span>
          </p>
          <div
            className="max-h-[65vh] overflow-auto rounded-lg border"
            tabIndex={0}
            aria-label="数据表，可横向滚动"
          >
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  {data.columns.map((c, i) => (
                    <th
                      key={i}
                      className="whitespace-nowrap border-b px-4 py-3 font-medium"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {data.columns.map((_, j) => (
                      <td
                        key={j}
                        className="min-w-32 max-w-80 whitespace-pre-wrap break-words px-4 py-3 align-top"
                      >
                        {row[j]?.map((part, k) =>
                          part.href ? (
                            <a
                              key={k}
                              href={part.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-700 underline"
                            >
                              {part.text}
                            </a>
                          ) : (
                            <span key={k}>{part.text}</span>
                          )
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>
              第 {page + 1} / {Math.max(1, Math.ceil(data.total / 50))} 页
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page === 0 || query.isFetching}
                onClick={() => setPage(p => p - 1)}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                disabled={(page + 1) * 50 >= data.total || query.isFetching}
                onClick={() => setPage(p => p + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
