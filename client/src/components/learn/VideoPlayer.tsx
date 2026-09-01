// 自定义视频学习播放器：倍速、快捷键、进度时间戳标记、轨道化弹幕层与断点续播。
// 原生 controls 关闭，播放/进度/音量统一由本组件托管。
import { Badge } from "@/components/ui/badge";
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
  // watchedSeconds 为本次会话累计观看秒数（正向播放），用于学习分钟数增量统计。
  onProgress: (payload: { position: number; percent: number; watchedSeconds: number }) => void;
};

export default function VideoPlayer({ materialId, src, title, comments, resumeSecond, onProgress }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(resumeSecond ?? 0);
  const [duration, setDuration] = useState(0);
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

  const utils = trpc.useUtils();
  const addComment = trpc.platform.learning.addComment.useMutation({
    onSuccess: () => { setDraft(""); utils.platform.learning.courseExperience.invalidate(); },
  });

  const danmakuItems = useMemo<DanmakuItem[]>(() => comments
    .filter(item => item.comment.videoSecond !== null && item.comment.isDanmaku === 1)
    .map(item => ({ id: item.comment.id, content: item.comment.content, second: item.comment.videoSecond ?? 0, authorName: item.authorName })), [comments]);
  const lanes = useMemo(() => assignDanmakuLanes(danmakuItems), [danmakuItems]);
  const active = useMemo(() => (danmakuOn ? visibleDanmaku(lanes, current) : []), [danmakuOn, lanes, current]);
  const markers = useMemo(() => danmakuItems, [danmakuItems]);

  const showFlash = useCallback((text: string) => { setFlash(text); window.setTimeout(() => setFlash(null), 900); }, []);

  // 统一进度上报：percent 按观看比例换算，看完 92% 记为 100。
  const report = useCallback((position: number, percent?: number) => {
    onProgress({ position, percent: percent ?? videoPercent(position, duration), watchedSeconds: watchedRef.current.seconds });
  }, [duration, onProgress]);

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
    setCurrent(now);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        }}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => { setPlaying(false); report(videoRef.current?.currentTime ?? 0); }}
        onEnded={() => { setPlaying(false); report(duration, 100); }}
      />

      {/* 弹幕层：每条弹幕在自己的轨道上从右向左平移，生命周期 8 秒 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {active.map(lane => {
          const elapsed = Math.max(0, current - lane.item.second);
          const progress = Math.min(1, elapsed / 8);
          return <div
            key={lane.item.id}
            className="absolute whitespace-nowrap text-sm font-medium text-white drop-shadow-[0_1px_3px_rgba(0,0,0,.9)]"
            style={{ top: `calc(${8 + lane.track * 11}% )`, right: `${-30 + progress * 130}%`, opacity: progress > 0.85 ? (1 - progress) / 0.15 : 1 }}
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

    {/* 弹幕发送框 */}
    <div className="border-t border-white/10 bg-slate-950 p-4">
      <div className="flex items-center gap-2">
        <Badge className="border-violet-400/40 bg-violet-500/15 text-violet-200 hover:bg-violet-500/15">弹幕</Badge>
        <span className="text-xs text-slate-400">{asDanmaku ? `将作为弹幕在 ${formatClock(current)} 处飞过` : "将作为时间戳评论记录"} · 已有 {comments.length} 条互动</span>
      </div>
      <div className="mt-2 flex gap-2">
        <Textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && draft.trim()) addComment.mutate({ materialId, content: draft.trim(), videoSecond: Math.floor(current), isDanmaku: asDanmaku }); }} placeholder="发一条弹幕，或记录此刻的笔记（Ctrl+Enter 发送）" className="min-h-10 border-white/15 bg-white/10 text-white placeholder:text-slate-500" />
        <div className="flex flex-col gap-2">
          <Button disabled={!draft.trim() || addComment.isPending} onClick={() => addComment.mutate({ materialId, content: draft.trim(), videoSecond: Math.floor(current), isDanmaku: asDanmaku })} className="bg-violet-500 hover:bg-violet-400">{addComment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
          <button onClick={() => setAsDanmaku(value => !value)} className={cn("rounded-md border px-2 py-1 text-[11px] font-semibold transition", asDanmaku ? "border-violet-400/60 bg-violet-500/20 text-violet-200" : "border-white/15 text-slate-400")}>{asDanmaku ? "弹幕模式" : "笔记模式"}</button>
        </div>
      </div>
      {comments.length > 0 && <div className="mt-3 max-h-40 space-y-1.5 overflow-y-auto pr-1">
        {comments.slice(-8).reverse().map(item => <p key={item.comment.id} className="flex items-start gap-2 text-xs text-slate-300"><MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400" /><span>{item.comment.videoSecond !== null && <span className="mr-1.5 font-mono text-violet-300">{formatClock(item.comment.videoSecond)}</span>}{item.comment.content}<span className="ml-1.5 text-slate-500">— {item.authorName || "员工"}</span></span></p>)}
      </div>}
      <p className="mt-2 text-[11px] text-slate-500">快捷键：空格/K 播放暂停 · ←→ 5 秒 · J/L 10 秒 · 当前播放「{title}」</p>
    </div>
  </div>;
}
