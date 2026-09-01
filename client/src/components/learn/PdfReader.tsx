// PDF 沉浸阅读器：全屏沉浸模式 + fit-width 自适应 + 单页/连续滚动双模式 +
// 键盘导航 + 高分屏高清渲染 + 拖选标注（坐标归一化，跨缩放还原）。
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ANNOTATION_COLOR_CLASSES, pdfPercent } from "@/lib/learnExperience";
import { cn } from "@/lib/utils";
import {
  BookOpenText, ChevronDown, ChevronUp, Highlighter, Loader2,
  Maximize2, Minimize2, Minus, MousePointer2, Plus, Rows3, Square, StickyNote, Trash2, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type Annotation = { id: number; materialId: number; page: number; rects: Array<{ x: number; y: number; w: number; h: number }>; note: string; color: string; createdAt: Date; updatedAt: Date };

export type PdfReaderProps = {
  materialId: number;
  src: string;
  annotations: Annotation[];
  resumePage: number | null;
  onProgress: (payload: { page: number; totalPages: number }) => void;
};

type DraftRect = { x: number; y: number; w: number; h: number };
type PdfDoc = { numPages: number; getPage: (page: number) => Promise<PdfPage> };
type PdfPage = { getViewport: (options: { scale: number }) => { width: number; height: number }; render: (options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> } };

const DPR = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

// ---------- 单页画布：负责一页的渲染（含高分屏倍频） ----------
function PageCanvas({ doc, page, scale, onRendered }: { doc: PdfDoc; page: number; scale: number; onRendered?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pdfPage = await doc.getPage(page);
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      canvas.width = viewport.width * DPR; canvas.height = viewport.height * DPR;
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      setSize({ w: viewport.width, h: viewport.height });
      await pdfPage.render({ canvasContext: context, viewport }).promise;
      if (!cancelled) onRendered?.();
    })();
    return () => { cancelled = true; };
  }, [doc, page, scale, onRendered]);
  return <canvas ref={canvasRef} className="block rounded-lg shadow-2xl shadow-black/40" style={{ width: size?.w, height: size?.h, visibility: size ? "visible" : "hidden" }} />;
}

