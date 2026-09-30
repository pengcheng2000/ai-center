import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
export const knowledgeInput =
  "h-10 min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100";
export function useKnowledgeQuery() {
  const search = useSearch();
  const [path, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const set = (changes: Record<string, string | number>, replace = false) => {
    const next = new URLSearchParams(search);
    if (!("page" in changes)) next.delete("page");
    Object.entries(changes).forEach(([k, v]) => {
      if (v === "" || v === "all") next.delete(k);
      else next.set(k, String(v));
    });
    navigate(path + (next.size ? "?" + next.toString() : ""), { replace });
  };
  return { params, search, set };
}
export function KnowledgePagination({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-5 text-sm text-gray-600">
      <span>
        共 {total} 条 · 第 {page} / {pages} 页
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          上一页
        </Button>
        <Button
          variant="outline"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}
export function safeKnowledgeReturn(value: string | null, admin = false) {
  const base = admin ? "/operations/knowledge" : "/learn/knowledge";
  return value && (value === base || value.startsWith(base + "?"))
    ? value
    : base;
}
