import { BrainCircuit, Compass, FileText, Lightbulb, Rocket, Sparkles, Wrench, Workflow, type LucideIcon } from "lucide-react";

const ICONS: LucideIcon[] = [Sparkles, Workflow, BrainCircuit, Wrench, FileText, Lightbulb, Compass, Rocket];

const HUES = [
  "bg-violet-50 text-violet-700",
  "bg-indigo-50 text-indigo-700",
  "bg-sky-50 text-sky-700",
  "bg-emerald-50 text-emerald-700",
  "bg-amber-50 text-amber-700",
  "bg-rose-50 text-rose-700",
  "bg-cyan-50 text-cyan-700",
  "bg-fuchsia-50 text-fuchsia-700",
];

function hashKey(key: string) {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) | 0;
  return Math.abs(hash);
}

/** 从 skillKey 确定性派生图标与色调，保证列表与详情页呈现同一身份，且无需改动数据结构 */
export function skillVisual(skillKey: string) {
  const hash = hashKey(skillKey);
  return { Icon: ICONS[hash % ICONS.length], hue: HUES[(hash >> 4) % HUES.length] };
}

export function formatBytes(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