export default function PdfReader({ materialId, src, annotations, resumePage, onProgress }: PdfReaderProps) {
  const docRef = useRef<PdfDoc | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const progressRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(resumePage ?? 1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.25);
  const [mode, setMode] = useState<"page" | "scroll">("scroll");
  const [immersive, setImmersive] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [annotateMode, setAnnotateMode] = useState(false);
  const [color, setColor] = useState<keyof typeof ANNOTATION_COLOR_CLASSES>("amber");
  const [activeAnnotationId, setActiveAnnotationId] = useState<number | null>(null);
  const [pending, setPending] = useState<{ page: number; rect: DraftRect } | null>(null);
  const [note, setNote] = useState("");
  const dragRef = useRef<{ page: number; startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const [dragRect, setDragRect] = useState<DraftRect | null>(null);

  const utils = trpc.useUtils();
  const addAnnotation = trpc.platform.learning.addAnnotation.useMutation({ onSuccess: () => { setPending(null); setNote(""); void utils.platform.learning.courseExperience.invalidate(); } });
  const deleteAnnotation = trpc.platform.learning.deleteAnnotation.useMutation({ onSuccess: () => { void utils.platform.learning.courseExperience.invalidate(); } });

  const reportPage = useCallback((next: number, total: number) => {
    if (next === progressRef.current || total <= 0 || next < 1 || next > total) return;
    progressRef.current = next;
    setPage(next);
    onProgress({ page: next, totalPages: total });
  }, [onProgress]);

  // 加载文档；scale 初次按阅读区宽度自适应（fit-width，留 48px 呼吸边距）。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;
        const doc = await pdfjs.getDocument({ url: src }).promise as unknown as PdfDoc;
        if (cancelled) { void (doc as unknown as { destroy?: () => Promise<void> }).destroy?.(); return; }
        docRef.current = doc;
        setTotalPages(doc.numPages);
        const width = viewerRef.current?.clientWidth ?? 800;
        const first = await doc.getPage(1);
        const fit = (width - 48) / first.getViewport({ scale: 1 }).width;
        setScale(Math.max(0.5, Math.min(2.5, fit)));
        setReady(true);
        reportPage(resumePage && resumePage >= 1 && resumePage <= doc.numPages ? resumePage : 1, doc.numPages);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "PDF 加载失败");
      }
    })();
    return () => { cancelled = true; const doc = docRef.current as unknown as { destroy?: () => Promise<void> } | null; void doc?.destroy?.(); docRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // 沉浸模式：优先系统全屏，失败（如被拒绝）退化为页面内固定层。
  const toggleImmersive = useCallback(async () => {
    const el = containerRef.current; if (!el) return;
    if (!immersive) {
      try { await el.requestFullscreen(); } catch { /* 浏览器拒绝时仍使用页面内沉浸层 */ }
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

  // 沉浸模式下鼠标静止 2.5s 自动隐藏工具栏。
  useEffect(() => {
    if (!immersive) { setToolbarVisible(true); return; }
    let timer = window.setTimeout(() => setToolbarVisible(false), 2500);
    const wake = () => { setToolbarVisible(true); window.clearTimeout(timer); timer = window.setTimeout(() => setToolbarVisible(false), 2500); };
    window.addEventListener("mousemove", wake);
    window.addEventListener("keydown", wake);
    return () => { window.clearTimeout(timer); window.removeEventListener("mousemove", wake); window.removeEventListener("keydown", wake); };
  }, [immersive]);

  const goTo = useCallback((next: number, smooth = false) => {
    if (!docRef.current) return;
    const clamped = Math.max(1, Math.min(docRef.current.numPages, next));
    const target = pageRefs.current.get(clamped);
    if (target && mode === "scroll") target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    reportPage(clamped, docRef.current.numPages);
  }, [mode, reportPage]);

  // 键盘：←/→/PageUp/PageDown 翻页，+/- 缩放，F 沉浸，Esc 由浏览器处理。
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable) return;
      if (!docRef.current) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") goTo(page + 1, true);
      else if (event.key === "ArrowLeft" || event.key === "PageUp") goTo(page - 1, true);
      else if (event.key === "+" || event.key === "=") setScale(value => Math.min(2.5, value + 0.15));
      else if (event.key === "-") setScale(value => Math.max(0.5, value - 0.15));
      else if (event.key.toLowerCase() === "f") void toggleImmersive();
      else if (event.key.toLowerCase() === "a") setAnnotateMode(value => !value);
    };
    if (immersive || containerRef.current?.matches(":hover")) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goTo, page, immersive, toggleImmersive]);

  // 连续滚动模式：IntersectionObserver 找到视口顶部最近的一页作为当前页。
  useEffect(() => {
    if (!ready || mode !== "scroll" || !viewerRef.current || !docRef.current) return;
    const viewer = viewerRef.current;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) {
        const pageNumber = Number((visible.target as HTMLElement).dataset.page);
        if (pageNumber) reportPage(pageNumber, docRef.current!.numPages);
      }
    }, { root: viewer, threshold: 0.2 });
    pageRefs.current.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [ready, mode, totalPages, reportPage]);

  // ---------- 标注拖选（归一化到所在页容器） ----------
  const onPagePointerDown = (pageNumber: number) => (event: React.PointerEvent) => {
    if (!annotateMode || event.button !== 0) return;
    const host = (event.currentTarget as HTMLElement);
    const rect = host.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { page: pageNumber, startX: (event.clientX - rect.left) / rect.width, startY: (event.clientY - rect.top) / rect.height, currentX: (event.clientX - rect.left) / rect.width, currentY: (event.clientY - rect.top) / rect.height };
  };
  const onPagePointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current; if (!drag) return;
    const host = (event.currentTarget as HTMLElement);
    const rect = host.getBoundingClientRect();
    dragRef.current = { ...drag, currentX: (event.clientX - rect.left) / rect.width, currentY: (event.clientY - rect.top) / rect.height };
    setDragRect({ x: Math.min(drag.startX, dragRef.current.currentX), y: Math.min(drag.startY, dragRef.current.currentY), w: Math.abs(dragRef.current.currentX - drag.startX), h: Math.abs(dragRef.current.currentY - drag.startY) });
  };
  const onPagePointerUp = (pageNumber: number) => () => {
    const drag = dragRef.current; if (!drag || drag.page !== pageNumber) { dragRef.current = null; return; }
    dragRef.current = null;
    const rect = { x: Math.min(drag.startX, drag.currentX), y: Math.min(drag.startY, drag.currentY), w: Math.abs(drag.currentX - drag.startX), h: Math.abs(drag.currentY - drag.startY) };
    setDragRect(null);
    if (rect.w > 0.01 && rect.h > 0.008) setPending({ page: pageNumber, rect });
  };

  const annotationsByPage = useMemo(() => {
    const map = new Map<number, Annotation[]>();
    annotations.forEach(item => { const list = map.get(item.page) ?? []; list.push(item); map.set(item.page, list); });
    return map;
  }, [annotations]);
  const pageAnnotations = annotationsByPage.get(page) ?? [];

  // 每一页的渲染节点（单页与连续模式复用），含标注覆盖层。
  const renderPageNode = (pageNumber: number) => {
    const doc = docRef.current; if (!doc) return null;
    const list = annotationsByPage.get(pageNumber) ?? [];
    return <div
      key={pageNumber}
      data-page={pageNumber}
      ref={node => { if (node) pageRefs.current.set(pageNumber, node); else pageRefs.current.delete(pageNumber); }}
      className={cn("relative mx-auto w-fit", annotateMode && "cursor-crosshair")}
      onPointerDown={onPagePointerDown(pageNumber)}
      onPointerMove={onPagePointerMove}
      onPointerUp={onPagePointerUp(pageNumber)}
    >
      <PageCanvas doc={doc} page={pageNumber} scale={scale} />
      <div className="pointer-events-none absolute -top-7 right-0 rounded-md bg-slate-900/70 px-2 py-0.5 text-[10px] font-semibold text-white">{pageNumber} / {totalPages}</div>
      {list.map(annotation => annotation.rects.map((rect, index) => <div
        key={`${annotation.id}-${index}`}
        title={annotation.note}
        onClick={event => { event.stopPropagation(); setActiveAnnotationId(annotation.id === activeAnnotationId ? null : annotation.id); }}
        className={cn("absolute cursor-pointer rounded-sm border-2 border-dashed transition", ANNOTATION_COLOR_CLASSES[annotation.color]?.fill ?? ANNOTATION_COLOR_CLASSES.amber.fill, annotation.id === activeAnnotationId ? ANNOTATION_COLOR_CLASSES[annotation.color]?.border : "border-transparent")}
        style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
      />))}
      {dragRect && dragRef.current?.page === pageNumber && <div className="pointer-events-none absolute border-2 border-violet-500 bg-violet-300/30" style={{ left: `${dragRect.x * 100}%`, top: `${dragRect.y * 100}%`, width: `${dragRect.w * 100}%`, height: `${dragRect.h * 100}%` }} />}
      {pending?.page === pageNumber && <div className="absolute border-2 border-dashed border-violet-500 bg-violet-300/30" style={{ left: `${pending.rect.x * 100}%`, top: `${pending.rect.y * 100}%`, width: `${pending.rect.w * 100}%`, height: `${pending.rect.h * 100}%` }} />}
    </div>;
  };

  if (error) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">PDF 无法加载：{error}。可尝试刷新或联系内容负责人。</div>;

  const toolbar = <div className={cn("flex flex-wrap items-center gap-1.5 transition-all duration-300", immersive ? "pointer-events-auto rounded-xl border border-white/10 bg-slate-900/90 px-3 py-2 text-slate-200 shadow-2xl backdrop-blur" : "rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-slate-700 shadow-sm backdrop-blur")}>
    <button onClick={() => goTo(page - 1, true)} disabled={page <= 1} aria-label="上一页" className={cn("grid h-8 w-8 place-items-center rounded-lg transition", immersive ? "hover:bg-white/10" : "hover:bg-slate-100")}><ChevronUp className="h-4 w-4" /></button>
    <input
      value={page}
      onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1) goTo(value, true); }}
      className={cn("h-8 w-12 rounded-md border text-center font-mono text-xs tabular-nums outline-none", immersive ? "border-white/15 bg-white/10 text-white" : "border-slate-200 bg-white")}
      aria-label="页码"
    />
    <span className={cn("text-xs", immersive ? "text-slate-400" : "text-slate-500")}>/ {totalPages || "…"}</span>
    <button onClick={() => goTo(page + 1, true)} disabled={page >= totalPages} aria-label="下一页" className={cn("grid h-8 w-8 place-items-center rounded-lg transition", immersive ? "hover:bg-white/10" : "hover:bg-slate-100")}><ChevronDown className="h-4 w-4" /></button>
    <span className={cn("mx-1 h-5 w-px", immersive ? "bg-white/15" : "bg-slate-200")} />
    <button onClick={() => setScale(value => Math.max(0.5, value - 0.15))} aria-label="缩小" className={cn("grid h-8 w-8 place-items-center rounded-lg transition", immersive ? "hover:bg-white/10" : "hover:bg-slate-100")}><Minus className="h-4 w-4" /></button>
    <span className="min-w-10 text-center font-mono text-xs tabular-nums">{Math.round(scale * 100)}%</span>
    <button onClick={() => setScale(value => Math.min(2.5, value + 0.15))} aria-label="放大" className={cn("grid h-8 w-8 place-items-center rounded-lg transition", immersive ? "hover:bg-white/10" : "hover:bg-slate-100")}><Plus className="h-4 w-4" /></button>
    <span className={cn("mx-1 h-5 w-px", immersive ? "bg-white/15" : "bg-slate-200")} />
    <button onClick={() => setMode(value => value === "scroll" ? "page" : "scroll")} title={mode === "scroll" ? "切换到单页模式" : "切换到连续滚动"} className={cn("flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition", immersive ? "hover:bg-white/10" : "hover:bg-slate-100")}>
      {mode === "scroll" ? <><Square className="h-3.5 w-3.5" />单页</> : <><Rows3 className="h-3.5 w-3.5" />连续</>}
    </button>
    <button onClick={() => setAnnotateMode(value => !value)} title="标注模式（快捷键 A）" className={cn("flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition", annotateMode ? "bg-violet-600 text-white" : immersive ? "hover:bg-white/10" : "hover:bg-slate-100")}>
      {annotateMode ? <Highlighter className="h-3.5 w-3.5" /> : <MousePointer2 className="h-3.5 w-3.5" />}{annotateMode ? "标注中" : "选择"}
    </button>
    {annotateMode && <div className="flex items-center gap-1">{(Object.keys(ANNOTATION_COLOR_CLASSES) as Array<keyof typeof ANNOTATION_COLOR_CLASSES>).map(key => <button key={key} onClick={() => setColor(key)} aria-label={ANNOTATION_COLOR_CLASSES[key].label} className={cn("h-5 w-5 rounded-full border-2 transition", ANNOTATION_COLOR_CLASSES[key].dot, color === key ? "scale-110 border-slate-900 dark:border-white" : "border-white")} />)}</div>}
    <button onClick={() => void toggleImmersive()} title="沉浸阅读（快捷键 F）" className={cn("ml-auto flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition", immersive ? "bg-violet-600 text-white hover:bg-violet-500" : "bg-violet-50 text-violet-700 hover:bg-violet-100")}>
      {immersive ? <><Minimize2 className="h-3.5 w-3.5" />退出沉浸</> : <><Maximize2 className="h-3.5 w-3.5" />沉浸阅读</>}
    </button>
  </div>;

  return <div className={cn(immersive ? "fixed inset-0 z-[60] flex flex-col gap-3 bg-slate-900 p-3" : "grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]")}>
    <div ref={containerRef} className={cn("flex min-h-0 flex-1 flex-col", immersive ? "p-3" : "")}>
      {/* 工具栏：普通模式常驻在阅读区上方；沉浸模式悬浮居中、自动隐藏 */}
      {immersive ? <div className={cn("pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 transition-opacity duration-300", toolbarVisible ? "opacity-100" : "opacity-0")}>{toolbar}</div> : <div className="mb-3">{toolbar}</div>}

      {/* 阅读区 */}
      <div ref={viewerRef} className={cn("min-h-0 flex-1 overflow-auto rounded-xl", immersive ? "bg-slate-950" : "border border-slate-200 bg-slate-200/60")} style={immersive ? undefined : { height: "min(72vh, 860px)" }}>
        <div className={cn("flex min-h-full flex-col gap-6 p-6", mode === "page" && "justify-start")}>
          {!ready && <div className="grid flex-1 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>}
          {ready && mode === "scroll" && Array.from({ length: totalPages }, (_, index) => renderPageNode(index + 1))}
          {ready && mode === "page" && renderPageNode(page)}
        </div>
      </div>

      {/* 底部进度条 */}
      <div className={cn("flex items-center justify-between px-1 pt-2 text-[11px]", immersive ? "text-slate-400" : "text-slate-500")}>
        <span className="flex items-center gap-1.5"><BookOpenText className="h-3.5 w-3.5" />{totalPages > 0 ? `阅读进度 ${pdfPercent(page, totalPages)}%` : "加载中…"} · 已标注 {annotations.length} 处</span>
        <span className="hidden md:block">←/→ 翻页 · +/- 缩放 · A 标注 · F 沉浸</span>
      </div>

      {/* 标注笔记输入（浮在底部） */}
      {pending && <div className={cn("mt-3 rounded-xl border p-4", immersive ? "border-violet-500/40 bg-slate-900" : "border-violet-200 bg-violet-50")}>
        <p className={cn("flex items-center gap-1.5 text-sm font-semibold", immersive ? "text-white" : "text-violet-800")}><StickyNote className="h-4 w-4" />为选中区域写一条标注（第 {pending.page} 页）</p>
        <div className="mt-2 flex gap-2">
          <Textarea value={note} onChange={event => setNote(event.target.value)} placeholder="例如：这里的数据口径要结合 Q3 复盘一起看" className={cn("min-h-10", immersive ? "border-white/15 bg-white/10 text-white placeholder:text-slate-500" : "bg-white")} />
          <div className="flex flex-col gap-2">
            <Button size="sm" disabled={!note.trim() || addAnnotation.isPending} onClick={() => addAnnotation.mutate({ materialId, page: pending.page, rects: [pending.rect], note: note.trim(), color: color as "amber" | "violet" | "rose" | "emerald" | "sky" })} className="bg-violet-600 hover:bg-violet-500">{addAnnotation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存标注"}</Button>
            <Button size="sm" variant="outline" onClick={() => { setPending(null); setNote(""); }} className={immersive ? "border-white/15 text-white hover:bg-white/10" : ""}>取消</Button>
          </div>
        </div>
      </div>}
    </div>

    {/* 标注侧列：沉浸模式下也悬浮可用 */}
    <aside className={cn("shrink-0 overflow-y-auto rounded-xl border p-4", immersive ? "hidden border-white/10 bg-slate-900 lg:block lg:max-h-64 xl:mt-3" : "border-slate-200 bg-white lg:max-h-[720px]")}>
      <div className="flex items-center justify-between">
        <p className={cn("flex items-center gap-1.5 text-sm font-semibold", immersive && "text-white")}><Highlighter className="h-4 w-4 text-violet-500" />我的标注</p>
        {!immersive && pageAnnotations.length > 0 && <span className="text-[11px] text-slate-400">本页 {pageAnnotations.length} 条</span>}
      </div>
      <div className="mt-3 space-y-2.5">
        {annotations.length === 0 && <p className={cn("rounded-lg p-3 text-xs", immersive ? "bg-white/5 text-slate-400" : "bg-slate-50 text-slate-500")}>还没有标注。开启「标注」后在页面上拖选区域，仅自己可见。</p>}
        {annotations.slice().sort((a, b) => b.page - a.page || b.createdAt.getTime() - a.createdAt.getTime()).map(annotation => <div key={annotation.id} className={cn("group rounded-lg border p-3 transition", activeAnnotationId === annotation.id ? "border-violet-300 bg-violet-50/60" : immersive ? "border-white/10 hover:border-violet-400/50" : "border-slate-200 hover:border-violet-200")}>
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => goTo(annotation.page, true)} className="flex items-center gap-1.5 text-xs font-semibold text-violet-500 hover:underline">第 {annotation.page} 页</button>
            <button onClick={() => deleteAnnotation.mutate({ id: annotation.id })} aria-label="删除标注" className="opacity-0 transition group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-rose-400" /></button>
          </div>
          <p className={cn("mt-1.5 text-xs leading-5", immersive ? "text-slate-300" : "text-slate-700")}>{annotation.note}</p>
          <div className="mt-1.5 flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", ANNOTATION_COLOR_CLASSES[annotation.color]?.dot ?? "bg-amber-400")} /><span className={cn("text-[10px]", immersive ? "text-slate-500" : "text-slate-400")}>{ANNOTATION_COLOR_CLASSES[annotation.color]?.label ?? "琥珀"}</span></div>
        </div>)}
      </div>
      {!immersive && <button onClick={() => void toggleImmersive()} className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-violet-200 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-50"><Maximize2 className="h-3.5 w-3.5" />进入沉浸阅读</button>}
      {immersive && <button onClick={() => void toggleImmersive()} className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/15 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10"><X className="h-3.5 w-3.5" />退出沉浸模式</button>}
    </aside>
  </div>;
}
