// 社区正文渲染：统一走 Streamdown（Markdown），正文内图片可点击进灯箱预览。
// 不再使用 dangerouslySetInnerHTML，历史 HTML 帖已由服务端转成 Markdown。
import { cn } from "@/lib/utils";
import { useState, type MouseEvent } from "react";
import { Streamdown } from "streamdown";
import ImageLightbox, { type LightboxImage } from "./ImageLightbox";

export default function PostContent({ markdown, className }: { markdown: string; className?: string }) {
  const [preview, setPreview] = useState<LightboxImage | null>(null);

  // 正文图片由 Markdown 渲染生成，用事件委托捕获点击，避免逐个改写渲染器。
  const openFromClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) return;
    event.preventDefault();
    setPreview({ url: target.currentSrc || target.src, fileName: target.alt || "正文图片" });
  };

  return <>
    <div onClick={openFromClick} className={cn("prose prose-slate max-w-none text-[15px] leading-8 prose-headings:font-serif prose-headings:tracking-normal prose-p:my-4 prose-a:font-medium prose-a:text-violet-700 prose-img:cursor-zoom-in prose-img:rounded-xl prose-img:border prose-img:border-slate-200 prose-blockquote:border-l-violet-400 prose-pre:bg-slate-950", className)}>
      <Streamdown>{markdown}</Streamdown>
    </div>
    <ImageLightbox image={preview} onClose={() => setPreview(null)} />
  </>;
}
