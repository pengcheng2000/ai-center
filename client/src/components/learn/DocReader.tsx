// 图文学习阅读器：沉浸模式（全屏 + 限宽排版 + 可调字号）+ 滚动深度记进度 + 顶部阅读进度条。
import { clampPercent } from "@/lib/learnExperience";
import { cn } from "@/lib/utils";
import { BookOpenText, Loader2, Maximize2, Minimize2, Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";

export type DocReaderProps = {
  content: string;
  title: string;
  initialPercent?: number;
  onProgress: (percent: number) => void;
};

const FONT_SIZES = ["text-[15px]", "text-[17px]", "text-[19px]"];

export default function DocReader({ content, title, initialPercent = 0, onProgress }: DocReaderProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastReportRef = useRef(clampPercent(initialPercent));
  // 父组件每次渲染都会传入新的 inline onProgress；经 ref 转发，避免滚动测量 effect
  // 随回调身份反复重建（重建即重复 measure 并可能重复上报进度，参见 VideoPlayer 的同类注释）。
  const onProgressRef = useRef(onProgress);
  useEffect(() => { onProgressRef.current = onProgress; });
  const [percent, setPercent] = useState(clampPercent(initialPercent));
  const [immersive, setImmersive] = useState(false);
  const [fontStep, setFontStep] = useState(1);
  const [chromeVisible, setChromeVisible] = useState(true);

  // 滚动深度 = 已滚过高度 / 可滚动总高度；内容不足一屏视为 100%。
  // 依赖为空：宿主节点与回调都经 ref 读取，effect 只在挂载时建立一次测量。
  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    const measure = () => {
      const scrollable = host.scrollHeight - host.clientHeight;
      const value = scrollable <= 0 ? 100 : clampPercent((host.scrollTop / scrollable) * 100);
      setPercent(current => Math.max(current, value));
      // 每 20% 上报一次，避免拖动滚动条时打爆接口。
      const bucket = Math.round(value / 20) * 20;
      if (bucket > lastReportRef.current) { lastReportRef.current = bucket; onProgressRef.current(bucket); }
    };
    measure();
    host.addEventListener("scroll", measure, { passive: true });
    return () => host.removeEventListener("scroll", measure);
  }, []);

  // 沉浸模式：优先系统全屏；滚动时自动隐藏顶栏。
  const toggleImmersive = useCallback(async () => {
    const el = containerRef.current; if (!el) return;
    if (!immersive) {
      try { await el.requestFullscreen(); } catch { /* 拒绝时退化为页面内沉浸层 */ }
      setImmersive(true);
    } else {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      setImmersive(false);
    }
  }, [immersive]);

  useEffect(() => {
    const onFullscreenChange = () => { if (!document.fullscreenElement) setImmersive(false); };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!immersive) { setChromeVisible(true); return; }
    let timer = window.setTimeout(() => setChromeVisible(false), 2500);
    const host = hostRef.current;
    const wake = () => { setChromeVisible(true); window.clearTimeout(timer); timer = window.setTimeout(() => setChromeVisible(false), 2500); };
    window.addEventListener("mousemove", wake);
    host?.addEventListener("scroll", wake, { passive: true });
    return () => { window.clearTimeout(timer); window.removeEventListener("mousemove", wake); host?.removeEventListener("scroll", wake); };
  }, [immersive]);

  const toolbar = <div className="flex items-center justify-between gap-3">
    <span className={cn("flex items-center gap-1.5 text-xs font-semibold", immersive ? "text-slate-700" : "text-violet-600")}><BookOpenText className="h-3.5 w-3.5" />{title} · 已读 {percent}%</span>
    <div className="flex items-center gap-1">
      <button onClick={() => setFontStep(step => Math.max(0, step - 1))} aria-label="缩小字号" className={cn("grid h-8 w-8 place-items-center rounded-lg transition", immersive ? "hover:bg-slate-100" : "text-violet-700 hover:bg-violet-50")}><Minus className="h-3.5 w-3.5" /></button>
      <span className={cn("w-12 text-center text-[11px] font-semibold", immersive ? "text-slate-300" : "text-slate-500")}>{["小", "标准", "大"][fontStep]}</span>
      <button onClick={() => setFontStep(step => Math.min(2, step + 1))} aria-label="放大字号" className={cn("grid h-8 w-8 place-items-center rounded-lg transition", immersive ? "hover:bg-slate-100" : "text-violet-700 hover:bg-violet-50")}><Plus className="h-3.5 w-3.5" /></button>
      <button onClick={() => void toggleImmersive()} className="ml-2 flex h-8 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white transition hover:bg-violet-500">
        {immersive ? <><Minimize2 className="h-3.5 w-3.5" />退出沉浸</> : <><Maximize2 className="h-3.5 w-3.5" />沉浸阅读</>}
      </button>
    </div>
  </div>;

  return <div ref={containerRef} className={cn(immersive ? "fixed inset-0 z-40 flex flex-col bg-gray-50" : "overflow-hidden rounded-xl border border-gray-200 bg-white")}>
    <div className={cn("h-1 w-full shrink-0 bg-gray-100", immersive && "bg-indigo-100")}><div className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 transition-[width]" style={{ width: `${percent}%` }} /></div>

    {/* 工具栏：普通模式常驻；沉浸模式悬浮顶部自动隐藏 */}
    {immersive
      ? <div className={cn("pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 transition-opacity duration-300", chromeVisible ? "opacity-100" : "opacity-0")}>
        <div className="pointer-events-auto rounded-2xl border border-white/80 bg-white/92 px-4 py-2 shadow-xl backdrop-blur-xl">{toolbar}</div>
      </div>
      : <div className="border-b border-gray-100 px-5 py-2.5">{toolbar}</div>}

    {/* 正文：限宽 42rem 舒适行长，字号可调 */}
    <div ref={hostRef} className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-6", immersive ? "bg-gray-50" : "bg-white")} style={immersive ? undefined : { maxHeight: "min(72vh, 860px)" }}>
      <article className={cn("prose prose-gray mx-auto max-w-[42rem] prose-headings:font-serif prose-p:leading-[1.95]", FONT_SIZES[fontStep])}>
        <Streamdown>{content}</Streamdown>
      </article>
      {immersive && <p className="mx-auto mt-8 max-w-[42rem] text-center text-xs text-slate-400">— 已读完本篇 · 滚动或按 Esc 退出 —</p>}
    </div>

    {immersive && <button onClick={() => void toggleImmersive()} aria-label="退出沉浸" className={cn("absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full transition", chromeVisible ? "opacity-100" : "opacity-0")}><X className="h-4 w-4 text-slate-500" /></button>}
    {!immersive && percent === 0 && <div className="grid place-items-center py-10 text-slate-300"><Loader2 className="h-4 w-4 animate-spin" /></div>}
  </div>;
}
