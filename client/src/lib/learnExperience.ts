// /learn 学习体验的共享纯函数：弹幕调度、进度换算与展示格式化。
// 组件只做渲染与交互，可测试的业务规则集中在这里。

export const VIDEO_PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
export type DocumentDisplayMode = "html" | "markdown" | "image" | "pdf" | "link" | "missing";

export function resolveDocumentDisplay(input: { content?: string | null; contentHtml?: string | null; contentFormat?: string | null; mimeType?: string | null; url?: string | null }): DocumentDisplayMode {
  // HTML 快照由服务端清洗后保存；优先于派生的纯文本/Markdown 内容，保留原站排版。
  if (input.contentFormat === "html" && input.contentHtml?.trim()) return "html";
  if (input.content?.trim()) return "markdown";
  if (input.mimeType?.startsWith("image/") && input.url) return "image";
  if (input.mimeType === "application/pdf" && input.url) return "pdf";
  return input.url ? "link" : "missing";
}
export function canShowTimestampComment(materialType: "document" | "video" | "practice") { return materialType === "video"; }
export function supportsPracticeHistory(materialType: "document" | "video" | "practice") { return materialType === "practice"; }

// ---------- 弹幕调度 ----------

export type DanmakuItem = { id: number; content: string; second: number; authorName: string | null };

export const DANMAKU_TRACKS = 5;
export const DANMAKU_LIFETIME_MS = 8_000;
export const DANMAKU_WINDOW_SECONDS = 4;

export type DanmakuLane = { item: DanmakuItem; track: number };

// 一次性把全部弹幕按轨道分好：同一秒附近（窗口内）的弹幕错开轨道，轨道用尽时取弹幕最少的一条。
export function assignDanmakuLanes(items: DanmakuItem[]): DanmakuLane[] {
  const lanes: DanmakuLane[] = [];
  const trackBuckets: number[][] = Array.from({ length: DANMAKU_TRACKS }, () => []);
  for (const item of items.slice().sort((a, b) => a.second - b.second)) {
    let track = trackBuckets.findIndex(bucket => bucket.every(second => Math.abs(second - item.second) >= DANMAKU_WINDOW_SECONDS));
    if (track === -1) {
      let lightest = 0;
      trackBuckets.forEach((bucket, index) => { if (bucket.length < trackBuckets[lightest].length) lightest = index; });
      track = lightest;
    }
    trackBuckets[track].push(item.second);
    lanes.push({ item, track });
  }
  return lanes;
}

// 当前应显示的弹幕：时间轴向前回看一个生命周期窗口内的弹幕。
export function visibleDanmaku(lanes: DanmakuLane[], second: number, lifetimeSeconds = DANMAKU_LIFETIME_MS / 1000): DanmakuLane[] {
  return lanes.filter(lane => lane.item.second <= second && second <= lane.item.second + lifetimeSeconds);
}

// ---------- 进度 ----------

export function clampPercent(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }

// 视频看完 92% 即视为本素材完成，避免片尾黑屏导致永远到不了 100。
export const VIDEO_COMPLETION_THRESHOLD = 0.92;
export function videoPercent(currentSecond: number, durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  if (currentSecond / durationSeconds >= VIDEO_COMPLETION_THRESHOLD) return 100;
  return clampPercent((currentSecond / durationSeconds) * 100);
}

// PDF：页码 / 总页数直接换算百分比。
export function pdfPercent(page: number, totalPages: number) { return totalPages > 0 ? clampPercent((page / totalPages) * 100) : 0; }

// PDF 阅读策略：长文档默认单页，避免一次挂载所有页面；宽屏第一页通常来自 PPT 导出。
export const LONG_PDF_PAGE_THRESHOLD = 12;
export const PRESENTATION_ASPECT_RATIO_THRESHOLD = 1.3;
export type PdfReadingProfile = "document" | "presentation";

export function pdfReadingProfile(firstPageWidth: number, firstPageHeight: number): PdfReadingProfile {
  if (!Number.isFinite(firstPageWidth) || !Number.isFinite(firstPageHeight) || firstPageHeight <= 0) return "document";
  return firstPageWidth / firstPageHeight >= PRESENTATION_ASPECT_RATIO_THRESHOLD ? "presentation" : "document";
}

