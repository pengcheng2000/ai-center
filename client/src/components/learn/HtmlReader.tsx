import { cn } from "@/lib/utils";
import { ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type HtmlReaderProps = { html: string; title: string; sourceUrl?: string | null; initialPercent?: number; onProgress?: (percent: number) => void };

/** 服务端已清洗快照阅读器：不在客户端重新解析或拼接 HTML，避免把未信任内容引入 DOM。 */
export default function HtmlReader({ html, title, sourceUrl, initialPercent = 0, onProgress }: HtmlReaderProps) {
  const [immersive, setImmersive] = useState(false);
  const hostRef = useRef<HTMLElement>(null);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let reportedPercent = Math.max(0, Math.min(100, initialPercent));
    const measure = () => {
      const max = host.scrollHeight - host.clientHeight;
      const raw = max > 0 ? host.scrollTop / max * 100 : 100;
      const percent = Math.max(0, Math.min(100, Math.round(raw)));
      const bucketPercent = Math.min(100, Math.floor(percent / 20) * 20);
      if (bucketPercent > reportedPercent) { reportedPercent = bucketPercent; onProgressRef.current?.(bucketPercent); }
    };
    measure();
    host.addEventListener("scroll", measure, { passive: true });
    return () => host.removeEventListener("scroll", measure);
  }, [initialPercent]);
  return <div className={cn("overflow-hidden rounded-xl border border-slate-200 bg-white", immersive && "fixed inset-4 z-40 overflow-auto shadow-2xl")}>
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
      <span className="truncate text-xs font-semibold text-violet-700">{title} · HTML 快照</span>
      <div className="flex shrink-0 items-center gap-2">
        {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:underline">打开原站 <ExternalLink className="h-3.5 w-3.5" /></a>}
        <button type="button" onClick={() => setImmersive(value => !value)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-white" aria-label={immersive ? "退出沉浸阅读" : "沉浸阅读"}>{immersive ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}</button>
      </div>
    </div>
    <article ref={hostRef} className={cn("prose prose-slate mx-auto max-w-[52rem] overflow-auto px-6 py-6 prose-headings:font-serif prose-p:leading-7", immersive ? "max-h-[calc(100vh-80px)]" : "max-h-[min(72vh,860px)]")} dangerouslySetInnerHTML={{ __html: html }} aria-label={`${title} HTML 快照`} />
  </div>;
}
