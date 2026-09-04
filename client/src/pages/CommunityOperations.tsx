// 社区内容治理：管理员检索全部实践（含已删除），置顶/精选、删除与恢复并记录原因。
import { useAuth } from "@/_core/hooks/useAuth";
import { ReasonActionDialog } from "@/components/ConfirmActionDialog";
import PlatformShell from "@/components/PlatformShell";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { POST_KIND_LABEL, type PostKind } from "@/lib/communityContent";
import {
  ArchiveRestore,
  ArrowLeft,
  Loader2,
  MessageCircleMore,
  Pin,
  Search,
  ShieldAlert,
  Star,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const statusTabs = [
  { value: "all", label: "全部" },
  { value: "visible", label: "员工可见" },
  { value: "deleted", label: "已删除" },
] as const;

export default function CommunityOperations() {
  const { user, isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [status, setStatus] =
    useState<(typeof statusTabs)[number]["value"]>("all");
  const [search, setSearch] = useState("");
  const allowed = isAuthenticated && user?.role === "admin";

  const posts = trpc.platform.community.adminPosts.useQuery(
    { status, search: search.trim() || undefined },
    { enabled: allowed }
  );
  const refresh = () => {
    void utils.platform.community.adminPosts.invalidate();
    void utils.platform.community.list.invalidate();
  };
  const promote = trpc.platform.community.setPromotion.useMutation({
    onSuccess: refresh,
    onError: error => toast.error(error.message),
  });
  const remove = trpc.platform.community.remove.useMutation({
    onSuccess: () => {
      toast.success("已删除并记录处置原因");
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const restore = trpc.platform.community.restore.useMutation({
    onSuccess: () => {
      toast.success("已恢复到员工端");
      refresh();
    },
    onError: error => toast.error(error.message),
  });

  if (loading)
    return (
      <PlatformShell>
        <div className="grid min-h-[68vh] place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
        </div>
      </PlatformShell>
    );
  if (!allowed)
    return (
      <PlatformShell>
        <main className="mx-auto grid min-h-[68vh] max-w-xl place-items-center px-5 text-center">
          <div>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-rose-50">
              <ShieldAlert className="h-7 w-7 text-rose-600" />
            </div>
            <h1 className="mt-6 font-serif text-4xl font-semibold">
              此区域仅对运营管理员开放
            </h1>
            <p className="mt-4 leading-7 text-slate-500">
              社区内容处置由服务端角色权限保护，员工账号无法访问。
            </p>
            <Button
              onClick={() => setLocation("/")}
              className="mt-7 rounded-full"
            >
              返回员工端
            </Button>
          </div>
        </main>
      </PlatformShell>
    );

  const rows = posts.data ?? [];

  return (
    <PlatformShell>
      <main className="mx-auto max-w-[1300px] px-5 py-8 lg:px-10">
        <button
          onClick={() => setLocation("/operations")}
          className="flex items-center text-sm text-slate-500 hover:text-violet-700"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回运营管理
        </button>
        <div className="mt-6">
          <p className="section-kicker">COMMUNITY GOVERNANCE / ADMIN ONLY</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold">
            社区内容治理
          </h1>
          <p className="mt-3 max-w-3xl text-slate-500">
            删除采用软删除：员工端立即不可见，记录处置原因、操作人与时间，必要时可恢复。置顶与精选用于把高质量实践推到更多同事面前。
          </p>
        </div>

        <section className="mt-7 rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {statusTabs.map(tab => (
                <button
                  key={tab.value}
                  onClick={() => setStatus(tab.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${status === tab.value ? "bg-violet-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="relative w-full lg:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="搜索标题或正文"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-violet-400"
              />
            </div>
          </div>

          {posts.isLoading ? (
            <p className="mt-6 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中…
            </p>
          ) : rows.length ? (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {rows.map(item => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-violet-50 px-2.5 py-1 font-semibold text-violet-700">
                      {POST_KIND_LABEL[item.postType as PostKind]}
                    </span>
                    {item.isPinned && (
                      <span className="rounded-full bg-slate-900 px-2.5 py-1 font-semibold text-white">
                        置顶
                      </span>
                    )}
                    {item.isFeatured && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-700">
                        精选
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2.5 py-1 font-semibold ${item.isDeleted ? "bg-rose-100 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}
                    >
                      {item.isDeleted ? "已删除" : "员工可见"}
                    </span>
                    <span className="ml-auto text-slate-400">
                      {item.authorName || "平台成员"} ·{" "}
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <button
                    onClick={() => setLocation(`/community/${item.id}`)}
                    className="mt-3 block w-full text-left"
                  >
                    <p className="font-semibold hover:text-violet-700">
                      {item.title}
                    </p>
                    <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-slate-500">
                      {item.preview}
                    </p>
                  </button>

                  <p className="mt-3 flex items-center gap-3 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3.5 w-3.5" />
                      {item.likeCount} 赞
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircleMore className="h-3.5 w-3.5" />
                      {item.commentCount} 讨论
                    </span>
                  </p>

                  {item.isDeleted && item.deletionReason ? (
                    <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
                      处置记录：{item.deletionReason}
                      {item.deletedAt
                        ? ` · ${new Date(item.deletedAt).toLocaleString()}`
                        : ""}
                      {item.deletedBy ? ` · 操作人 #${item.deletedBy}` : ""}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.isDeleted ? (
                      <ReasonActionDialog
                        title={`恢复「${item.title}」`}
                        description="恢复后内容将重新对员工可见，处置原因会写入审计记录。"
                        defaultReason="内容已符合发布要求"
                        minLength={4}
                        confirmLabel="确认恢复"
                        actionTone="positive"
                        pending={restore.isPending}
                        onConfirm={reason =>
                          restore.mutate({ postId: item.id, reason: reason! })
                        }
                        trigger={
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-emerald-200 text-emerald-700"
                            disabled={restore.isPending}
                          >
                            <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />
                            恢复
                          </Button>
                        }
                      />
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            promote.mutate({
                              postId: item.id,
                              isPinned: !item.isPinned,
                            })
                          }
                        >
                          <Pin className="mr-1.5 h-3.5 w-3.5" />
                          {item.isPinned ? "取消置顶" : "置顶"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            promote.mutate({
                              postId: item.id,
                              isFeatured: !item.isFeatured,
                            })
                          }
                        >
                          <Star className="mr-1.5 h-3.5 w-3.5" />
                          {item.isFeatured ? "取消精选" : "精选"}
                        </Button>
                        <ReasonActionDialog
                          title={`删除「${item.title}」`}
                          description="内容会立即从员工端隐藏，但保留记录以便审计与恢复。"
                          defaultReason="内容不符合社区规范"
                          minLength={4}
                          pending={remove.isPending}
                          onConfirm={reason =>
                            remove.mutate({ postId: item.id, reason: reason! })
                          }
                          trigger={
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-rose-200 text-rose-700"
                              disabled={remove.isPending}
                            >
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                              删除
                            </Button>
                          }
                        />
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              当前筛选条件下没有实践内容。
            </p>
          )}

          {rows.length >= 80 && (
            <p className="mt-3 text-xs text-slate-400">
              已达单次加载上限 80 条，可用搜索缩小范围。
            </p>
          )}
        </section>
      </main>
    </PlatformShell>
  );
}
