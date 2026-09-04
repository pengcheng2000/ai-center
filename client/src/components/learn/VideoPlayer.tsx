// 自定义视频学习播放器：倍速、快捷键、进度时间戳标记、轨道化弹幕层与断点续播。
// 原生 controls 关闭，播放/进度/音量统一由本组件托管。
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { assignDanmakuLanes, formatClock, videoPercent, VIDEO_PLAYBACK_SPEEDS, visibleDanmaku, type DanmakuItem } from "@/lib/learnExperience";
import { cn } from "@/lib/utils";
import { Loader2, Maximize2, MessageCircle, Minimize2, Pause, Play, Send, SkipBack, SkipForward, Volume2, VolumeX, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type CommentRow = { comment: { id: number; materialId: number; content: string; videoSecond: number | null; isDanmaku: number; createdAt: Date }; authorName: string | null };

export type VideoPlayerProps = {
  materialId: number;
  src: string;
  title: string;
  comments: CommentRow[];
  resumeSecond: number | null;
  initialPercent?: number;
  // watchedSeconds 为本次会话累计观看秒数（正向播放），用于学习分钟数增量统计。
  onProgress: (payload: { position: number; percent: number; watchedSeconds: number }) => void;
  // 成功后由课程页局部追加，避免重新加载整个课程体验并打断视频状态。
  onCommentAdded?: (comment: CommentRow) => void;
};

export default function VideoPlayer({ materialId, src, title, comments, resumeSecond, initialPercent = 0, onProgress, onCommentAdded }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(resumeSecond ?? 0);
  const [duration, setDuration] = useState(0);
  const currentTimeRef = useRef(resumeSecond ?? 0);
  const lastVisualUpdateRef = useRef(0);
  const visualTimerRef = useRef<number | null>(null);
  const [buffered, setBuffered] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const [muted, setMuted] = useState(false);
  const [danmakuOn, setDanmakuOn] = useState(true);
  const [draft, setDraft] = useState("");
  const [asDanmaku, setAsDanmaku] = useState(true);
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const watchedRef = useRef({ seconds: 0, last: 0 });
  const resumeAppliedRef = useRef(false);
  const autoSaveRef = useRef({ at: 0, position: 0, duration: 0 });
  const highWaterRef = useRef({ position: resumeSecond ?? 0, percent: Math.max(0, Math.min(100, initialPercent)) });
  // 父组件（CourseDetail）每次渲染都会传入新的 inline onProgress 闭包；若把它的身份当依赖，
  // “保存进度”的 effect 会随父渲染反复重建，cleanup 里的 saveNow 再次触发 mutation，
  // 形成“上报 → mutation 状态更新 → 父重渲染 → effect 重建再上报”的更新风暴
  // （Maximum update depth exceeded）。因此经 ref 转发最新回调与时长，report 保持稳定身份。
  const onProgressRef = useRef(onProgress);
  const durationRef = useRef(duration);
  useEffect(() => { onProgressRef.current = onProgress; durationRef.current = duration; });

  // 播放时间需要保持精确用于进度上报，但弹幕视觉层不必跟随每个 timeupdate 重渲染。
  // 约 120ms 刷新一次 React 状态，动画位置交给 transform 合成层处理。
  const syncVisualTime = useCallback((next: number, immediate = false) => {
    currentTimeRef.current = next;
    const now = performance.now();
    if (immediate || now - lastVisualUpdateRef.current >= 120) {
      if (visualTimerRef.current !== null) window.clearTimeout(visualTimerRef.current);
      visualTimerRef.current = null;
      lastVisualUpdateRef.current = now;
      setCurrent(next);
      return;
    }
    if (visualTimerRef.current === null) {
      visualTimerRef.current = window.setTimeout(() => {
        visualTimerRef.current = null;
        lastVisualUpdateRef.current = performance.now();
        setCurrent(currentTimeRef.current);
      }, Math.max(0, 120 - (now - lastVisualUpdateRef.current)));
    }
  }, []);
  useEffect(() => () => { if (visualTimerRef.current !== null) window.clearTimeout(visualTimerRef.current); }, []);

  const addComment = trpc.platform.learning.addComment.useMutation({
    onSuccess: result => { setDraft(""); onCommentAdded?.(result); },
  });

  const danmakuItems = useMemo<DanmakuItem[]>(() => comments
    .filter(item => item.comment.videoSecond !== null && item.comment.isDanmaku === 1)
    .map(item => ({ id: item.comment.id, content: item.comment.content, second: item.comment.videoSecond ?? 0, authorName: item.authorName })), [comments]);
  const lanes = useMemo(() => assignDanmakuLanes(danmakuItems), [danmakuItems]);
  const active = useMemo(() => (danmakuOn ? visibleDanmaku(lanes, current) : []), [danmakuOn, lanes, current]);
  const markers = useMemo(() => danmakuItems, [danmakuItems]);

  const showFlash = useCallback((text: string) => { setFlash(text); window.setTimeout(() => setFlash(null), 900); }, []);

  // 统一进度上报：percent 按观看比例换算，看完 92% 记为 100。
  // 回调与时长经 ref 读取，依赖为空以保持身份稳定（见 onProgressRef 注释）。
  const report = useCallback((position: number, percent?: number) => {
    const nextPercent = percent ?? videoPercent(position, durationRef.current);
    highWaterRef.current = {
      position: Math.max(highWaterRef.current.position, position),
      percent: Math.max(highWaterRef.current.percent, nextPercent),
    };
    onProgressRef.current({ ...highWaterRef.current, watchedSeconds: watchedRef.current.seconds });
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current; if (!video) return;
    if (video.paused) { void video.play(); showFlash("播放"); } else { video.pause(); showFlash("暂停"); }
  }, [showFlash]);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current; if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
    showFlash(delta > 0 ? `快进 ${delta}s` : `回退 ${Math.abs(delta)}s`);
  }, [showFlash]);

  const applySpeed = useCallback((value: number) => { setSpeed(value); if (videoRef.current) videoRef.current.playbackRate = value; }, []);

  // 全屏：整个播放器容器（含弹幕层与控制栏）进入系统全屏。
  const toggleFullscreen = useCallback(async () => {
    const shell = shellRef.current; if (!shell) return;
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    else await shell.requestFullscreen().catch(() => showFlash("当前环境不支持全屏"));
  }, [showFlash]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable) return;
      if (event.key === " " || event.key === "k") { event.preventDefault(); togglePlay(); }
      if (event.key === "ArrowRight") seekBy(5);
      if (event.key === "ArrowLeft") seekBy(-5);
      if (event.key === "j") seekBy(-10);
      if (event.key === "l") seekBy(10);
      if (event.key.toLowerCase() === "f") void toggleFullscreen();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay, seekBy, toggleFullscreen]);

  const handleTimeUpdate = () => {
    const video = videoRef.current; if (!video) return;
    const now = video.currentTime;
    // 只累计正向播放的时长，倍速不影响“观看分钟数”统计口径。
    watchedRef.current.seconds += Math.max(0, Math.min(1, now - watchedRef.current.last));
    watchedRef.current.last = now;
    syncVisualTime(now);
    if (video.buffered.length) setBuffered(video.buffered.end(video.buffered.length - 1));
    // 每 20 秒自动保存一次播放位置，关闭或刷新页面也能续播。
    if (duration > 0 && Date.now() - autoSaveRef.current.at > 20_000) {
      autoSaveRef.current = { at: Date.now(), position: now, duration };
      report(now);
    }
  };

  // 暂停、离开页面与卸载时各补一次保存，尽量不丢进度。
  useEffect(() => {
    const saveNow = () => {
      const video = videoRef.current; if (!video || !video.duration) return;
      report(video.currentTime);
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") saveNow(); };
    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", saveNow);
    return () => {
      window.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", saveNow);
      saveNow();
    };
  }, [report]);

  const progressPercent = duration ? Math.min(100, (scrubbing ?? current) / duration * 100) : 0;
  const bufferedPercent = duration ? Math.min(100, buffered / duration * 100) : 0;

  return <div className="overflow-hidden rounded-2xl bg-slate-950">
    <div ref={shellRef} className="group relative aspect-video select-none">
      <video
        ref={videoRef}
        src={src}
        muted={muted}
        playsInline
        preload="metadata"
        className="h-full w-full bg-black object-contain"
        onClick={togglePlay}
        onLoadedMetadata={event => {
          const video = event.currentTarget;
          setDuration(video.duration || 0);
          if (!resumeAppliedRef.current && resumeSecond && resumeSecond > 2 && resumeSecond < (video.duration || 0) - 2) {
            video.currentTime = resumeSecond; showFlash(`已从 ${formatClock(resumeSecond)} 续播`);
          }
          resumeAppliedRef.current = true;
          watchedRef.current.last = video.currentTime;
          syncVisualTime(video.currentTime, true);
        }}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => { syncVisualTime(videoRef.current?.currentTime ?? currentTimeRef.current, true); setPlaying(false); report(videoRef.current?.currentTime ?? currentTimeRef.current); }}
        onEnded={() => { const position = videoRef.current?.duration ?? durationRef.current; syncVisualTime(position, true); setPlaying(false); report(position, 100); }}
      />

      {/* 弹幕层：每条弹幕在自己的轨道上从右向左平移，生命周期 8 秒 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {active.map(lane => {
          const elapsed = Math.max(0, current - lane.item.second);
          const progress = Math.min(1, elapsed / 8);
          return <div
            key={lane.item.id}
            className="pointer-events-none absolute whitespace-nowrap text-sm font-medium text-white [contain:layout_paint]"
            style={{ top: `calc(${8 + lane.track * 11}% )`, left: "100%", transform: `translate3d(${130 - progress * 230}%, 0, 0)`, opacity: progress > 0.85 ? (1 - progress) / 0.15 : 1, willChange: "transform, opacity", textShadow: "0 1px 3px rgb(0 0 0 / 0.9)" }}
          >{lane.item.content}</div>;
        })}
      </div>

      {flash && <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 px-5 py-2 text-sm font-semibold text-white">{flash}</div>}
      {!playing && <button onClick={togglePlay} aria-label="播放" className="absolute inset-0 grid place-items-center bg-black/25 transition-opacity"><span className="grid h-16 w-16 place-items-center rounded-full bg-violet-600/95 text-white shadow-2xl shadow-violet-900/50 transition hover:scale-105"><Play className="ml-1 h-7 w-7" /></span></button>}

      {/* 控制栏：hover 时浮现 */}
      <div className={cn("absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-3 pt-8 transition-opacity duration-200", playing ? "opacity-0 group-hover:opacity-100 focus-within:opacity-100" : "opacity-100")}>
        {/* 进度条 + 时间戳弹幕标记 */}
        <div className="relative h-5">
          <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 overflow-hidden rounded-full bg-white/25">
            <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${bufferedPercent}%` }} />
            <div className="absolute inset-y-0 left-0 bg-violet-400" style={{ width: `${progressPercent}%` }} />
          </div>
          <input
            type="range" min={0} max={duration || 0} step={0.1}
            value={scrubbing ?? current}
            onChange={event => setScrubbing(Number(event.target.value))}
            onPointerUp={event => { const video = videoRef.current; const value = Number((event.target as HTMLInputElement).value); if (video) { video.currentTime = value; watchedRef.current.last = value; } setScrubbing(null); setCurrent(value); }}
            className="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow"
            aria-label="播放进度"
          />
          {markers.filter(item => duration > 0 && item.second / duration <= 1).map(item => <span key={item.id} title={`${formatClock(item.second)} ${item.content}`} className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-violet-500" style={{ left: `${item.second / duration * 100}%` }} />)}
        </div>
        <div className="mt-1 flex items-center gap-2 text-white">
          <button onClick={togglePlay} className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15">{playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}</button>
          <button onClick={() => seekBy(-10)} className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15" aria-label="后退 10 秒"><SkipBack className="h-4.5 w-4.5" /></button>
          <button onClick={() => seekBy(10)} className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15" aria-label="快进 10 秒"><SkipForward className="h-4.5 w-4.5" /></button>
          <button onClick={() => setMuted(value => !value)} className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15" aria-label="静音切换">{muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</button>
          <span className="ml-1 font-mono text-xs tabular-nums text-white/85">{formatClock(scrubbing ?? current)} / {formatClock(duration)}</span>
          <div className="ml-auto flex items-center gap-1.5">
            <select value={speed} onChange={event => applySpeed(Number(event.target.value))} className="rounded-md bg-white/15 px-2 py-1 text-xs font-semibold outline-none [&>option]:text-slate-900" aria-label="倍速">
              {VIDEO_PLAYBACK_SPEEDS.map(option => <option key={option} value={option}>{option}×</option>)}
            </select>
            <button onClick={() => setDanmakuOn(value => !value)} className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition", danmakuOn ? "bg-violet-500 text-white" : "bg-white/15 text-white/70")}>{danmakuOn ? <Wand2 className="h-3.5 w-3.5" /> : null}弹幕</button>
            <button onClick={() => void toggleFullscreen()} aria-label="全屏" className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15">{document.fullscreenElement ? <Minimize2 className="h-4.5 w-4.5" /> : <Maximize2 className="h-4.5 w-4.5" />}</button>
            <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs font-semibold text-white/85 hover:bg-white/15 hover:text-white" disabled={addComment.isPending} onClick={() => { report(current); showFlash("已保存进度"); }}>保存进度</Button>
          </div>
        </div>
      </div>
    </div>

    {/* 弹幕输入：发布模式、当前时间与发送动作分层，避免在播放时误触播放器控制。 */}
    <div className="border-t border-white/10 bg-slate-950 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white">记录这一刻</span>
          <span className="rounded-full bg-white/10 px-2 py-1 font-mono text-[11px] text-violet-200">{formatClock(current)}</span>
        </div>
        <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-1" role="group" aria-label="发布类型">
          <button type="button" onClick={() => setAsDanmaku(true)} aria-pressed={asDanmaku} className={cn("rounded-md px-3 py-1.5 text-xs font-semibold transition", asDanmaku ? "bg-violet-500 text-white" : "text-slate-400 hover:text-white")}>弹幕</button>
          <button type="button" onClick={() => setAsDanmaku(false)} aria-pressed={!asDanmaku} className={cn("rounded-md px-3 py-1.5 text-xs font-semibold transition", !asDanmaku ? "bg-white/15 text-white" : "text-slate-400 hover:text-white")}>时间戳笔记</button>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-white/15 bg-white/5 p-2 transition focus-within:border-violet-400/70 focus-within:ring-2 focus-within:ring-violet-500/20">
        <Textarea value={draft} maxLength={500} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && draft.trim()) { event.preventDefault(); addComment.mutate({ materialId, content: draft.trim(), videoSecond: Math.floor(currentTimeRef.current), isDanmaku: asDanmaku }); } }} placeholder={asDanmaku ? "写下此刻的想法，它会在视频中飘过…" : "记录一个带时间戳的学习笔记…"} className="min-h-16 resize-none border-0 bg-transparent p-2 text-white placeholder:text-slate-500 focus-visible:ring-0" />
        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-2 pt-2">
          <span className="text-[11px] text-slate-500">Ctrl / ⌘ + Enter 发送 · {draft.length}/500</span>
          <Button disabled={!draft.trim() || addComment.isPending} onClick={() => addComment.mutate({ materialId, content: draft.trim(), videoSecond: Math.floor(currentTimeRef.current), isDanmaku: asDanmaku })} className="h-10 rounded-lg bg-violet-500 px-4 text-xs font-semibold text-white hover:bg-violet-400">{addComment.isPending ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />发送中</> : <><Send className="mr-1.5 h-3.5 w-3.5" />发送</>}</Button>
        </div>
      </div>
      {comments.length > 0 && <div className="mt-4 border-t border-white/10 pt-3"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-slate-300">最近记录</span><span className="text-[11px] text-slate-500">{comments.length} 条互动</span></div><div className="max-h-36 space-y-2 overflow-y-auto pr-1">{comments.slice(-8).reverse().map(item => <p key={item.comment.id} className="flex items-start gap-2 text-xs leading-5 text-slate-300"><MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400" /><span>{item.comment.videoSecond !== null && <span className="mr-1.5 rounded bg-violet-500/15 px-1 py-0.5 font-mono text-[10px] text-violet-300">{formatClock(item.comment.videoSecond)}</span>}{item.comment.content}<span className="ml-1.5 text-slate-500">— {item.authorName || "员工"}</span></span></p>)}</div></div>}
    </div>
  </div>;
}
