// 发帖与编辑共用的对话框：内容元信息 + Markdown 编辑器。
// 关闭/取消时清理尚未发布的草稿附件，避免留下孤儿文件。
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  markdownToPlainText,
  POST_KIND_LABEL,
  REPLY_POLICY_LABEL,
  type PostKind,
} from "@/lib/communityContent";
import { Loader2, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import MarkdownComposer, { type ComposerAttachment } from "./MarkdownComposer";

export type PostDraft = {
  postId?: number;
  postType: PostKind;
  title: string;
  markdown: string;
  tags: string[];
  replyPolicy: "all" | "mentioned" | "experts" | "operations";
  quotePostId: number | null;
  attachments: ComposerAttachment[];
};

export function emptyDraft(quotePostId: number | null = null): PostDraft {
  return {
    postType: "experience",
    title: "",
    markdown: "",
    tags: [],
    replyPolicy: "all",
    quotePostId,
    attachments: [],
  };
}

export default function PostEditorDialog({
  draft,
  onClose,
  onSaved,
}: {
  draft: PostDraft | null;
  onClose: () => void;
  onSaved: (postId: number) => void;
}) {
  const utils = trpc.useUtils();
  const [postType, setPostType] = useState<PostKind>("experience");
  const [title, setTitle] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [tagText, setTagText] = useState("");
  const [replyPolicy, setReplyPolicy] =
    useState<PostDraft["replyPolicy"]>("all");
  const [quotePostId, setQuotePostId] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  // 本次会话新上传、尚未随帖子保存的附件；取消时需要清理。
  const pendingIds = useRef<Set<number>>(new Set());
  const removedIds = useRef<Set<number>>(new Set());

  const isEditing = Boolean(draft?.postId);
  const { data: quotable } = trpc.platform.community.list.useQuery(undefined, {
    enabled: Boolean(draft) && !isEditing,
  });

  useEffect(() => {
    if (!draft) return;
    setPostType(draft.postType);
    setTitle(draft.title);
    setMarkdown(draft.markdown);
    setTagText(draft.tags.join("，"));
    setReplyPolicy(draft.replyPolicy);
    setQuotePostId(draft.quotePostId);
    setAttachments(draft.attachments);
    pendingIds.current = new Set();
    removedIds.current = new Set();
  }, [draft]);

  const upload = trpc.platform.community.uploadImage.useMutation();
  const discard = trpc.platform.community.discardAttachment.useMutation();
  const create = trpc.platform.community.create.useMutation();
  const update = trpc.platform.community.update.useMutation();
  const isSaving = create.isPending || update.isPending;

  const cleanupPending = async () => {
    const ids = Array.from(pendingIds.current);
    pendingIds.current = new Set();
    await Promise.allSettled(ids.map(id => discard.mutateAsync({ id })));
  };

  const close = () => {
    void cleanupPending();
    onClose();
  };

  const parsedTags = Array.from(new Set(tagText.split(/[，,]/).map(item => item.trim()).filter(Boolean)));
  const tagError = parsedTags.length > 12 ? "最多填写 12 个标签，请删除多余标签。" : parsedTags.some(tag => tag.length > 48) ? "单个标签不能超过 48 个字。" : null;

  const submit = async () => {
    if (tagError) return;
    const tags = parsedTags;
    const payload = {
      postType,
      title: title.trim(),
      markdown,
      tags,
      replyPolicy,
      attachmentIds: Array.from(pendingIds.current),
    };
    try {
      const result = draft?.postId
        ? await update.mutateAsync({
            ...payload,
            postId: draft.postId,
            removedAttachmentIds: Array.from(removedIds.current),
          })
        : await create.mutateAsync({
            ...payload,
            quotePostId: quotePostId ?? null,
          });
      pendingIds.current = new Set();
      removedIds.current = new Set();
      toast.success(draft?.postId ? "实践已更新" : "实践已发布");
      await Promise.all([
        utils.platform.community.list.invalidate(),
        draft?.postId
          ? utils.platform.community.detail.invalidate({ postId: draft.postId })
          : Promise.resolve(),
      ]);
      // 保存成功后由调用方负责收起对话框与跳转，避免与路由重置互相覆盖。
      onSaved(result.postId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败，请重试");
    }
  };

  const plainLength = markdownToPlainText(markdown).length;
  const canSubmit =
    title.trim().length >= 4 &&
    plainLength >= 12 &&
    !tagError &&
    !isSaving &&
    !upload.isPending;

  return (
    <Dialog
      open={Boolean(draft)}
      onOpenChange={open => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-h-[92vh] gap-4 overflow-y-auto sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {isEditing ? "编辑实践记录" : "发布一份实践记录"}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            支持 Markdown
            图文混排，可粘贴或拖入截图。请勿上传敏感数据或未公开资料。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(POST_KIND_LABEL) as PostKind[]).map(kind => (
              <button
                key={kind}
                type="button"
                onClick={() => setPostType(kind)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                  postType === kind
                    ? "bg-violet-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {POST_KIND_LABEL[kind]}
              </button>
            ))}
          </div>

          <Input
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="写一个能让同事判断是否相关的标题"
          />
          <div className="flex items-center justify-between gap-3 text-xs"><span className={tagError ? "text-rose-600" : "text-slate-400"}>{tagError || "重复标签会自动合并"}</span><span className={parsedTags.length > 12 ? "font-semibold text-rose-600" : "text-slate-400"}>{parsedTags.length}/12</span></div>

          <div
            className={cn(
              "grid gap-3",
              isEditing ? "sm:grid-cols-1" : "sm:grid-cols-2"
            )}
          >
            {!isEditing && (
              <select
                value={quotePostId ?? ""}
                onChange={event =>
                  setQuotePostId(
                    event.target.value ? Number(event.target.value) : null
                  )
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">不引用其他实践</option>
                {quotable?.map(({ post }) => (
                  <option key={post.id} value={post.id}>
                    引用：{post.title}
                  </option>
                ))}
              </select>
            )}
            <select
              value={replyPolicy}
              onChange={event =>
                setReplyPolicy(event.target.value as PostDraft["replyPolicy"])
              }
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {Object.entries(REPLY_POLICY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <MarkdownComposer
            value={markdown}
            onChange={setMarkdown}
            attachments={attachments}
            isUploading={upload.isPending}
            onUpload={async payload => {
              try {
                const attachment = await upload.mutateAsync(payload);
                pendingIds.current.add(attachment.id);
                setAttachments(prev => [
                  ...prev,
                  {
                    id: attachment.id,
                    url: attachment.url,
                    fileName: attachment.fileName,
                  },
                ]);
                return attachment;
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "图片上传失败"
                );
                return null;
              }
            }}
            onRemoveAttachment={attachment => {
              setAttachments(prev =>
                prev.filter(item => item.id !== attachment.id)
              );
              if (pendingIds.current.delete(attachment.id))
                discard.mutate({ id: attachment.id });
              else removedIds.current.add(attachment.id);
            }}
          />

          <Input
            value={tagText}
            onChange={event => setTagText(event.target.value)}
            placeholder="标签，逗号分隔，例如：提示词, 周报, 质量管理"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            取消
          </Button>
          <Button disabled={!canSubmit} onClick={() => void submit()}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {isEditing ? "保存修改" : "发布实践"}
            {!isSaving && <Send className="ml-2 h-4 w-4" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
