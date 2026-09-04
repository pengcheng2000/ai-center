import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

export type ProductTone = "neutral" | "learning" | "work" | "community" | "news" | "graphite";

export const PRODUCT_TONE_CLASSES: Record<ProductTone, { surface: string; icon: string; text: string; button: string }> = {
  neutral: { surface: "bg-gray-50", icon: "bg-gray-100 text-gray-600", text: "text-gray-700", button: "bg-gray-900 text-white hover:bg-gray-800" },
  learning: { surface: "bg-indigo-50/60", icon: "bg-indigo-100 text-indigo-600", text: "text-indigo-600", button: "bg-indigo-600 text-white hover:bg-indigo-700" },
  work: { surface: "bg-orange-50/60", icon: "bg-orange-100 text-orange-600", text: "text-orange-600", button: "bg-orange-500 text-white hover:bg-orange-600" },
  community: { surface: "bg-emerald-50/60", icon: "bg-emerald-100 text-emerald-600", text: "text-emerald-600", button: "bg-emerald-600 text-white hover:bg-emerald-700" },
  news: { surface: "bg-blue-50/60", icon: "bg-blue-100 text-blue-600", text: "text-blue-600", button: "bg-blue-600 text-white hover:bg-blue-700" },
  graphite: { surface: "bg-gray-900 text-white", icon: "bg-white/10 text-white", text: "text-gray-200", button: "bg-white text-gray-900 hover:bg-gray-100" },
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
        <h1 className={cn("font-semibold tracking-[-0.03em] text-gray-900", compact ? "mt-1 text-2xl" : "mt-1.5 text-2xl md:text-3xl")}>{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">{description}</p>}
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
      <span className={cn("grid size-9 place-items-center rounded-lg", visual.icon)}><Icon className="size-4" /></span>
      <p className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-gray-900">{value}</p>
      <p className="mt-1 text-sm font-medium text-gray-700">{label}</p>
      {note && <p className="mt-1 text-xs leading-5 text-gray-400">{note}</p>}
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
    <div className={cn("grid min-h-44 place-items-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-6 py-8 text-center", className)}>
      <div>
        <span className="mx-auto grid size-10 place-items-center rounded-lg bg-white text-gray-400 ring-1 ring-gray-100"><Icon className="size-4" /></span>
        <p className="mt-4 font-semibold text-gray-800">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-gray-500">{description}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}
