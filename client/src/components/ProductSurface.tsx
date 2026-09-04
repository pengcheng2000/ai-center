import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

export type ProductTone = "neutral" | "learning" | "work" | "community" | "news" | "graphite";

export const PRODUCT_TONE_CLASSES: Record<ProductTone, { surface: string; icon: string; text: string }> = {
  neutral: { surface: "bg-white", icon: "bg-slate-100 text-slate-700", text: "text-slate-700" },
  learning: { surface: "bg-violet-50/70", icon: "bg-violet-100 text-violet-700", text: "text-violet-700" },
  work: { surface: "bg-orange-50/70", icon: "bg-orange-100 text-orange-700", text: "text-orange-700" },
  community: { surface: "bg-emerald-50/70", icon: "bg-emerald-100 text-emerald-700", text: "text-emerald-700" },
  news: { surface: "bg-indigo-50/70", icon: "bg-indigo-100 text-indigo-700", text: "text-indigo-700" },
  graphite: { surface: "bg-slate-900 text-white", icon: "bg-white/10 text-white", text: "text-slate-200" },
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  compact = false,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col justify-between gap-5 sm:flex-row sm:items-end", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="section-kicker">{eyebrow}</p>}
        <h1 className={cn("font-semibold tracking-[-0.045em] text-slate-900", compact ? "mt-1 text-3xl" : "mt-2 text-3xl md:text-5xl")}>{title}</h1>
        {description && <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500 md:text-[15px] md:leading-7">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SurfaceCard({
  tone = "neutral",
  interactive = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: ProductTone; interactive?: boolean }) {
  return <div className={cn("product-surface", PRODUCT_TONE_CLASSES[tone].surface, interactive && "product-surface-interactive", className)} {...props} />;
}

export function MetricCard({ icon: Icon, label, value, note, tone = "neutral", className }: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: ProductTone;
  className?: string;
}) {
  const visual = PRODUCT_TONE_CLASSES[tone];
  return (
    <SurfaceCard className={cn("p-5", className)}>
      <span className={cn("grid size-9 place-items-center rounded-xl", visual.icon)}><Icon className="size-4" /></span>
      <p className="mt-5 text-3xl font-semibold tracking-[-0.045em] text-slate-900">{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-700">{label}</p>
      {note && <p className="mt-1 text-xs leading-5 text-slate-400">{note}</p>}
    </SurfaceCard>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }: {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid min-h-44 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-8 text-center", className)}>
      <div>
        <span className="mx-auto grid size-10 place-items-center rounded-xl bg-white text-slate-500 shadow-sm"><Icon className="size-4" /></span>
        <p className="mt-4 font-semibold text-slate-800">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">{description}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}