export function defaultPdfDisplayMode(totalPages: number, profile: PdfReadingProfile): "page" | "scroll" {
  return profile === "presentation" || totalPages >= LONG_PDF_PAGE_THRESHOLD ? "page" : "scroll";
}

export function formatClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safe / 3600); const minutes = Math.floor((safe % 3600) / 60); const seconds = safe % 60;
  const mm = String(minutes).padStart(2, "0"); const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

// 学习分钟数节流：视频每累计 30s 观看上报 1 分钟，文档/PDF 每 60s 上报 1 分钟。
export function minutesFromElapsed(elapsedMs: number) { return Math.floor(elapsedMs / 60_000); }

// 课程进度徽标的三态文案。
export function progressState(percent: number): { label: string; tone: "done" | "active" | "idle" } {
  if (percent >= 100) return { label: "已完成", tone: "done" };
  if (percent > 0) return { label: `进行中 ${percent}%`, tone: "active" };
  return { label: "未开始", tone: "idle" };
}

// PDF 标注颜色（Tailwind 类名集中在组件外的常量，避免动态拼接失效）。
export const ANNOTATION_COLOR_CLASSES: Record<string, { fill: string; border: string; dot: string; label: string }> = {
  amber: { fill: "bg-amber-300/30", border: "border-amber-400", dot: "bg-amber-400", label: "琥珀" },
  violet: { fill: "bg-violet-300/30", border: "border-violet-400", dot: "bg-violet-400", label: "紫罗兰" },
  rose: { fill: "bg-rose-300/30", border: "border-rose-400", dot: "bg-rose-400", label: "玫红" },
  emerald: { fill: "bg-emerald-300/30", border: "border-emerald-400", dot: "bg-emerald-400", label: "翠绿" },
  sky: { fill: "bg-sky-300/30", border: "border-sky-400", dot: "bg-sky-400", label: "天蓝" },
};

// ---------- 卡片网格 ----------

// 卡片配色按路径 accent 取值，缺省回退 violet。
export const PATH_ACCENTS: Record<string, { gradient: string; chip: string; icon: string; ring: string }> = {
  violet: { gradient: "from-violet-600 via-violet-500 to-indigo-600", chip: "bg-violet-100 text-violet-700", icon: "bg-violet-600", ring: "ring-violet-200" },
  orange: { gradient: "from-orange-500 via-amber-500 to-rose-500", chip: "bg-orange-100 text-orange-700", icon: "bg-orange-500", ring: "ring-orange-200" },
  emerald: { gradient: "from-emerald-500 via-teal-500 to-cyan-600", chip: "bg-emerald-100 text-emerald-700", icon: "bg-emerald-500", ring: "ring-emerald-200" },
  sky: { gradient: "from-sky-500 via-blue-500 to-indigo-500", chip: "bg-sky-100 text-sky-700", icon: "bg-sky-500", ring: "ring-sky-200" },
  rose: { gradient: "from-rose-500 via-pink-500 to-fuchsia-500", chip: "bg-rose-100 text-rose-700", icon: "bg-rose-500", ring: "ring-rose-200" },
};
export function pathAccent(accent: string | null | undefined) { return PATH_ACCENTS[accent ?? "violet"] ?? PATH_ACCENTS.violet; }

export function materialKindOf(material: { materialType: "document" | "video" | "practice"; mimeType: string | null }): "video" | "pdf" | "document" | "practice" {
  if (material.materialType === "video") return "video";
  if (material.materialType === "practice") return "practice";
  // 兼容历史数据：上传了视频文件但类型误选“文档”的素材，按 mime 兜底仍渲染为视频。
  if (material.mimeType?.startsWith("video/")) return "video";
  return material.mimeType === "application/pdf" ? "pdf" : "document";
}

export const MATERIAL_KIND_LABEL: Record<string, string> = { video: "视频", pdf: "PDF 文档", document: "文档", practice: "AI 实操" };
