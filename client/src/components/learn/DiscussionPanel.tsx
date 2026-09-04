// 课程资源讨论区：时间戳评论 + 普通交流，支持删除自己的发言。
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Loader2, MessageCircle, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export type DiscussionComment = {
  comment: {
    id: number;
    materialId: number;
    content: string;
    videoSecond: number | null;
    isDanmaku: number;
    createdAt: Date;
  };
  authorName: string | null;
  canDelete?: boolean;
};

export default function DiscussionPanel({
  materialId,
  comments,
  placeholder = "写下你的问题、心得或补充材料",
}: {
  materialId: number;
  comments: DiscussionComment[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const utils = trpc.useUtils();
  const add = trpc.platform.learning.addComment.useMutation({
    onSuccess: () => {
      setDraft("");
      toast.success("讨论已发布");
      void utils.platform.learning.courseExperience.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.platform.learning.deleteComment.useMutation({
    onSuccess: () => {
      toast.success("讨论已删除");
      void utils.platform.learning.courseExperience.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const canSubmit = draft.trim().length > 0 && draft.length <= 500;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <MessageCircle className="h-4 w-4 text-violet-600" />
          交流区 · {comments.length}
        </p>
        <span className="text-xs text-slate-400">
          发言仅课程内可见，支持删除自己的评论
        </span>
      </div>
      <div className="mt-3 flex gap-2">
        <div className="min-w-0 flex-1">
          <Textarea
            value={draft}
            maxLength={500}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (
                event.key === "Enter" &&
                (event.metaKey || event.ctrlKey) &&
                canSubmit
              )
                add.mutate({
                  materialId,
                  content: draft.trim(),
                  videoSecond: null,
                  isDanmaku: false,
                });
            }}
            placeholder={placeholder}
            className="min-h-10"
          />
          <p className="mt-1 text-right text-[11px] text-slate-400">
            {draft.length}/500
          </p>
        </div>
        <Button
          disabled={!canSubmit || add.isPending}
          onClick={() =>
            add.mutate({
              materialId,
              content: draft.trim(),
              videoSecond: null,
              isDanmaku: false,
            })
          }
          className="bg-violet-600 hover:bg-violet-500"
        >
          {add.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      <div className="mt-4 space-y-3">
        {comments.length === 0 && (
          <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
            还没有讨论。第一个提问的人往往带动整门课的复盘氛围。
          </p>
        )}
        {comments
          .slice()
          .reverse()
          .map(item => (
            <div
              key={item.comment.id}
              className={cn(
                "group flex gap-3 rounded-lg border p-3",
                item.comment.isDanmaku
                  ? "border-violet-100 bg-violet-50/40"
                  : "border-slate-100 bg-slate-50/60"
              )}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-xs font-bold text-white">
                {(item.authorName || "员").slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">
                    {item.authorName || "员工"}
                  </span>
                  {item.comment.videoSecond !== null && (
                    <span className="rounded bg-violet-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-violet-700">
                      @{item.comment.videoSecond}s
                    </span>
                  )}
                  {item.comment.isDanmaku === 1 && (
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                      弹幕
                    </span>
                  )}
                  <span>
                    {new Date(item.comment.createdAt).toLocaleString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-800">
                  {item.comment.content}
                </p>
              </div>
              {item.canDelete && (
                <ConfirmActionDialog
                  title="删除这条课程讨论？"
                  description="删除后无法恢复，其他学习者也将不再看到这条内容。"
                  confirmLabel="确认删除"
                  pending={
                    remove.isPending &&
                    remove.variables?.commentId === item.comment.id
                  }
                  onConfirm={() =>
                    remove.mutate({ commentId: item.comment.id })
                  }
                  trigger={
                    <button
                      aria-label="删除评论"
                      className="h-8 w-8 shrink-0 rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                    >
                      <Trash2 className="mx-auto h-3.5 w-3.5" />
                    </button>
                  }
                />
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
