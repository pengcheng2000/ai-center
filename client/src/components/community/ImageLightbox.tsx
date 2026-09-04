// 页内图片预览：点击社区图片后在遮罩层查看，支持 Esc/点击空白关闭与打开原图。
import { ExternalLink, X } from "lucide-react";
import { useEffect } from "react";

export type LightboxImage = { url: string; fileName: string };

export default function ImageLightbox({ image, onClose }: { image: LightboxImage | null; onClose: () => void }) {
  useEffect(() => {
    if (!image) return;
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [image, onClose]);

  if (!image) return null;
  return <div role="dialog" aria-modal="true" aria-label={`图片预览：${image.fileName}`} onClick={onClose} className="fixed inset-0 z-[80] flex flex-col bg-slate-950/82 p-4 backdrop-blur-md">
    <div className="flex items-center justify-between gap-3 text-white">
      <p className="min-w-0 flex-1 truncate text-sm">{image.fileName}</p>
      <a href={image.url} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/10 px-3 text-xs font-medium transition hover:bg-white/20"><ExternalLink className="h-3.5 w-3.5" />打开原图</a>
      <button onClick={onClose} aria-label="关闭预览" className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/10 transition hover:bg-white/20"><X className="h-4 w-4" /></button>
    </div>
    <div className="mt-3 min-h-0 flex-1 overflow-auto">
      <img src={image.url} alt={image.fileName} onClick={event => event.stopPropagation()} className="mx-auto max-h-full w-auto max-w-full rounded-2xl object-contain shadow-2xl" />
    </div>
  </div>;
}
