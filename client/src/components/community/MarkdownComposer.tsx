// 社区发帖/编辑共用的 Markdown 编辑器：工具栏、拖拽与粘贴上传、编辑/预览切换。
// 图片上传后以 attachment:{id} 写入正文，服务端读取时替换为签名 URL。
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { applyBlock, applyLink, applyWrap, attachmentRef, insertBlockSnippet, isImageMimeType, markdownToPlainText, stripAttachmentRef, type ImageMimeType } from "@/lib/communityContent";
import { AlertCircle, Bold, Code, Eye, Heading2, ImagePlus, Italic, Link2, List, ListOrdered, Loader2, PenLine, Quote, Trash2, Upload } from "lucide-react";
import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import PostContent from "./PostContent";

export type ComposerAttachment = { id: number; url: string; fileName: string };
type UploadPayload = { dataUrl: string; fileName: string; mimeType: ImageMimeType };

export type MarkdownComposerProps = {
  value: string;
  onChange: (value: string) => void;
  attachments: ComposerAttachment[];
  onUpload: (payload: UploadPayload) => Promise<ComposerAttachment | null>;
  onRemoveAttachment: (attachment: ComposerAttachment) => void;
  isUploading?: boolean;
  minPlainLength?: number;
};

export default function MarkdownComposer({ value, onChange, attachments, onUpload, onRemoveAttachment, isUploading = false, minPlainLength = 12 }: MarkdownComposerProps) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);

  const plainLength = markdownToPlainText(value).length;

  const commit = (result: { value: string; selectionStart: number; selectionEnd: number }) => {
    onChange(result.value);
    requestAnimationFrame(() => {
      const node = textarea.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const selection = () => {
    const node = textarea.current;
    return { start: node?.selectionStart ?? value.length, end: node?.selectionEnd ?? value.length };
  };

  const uploadFiles = async (list: FileList | File[] | null) => {
    const candidates = Array.from(list ?? []);
    if (!candidates.length) return;
    const accepted = candidates.filter(file => isImageMimeType(file.type));
    const room = Math.max(0, 8 - attachments.length);
    if (accepted.length < candidates.length) setNotice("仅支持 PNG / JPEG / WebP / GIF 图片，其他文件已忽略。");
    else if (accepted.length > room) setNotice("单篇实践最多 8 张图片，超出的已忽略。");
    else setNotice("");

    for (const file of accepted.slice(0, room)) {
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("读取图片失败"));
          reader.readAsDataURL(file);
        });
        const attachment = await onUpload({ dataUrl, fileName: file.name, mimeType: file.type as ImageMimeType });
        if (attachment) {
          const { start } = selection();
          commit(insertBlockSnippet(value, start, attachmentRef(attachment.id, attachment.fileName)));
        }
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "图片上传失败，请重试");
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  const removeAttachment = (attachment: ComposerAttachment) => {
    onChange(stripAttachmentRef(value, attachment.id));
    onRemoveAttachment(attachment);
  };

  return <div className="overflow-hidden rounded-xl border border-slate-200">
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
      <ToolButton icon={Bold} label="加粗" onClick={() => { const { start, end } = selection(); commit(applyWrap(value, start, end, "bold")); }} />
      <ToolButton icon={Italic} label="斜体" onClick={() => { const { start, end } = selection(); commit(applyWrap(value, start, end, "italic")); }} />
      <ToolButton icon={Heading2} label="小标题" onClick={() => { const { start, end } = selection(); commit(applyBlock(value, start, end, "heading")); }} />
      <ToolButton icon={List} label="无序列表" onClick={() => { const { start, end } = selection(); commit(applyBlock(value, start, end, "bullet")); }} />
      <ToolButton icon={ListOrdered} label="有序列表" onClick={() => { const { start, end } = selection(); commit(applyBlock(value, start, end, "ordered")); }} />
      <ToolButton icon={Quote} label="引用" onClick={() => { const { start, end } = selection(); commit(applyBlock(value, start, end, "quote")); }} />
      <ToolButton icon={Code} label="行内代码" onClick={() => { const { start, end } = selection(); commit(applyWrap(value, start, end, "code")); }} />
      <ToolButton icon={Link2} label="插入链接" onClick={() => { const { start, end } = selection(); commit(applyLink(value, start, end)); }} />
      <ToolButton icon={ImagePlus} label="插入图片" onClick={() => fileInput.current?.click()} />
      <div className="ml-auto flex items-center gap-1 rounded-lg bg-white p-0.5 shadow-sm">
        <ModeButton active={mode === "write"} icon={PenLine} label="编辑" onClick={() => setMode("write")} />
        <ModeButton active={mode === "preview"} icon={Eye} label="预览" onClick={() => setMode("preview")} />
      </div>
    </div>

    <div className={cn("grid", mode === "preview" ? "lg:grid-cols-2" : "grid-cols-1")}>
      <div
        onDragOver={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); void uploadFiles(event.dataTransfer.files); }}
        className={cn("relative", mode === "preview" && "hidden lg:block", dragging && "bg-violet-50/60")}
      >
        <textarea
          ref={textarea}
          value={value}
          onChange={event => onChange(event.target.value)}
          onPaste={(event: ClipboardEvent<HTMLTextAreaElement>) => {
            const images = Array.from(event.clipboardData.files).filter(file => isImageMimeType(file.type));
            if (!images.length) return;
            event.preventDefault();
            void uploadFiles(images);
          }}
          placeholder={"描述背景、做法、结果和适用边界。\n\n支持 Markdown：## 小标题、**加粗**、- 列表、> 引用、`代码`。\n可直接粘贴或拖入截图。"}
          className="min-h-64 w-full resize-y bg-transparent p-4 font-mono text-sm leading-7 outline-none placeholder:text-slate-400 lg:min-h-72"
        />
        {dragging && <p className="pointer-events-none absolute inset-3 grid place-items-center rounded-lg border-2 border-dashed border-violet-300 text-sm font-medium text-violet-700"><span className="inline-flex items-center gap-2"><Upload className="h-4 w-4" />松手即插入图片</span></p>}
      </div>
      {mode === "preview" && <div className="min-h-64 overflow-y-auto border-t border-slate-100 bg-slate-50/40 p-4 lg:border-l lg:border-t-0">
        {value.trim() ? <PostContent markdown={value} className="text-sm leading-7" /> : <p className="text-sm text-slate-400">开始写作后这里会显示最终排版效果。</p>}
      </div>}
    </div>

    <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" onChange={event => void uploadFiles(event.target.files)} />

    <div className="border-t border-slate-100 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        {attachments.map(item => <div key={item.id} className="group relative h-16 w-20 overflow-hidden rounded-lg border border-slate-200">
          <img src={item.url} alt={item.fileName} className="h-full w-full object-cover" />
          <button type="button" onClick={() => removeAttachment(item)} aria-label={`移除图片 ${item.fileName}`} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-slate-900/70 text-white transition group-hover:bg-rose-600"><Trash2 className="h-3 w-3" /></button>
        </div>)}
        <Button type="button" variant="outline" size="sm" disabled={isUploading || attachments.length >= 8} onClick={() => fileInput.current?.click()} className="h-16 w-20 flex-col gap-1 rounded-lg border-dashed text-xs text-slate-500">
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {isUploading ? "上传中" : "加图片"}
        </Button>
        <p className="ml-auto text-xs text-slate-400">{plainLength} 字{plainLength < minPlainLength ? ` · 至少 ${minPlainLength} 字` : ""} · 已附 {attachments.length}/8 张图</p>
      </div>
      {notice && <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs leading-5 text-amber-800"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{notice}</p>}
    </div>
  </div>;
}

function ToolButton({ icon: Icon, label, onClick }: { icon: typeof Bold; label: string; onClick: () => void }) {
  return <button type="button" title={label} aria-label={label} onMouseDown={event => event.preventDefault()} onClick={onClick} className="grid h-8 w-8 place-items-center rounded text-slate-600 transition hover:bg-white hover:text-violet-700"><Icon className="h-4 w-4" /></button>;
}

function ModeButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Bold; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition", active ? "bg-violet-600 text-white" : "text-slate-500 hover:text-violet-700")}><Icon className="h-3.5 w-3.5" />{label}</button>;
}
