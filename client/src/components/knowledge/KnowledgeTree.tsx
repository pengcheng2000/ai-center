import { Link } from "wouter";
import { useRef } from "react";
type Node = { id: number; parentItemId: number | null; title: string };
export default function KnowledgeTree({
  items,
  selected,
  from,
}: {
  items: Node[];
  selected?: number;
  from: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const ids = new Set(items.map(i => i.id));
  const path = new Set<number>();
  let current = items.find(i => i.id === selected);
  while (current && !path.has(current.id)) {
    path.add(current.id);
    current = items.find(i => i.id === current?.parentItemId);
  }
  function render(parent: number | null, seen: Set<number>): React.ReactNode {
    return items
      .filter(
        i =>
          (i.parentItemId && ids.has(i.parentItemId)
            ? i.parentItemId
            : null) === parent && !seen.has(i.id)
      )
      .map(i => {
        const next = new Set([...seen, i.id]);
        const link = (
          <Link
            aria-current={selected === i.id ? "page" : undefined}
            className={`block rounded p-2 text-sm hover:bg-indigo-50 ${selected === i.id ? "bg-indigo-50 font-semibold text-indigo-700" : "text-gray-600"}`}
            href={`/operations/knowledge/${i.id}?from=${encodeURIComponent(from)}`}
          >
            {i.title}
          </Link>
        );
        return items.some(c => c.parentItemId === i.id) ? (
          <details key={i.id} open={path.has(i.id)} className="ml-2">
            <summary className="cursor-pointer text-sm text-gray-600">
              {i.title}
            </summary>
            {link}
            <div className="border-l pl-2">{render(i.id, next)}</div>
          </details>
        ) : (
          <div key={i.id} className="ml-2">
            {link}
          </div>
        );
      });
  }
  return (
    <details className="rounded-xl border bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium">
        飞书原始目录
      </summary>
      {selected && (
        <button
          type="button"
          className="mt-3 text-sm text-indigo-700"
          onClick={() => {
            const target = container.current?.querySelector<HTMLElement>(
              '[aria-current="page"]'
            );
            if (target && container.current)
              container.current.scrollTop +=
                target.getBoundingClientRect().top -
                container.current.getBoundingClientRect().top -
                8;
          }}
        >
          定位当前文章
        </button>
      )}
      <div
        ref={container}
        className="mt-4 max-h-[65vh] space-y-2 overflow-auto"
      >
        {render(null, new Set())}
      </div>
    </details>
  );
}
