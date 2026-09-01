// 课程资源讨论区：时间戳评论 + 普通交流，支持删除自己的发言。
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Loader2, MessageCircle, Send, Trash2 } from "lucide-react";
import { useState } from "react";

export type DiscussionComment = { comment: { id: number; materialId: number; content: string; videoSecond: number | null; isDanmaku: number; createdAt: Date }; authorName: string | null };

export default function DiscussionPanel({ materialId, comments, placeholder = "写下你的问题、心得或补充材料" }: { materialId: number; comments: DiscussionComment[]; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const utils = trpc.useUtils();
  const add = trpc.platform.learning.addComment.useMutation({ onSuccess: () => { setDraft(""); void utils.platform.learning.courseExperience.invalidate(); } });
  const remove = trpc.platform.learning.deleteComment.useMutation({ onSuccess: () => { void utils.platform.learning.courseExperience.invalidate(); } });

  return <div className="rounded-xl border border-slate-200 bg-white p-5">
    <div className="flex items-center justify-between">
      <p className="flex items-center gap-1.5 text-sm font-semibold"><MessageCircle className="h-4 w-4 text-violet-600" />交流区 · {comments.length}</p>
      <span className="text-xs text-slate-400">发言仅课程内可见，支持删除自己的评论</span>
    </div>
    <div className="mt-3 flex gap-2">
      <Textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && draft.trim().length >= 1) add.mutate({ materialId, content: draft.trim(), videoSecond: null, isDanmaku: false }); }} placeholder={placeholder} className="min-h-10" />
      <Button disabled={!draft.trim() || add.isPending} onClick={() => add.mutate({ materialId, content: draft.trim(), videoSecond: null, isDanmaku: false })} className="bg-violet-600 hover:bg-violet-500">{add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
    </div>
    <div className="mt-4 space-y-3">
      {comments.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">还没有讨论。第一个提问的人往往带动整门课的复盘氛围。</p>}
      {comments.slice().reverse().map(item => <div key={item.comment.id} className={cn("group flex gap-3 rounded-lg border p-3", item.comment.isDanmaku ? "border-violet-100 bg-violet-50/40" : "border-slate-100 bg-slate-50/60")}>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-xs font-bold text-white">{(item.authorName || "员").slice(0, 1)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{item.authorName || "员工"}</span>
            {item.comment.videoSecond !== null && <span className="rounded bg-violet-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-violet-700">@{item.comment.videoSecond}s</span>}
            {item.comment.isDanmaku === 1 && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">弹幕</span>}
            <span>{new Date(item.comment.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-800">{item.comment.content}</p>
        </div>
        <button onClick={() => remove.mutate({ commentId: item.comment.id })} aria-label="删除评论" className="h-fit opacity-0 transition group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-rose-500" /></button>
      </div>)}
    </div>
  </div>;
}
