import { cn } from "@/lib/utils";

export default function PageSkeleton({
  cards = 3,
  compact = false,
}: {
  cards?: number;
  compact?: boolean;
}) {
  return (
    <main
      aria-busy="true"
      aria-label="页面加载中"
      className={cn(
        "mx-auto w-full max-w-[1440px] animate-pulse px-4 lg:px-7",
        compact ? "py-5" : "py-8"
      )}
    >
      <span className="sr-only">正在加载页面内容</span>
      <div className="h-3 w-28 rounded-full bg-slate-200" />
      <div className="mt-4 h-9 w-64 max-w-[75%] rounded-xl bg-slate-200" />
      <div className="mt-3 h-4 w-[30rem] max-w-full rounded-full bg-slate-100" />
      <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }, (_, index) => (
          <div
            key={index}
            className="product-surface p-5"
          >
            <div className="h-36 rounded-xl bg-slate-100" />
            <div className="mt-5 h-5 w-3/4 rounded-full bg-slate-200" />
            <div className="mt-3 h-3 w-full rounded-full bg-slate-100" />
            <div className="mt-2 h-3 w-2/3 rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    </main>
  );
}
