import { cn } from "@/lib/utils";

export function BrandWordmark({
  compact = false,
  centered = false,
  className,
}: {
  compact?: boolean;
  centered?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 flex-col",
        centered && "items-center text-center",
        className
      )}
    >
      <span className="block text-[21px] font-semibold leading-none tracking-[-0.055em] text-slate-900 sm:text-[23px]">
        Chint<span className="text-[#237ae4]">AI</span>
      </span>
      {!compact && (
        <span className="mt-1 block text-[9px] font-semibold tracking-[.12em] text-slate-400">
          全员 AI 能力提升平台
        </span>
      )}
    </span>
  );
}
