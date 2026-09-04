// 实践详情：Markdown 正文渲染、图片灯箱、作者编辑删除与管理员治理、讨论删除。
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import PlatformShell from "@/components/PlatformShell";
import { ConfirmActionDialog, ReasonActionDialog } from "@/components/ConfirmActionDialog";
import ImageLightbox, {
  type LightboxImage,
} from "@/components/community/ImageLightbox";
import PostContent from "@/components/community/PostContent";
import PostEditorDialog, {
  type PostDraft,
} from "@/components/community/PostEditorDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  normalizeTags,
  POST_KIND_LABEL,
  REPLY_POLICY_LABEL,
  type PostKind,
} from "@/lib/communityContent";
import {
  ArrowLeft,
  Bookmark,
  Heart,
  ImageIcon,
  Loader2,
  MessageCircleMore,
  Pencil,
  Pin,
  Quote,
  Send,
  Star,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

export default function PostDetail() {
  const { isAuthenticated } = useAuth();
  const [, params] = useRoute("/community/:id");
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const parsedId = Number(params?.id);
  const postId =
    Number.isSafeInteger(parsedId) && parsedId > 0 ? parsedId : null;
  const [comment, setComment] = useState("");
  const [draft, setDraft] = useState<PostDraft | null>(null);
  const [preview, setPreview] = useState<LightboxImage | null>(null);
  const [likedOverride, setLikedOverride] = useState<boolean | null>(null);
  const [favoriteOverride, setFavoriteOverride] = useState<boolean | null>(
    null
  );

  const { data, isLoading, isError } = trpc.platform.community.detail.useQuery(
    { postId: postId ?? 0 },
    { enabled: isAuthenticated && postId !== null, retry: false }
  );
  const { data: favorites } = trpc.platform.community.favorites.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const refresh = () => {
    if (postId) void utils.platform.community.detail.invalidate({ postId });
    void utils.platform.community.list.invalidate();
  };
  const addComment = trpc.platform.community.createComment.useMutation({
    onSuccess: () => {
      setComment("");
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const deleteComment = trpc.platform.community.deleteComment.useMutation({
    onSuccess: () => {
      toast.success("讨论已删除");
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const like = trpc.platform.community.toggleLike.useMutation({
    onSuccess: result => {
      setLikedOverride(result.liked);
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const toggleFavorite = trpc.platform.community.toggleFavorite.useMutation({
    onSuccess: result => {
      setFavoriteOverride(result.favorited);
      void utils.platform.community.favorites.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const promote = trpc.platform.community.setPromotion.useMutation({
    onSuccess: refresh,
    onError: error => toast.error(error.message),
  });
  const removePost = trpc.platform.community.remove.useMutation({
    onSuccess: () => {
      toast.success("实践已删除");
      void utils.platform.community.list.invalidate();
      setLocation("/community");
    },
    onError: error => toast.error(error.message),
  });

  if (!isAuthenticated)
    return (
      <PlatformShell>
        <main className="mx-auto grid min-h-[70vh] max-w-xl place-items-center px-4 text-center">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="font-serif text-3xl">登录后查看内部实践</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              实践帖、讨论和图片附件仅面向已登录的企业员工开放。
            </p>
            <Button onClick={() => startLogin()} className="mt-6">
              登录后阅读
            </Button>
          </div>
        </main>
      </PlatformShell>
    );
  if (postId === null || isError)
    return <Unavailable onBack={() => setLocation("/community")} />;
  if (isLoading)
    return (
      <PlatformShell>
        <div className="grid min-h-[70vh] place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
        </div>
      </PlatformShell>
    );
  if (!data) return <Unavailable onBack={() => setLocation("/community")} />;

  const {
    post,
    authorName,
    attachments,
    comments,
    markdown,
    canEdit,
    canModerate,
  } = data;
  const tags = normalizeTags(post.tags);
  const baseFavorited = (favorites ?? []).some(item => item.postId === postId);
  const isFavorited = favoriteOverride ?? baseFavorited;
  const baseLiked = Boolean(data.liked);
  const isLiked = likedOverride ?? baseLiked;
  const shownLikeCount = post.likeCount + Number(isLiked) - Number(baseLiked);

  return (
    <PlatformShell>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <button
          onClick={() => setLocation("/community")}
          className="flex items-center text-sm text-slate-500 hover:text-violet-700"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回实践社区
        </button>

        <article className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-9">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
              {POST_KIND_LABEL[post.postType as PostKind]}
            </span>
            {post.isPinned ? (
              <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                置顶
              </span>
            ) : null}
            {post.isFeatured ? (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                运营精选
              </span>
            ) : null}
            <span className="text-sm text-slate-500">
              {authorName || "平台成员"}
            </span>
            <span className="text-sm text-slate-300">·</span>
            <span className="text-sm text-slate-500">
              {new Date(post.createdAt).toLocaleDateString()}
            </span>
            {post.editedAt ? (
              <span className="text-xs text-slate-400">
                编辑于 {new Date(post.editedAt).toLocaleDateString()}
              </span>
            ) : null}
            <span className="ml-auto text-xs text-slate-400">
              {REPLY_POLICY_LABEL[post.replyPolicy] ?? post.replyPolicy}
            </span>
          </div>

          <h1 className="mt-5 font-serif text-3xl leading-tight md:text-4xl">
            {post.title}
          </h1>

          {(canEdit || canModerate) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  onClick={() =>
                    setDraft({
                      postId: post.id,
                      postType: post.postType as PostKind,
                      title: post.title,
                      markdown,
                      tags,
                      replyPolicy: post.replyPolicy,
                      quotePostId: post.quotePostId,
                      attachments,
                    })
                  }
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  编辑
                </Button>
              )}
              {canModerate && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-lg"
                    onClick={() =>
                      promote.mutate({ postId, isPinned: !post.isPinned })
                    }
                  >
                    <Pin className="mr-1.5 h-3.5 w-3.5" />
                    {post.isPinned ? "取消置顶" : "置顶"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-lg"
                    onClick={() =>
                      promote.mutate({ postId, isFeatured: !post.isFeatured })
                    }
                  >
                    <Star className="mr-1.5 h-3.5 w-3.5" />
                    {post.isFeatured ? "取消精选" : "设为精选"}
                  </Button>
                </>
              )}
              {canEdit && <ReasonActionDialog title={`删除“${post.title}”？`} description="实践将被软删除并从员工端隐藏；管理员处置他人内容时请填写明确原因。" defaultReason={canModerate ? "内容需要下线" : ""} minLength={canModerate ? 4 : 0} pending={removePost.isPending} onConfirm={reason => removePost.mutate({ postId, reason })} trigger={<Button size="sm" variant="outline" className="rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50"><Trash2 className="mr-1.5 h-3.5 w-3.5" />删除</Button>} />}
            </div>
          )}

          {post.quotePostId ? (
            <button
              onClick={() => setLocation(`/community/${post.quotePostId}`)}
              className="mt-4 flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-700 hover:bg-violet-100"
            >
              <Quote className="h-4 w-4" />
              引用实践 #{post.quotePostId} · 查看原始经验
            </button>
          ) : null}

          <PostContent markdown={markdown} className="mt-7" />

          {attachments.length ? (
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {attachments.map(attachment => (
                <button
                  key={attachment.id}
                  type="button"
                  onClick={() =>
                    setPreview({
                      url: attachment.url,
                      fileName: attachment.fileName,
                    })
                  }
                  className="overflow-hidden rounded-xl border border-slate-200 text-left transition hover:border-violet-300"
                >
                  <img
                    src={attachment.url}
                    alt={attachment.fileName}
                    className="max-h-[420px] w-full bg-slate-50 object-contain"
                  />
                  <p className="flex items-center gap-2 p-3 text-xs text-slate-500">
                    <ImageIcon className="h-3.5 w-3.5" />
                    {attachment.fileName}
                  </p>
                </button>
              ))}
            </div>
          ) : null}

          {tags.length ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
                >
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center gap-2 border-t pt-5">
            <Button
              disabled={like.isPending}
              aria-pressed={isLiked}
              onClick={() => like.mutate({ postId })}
              variant="outline"
              className="rounded-lg"
            >
              <Heart
                className={`mr-2 h-4 w-4 ${isLiked ? "fill-current text-rose-600" : ""}`}
              />
              {like.isPending
                ? "处理中"
                : isLiked
                  ? `已点赞 ${shownLikeCount}`
                  : `点赞 ${shownLikeCount}`}
            </Button>
            <Button
              disabled={toggleFavorite.isPending}
              aria-pressed={isFavorited}
              onClick={() => toggleFavorite.mutate({ postId })}
              variant="outline"
              className="rounded-lg"
            >
              <Bookmark
                className={`mr-2 h-4 w-4 ${isFavorited ? "fill-current" : ""}`}
              />
              {toggleFavorite.isPending
                ? "处理中"
                : isFavorited
                  ? "已收藏"
                  : "收藏"}
            </Button>
            <span className="text-sm text-slate-500">
              {post.commentCount} 条讨论
            </span>
          </div>
        </article>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <MessageCircleMore className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-semibold">讨论</h2>
          </div>
          <div className="mt-5 space-y-4">
            {comments.length ? (
              comments.map(
                ({ comment: item, authorName: commentAuthor, canDelete }) => (
                  <article key={item.id} className="rounded-xl bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-violet-700">
                        {commentAuthor || "平台成员"}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">
                          {new Date(item.createdAt).toLocaleString()}
                        </span>
                        {canDelete && <ConfirmActionDialog title="删除这条实践讨论？" description="删除后无法恢复，其他成员也将不再看到这条内容。" confirmLabel="确认删除" pending={deleteComment.isPending && deleteComment.variables?.commentId === item.id} onConfirm={() => deleteComment.mutate({ commentId: item.id })} trigger={<button aria-label="删除讨论" className="grid h-7 w-7 place-items-center rounded text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>} />}
                      </div>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                      {item.content}
                    </p>
                  </article>
                )
              )
            ) : (
              <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">
                还没有讨论。欢迎补充实践建议或提出问题。
              </p>
            )}
          </div>
          <div className="mt-6 border-t pt-5">
            <Textarea
              value={comment}
              onChange={event => setComment(event.target.value)}
              placeholder="写下你的问题、补充或实践建议…"
            />
            <div className="mt-3 flex justify-end">
              <Button
                disabled={comment.trim().length < 2 || addComment.isPending}
                onClick={() => addComment.mutate({ postId, content: comment })}
              >
                发布讨论
                <Send className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        <PostEditorDialog
          draft={draft}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            refresh();
          }}
        />
        <ImageLightbox image={preview} onClose={() => setPreview(null)} />
      </main>
    </PlatformShell>
  );
}

function Unavailable({ onBack }: { onBack: () => void }) {
  return (
    <PlatformShell>
      <main className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="font-serif text-3xl">这份实践暂不可查看</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          内容可能已被作者删除或运营下线。
        </p>
        <Button onClick={onBack} className="mt-6">
          返回社区
        </Button>
      </main>
    </PlatformShell>
  );
}
