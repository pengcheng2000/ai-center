// 实践社区列表：Markdown 摘要、图片灯箱预览、作者与管理员操作入口。
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import PlatformShell from "@/components/PlatformShell";
import ImageLightbox, { type LightboxImage } from "@/components/community/ImageLightbox";
import PostEditorDialog, { emptyDraft, type PostDraft } from "@/components/community/PostEditorDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { normalizeTags, POST_KIND_LABEL, type PostKind } from "@/lib/communityContent";
import { Bookmark, Heart, ImageIcon, Loader2, MessageCircleMore, Pencil, Pin, Plus, Search, Sparkles, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Community() {
  const { isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: posts, isLoading } = trpc.platform.community.list.useQuery(undefined, { enabled: isAuthenticated });
  const { data: topics } = trpc.platform.community.topics.useQuery(undefined, { enabled: isAuthenticated });
  const { data: favorites } = trpc.platform.community.favorites.useQuery(undefined, { enabled: isAuthenticated });
  const { data: personal } = trpc.platform.personal.get.useQuery(undefined, { enabled: isAuthenticated });
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<PostDraft | null>(null);
  const [topicId, setTopicId] = useState<number | null>(null);
  const [sort, setSort] = useState<"recent" | "hot">("recent");
  const [preview, setPreview] = useState<LightboxImage | null>(null);

  useEffect(() => { if (location.startsWith("/community/new") && isAuthenticated) setDraft(emptyDraft()); }, [location, isAuthenticated]);

  const closeEditor = () => { setDraft(null); if (location.startsWith("/community/new")) setLocation("/community"); };

  const invalidateFeed = () => { void utils.platform.community.list.invalidate(); void utils.platform.personal.get.invalidate(); };
  const toggleLike = trpc.platform.community.toggleLike.useMutation({ onSuccess: invalidateFeed });
  const toggleFavorite = trpc.platform.community.toggleFavorite.useMutation({ onSuccess: () => utils.platform.community.favorites.invalidate() });
  const toggleTopic = trpc.platform.community.toggleTopicFollow.useMutation({ onSuccess: () => utils.platform.community.topics.invalidate() });
  const removePost = trpc.platform.community.remove.useMutation({ onSuccess: () => { toast.success("实践已删除"); invalidateFeed(); }, onError: error => toast.error(error.message) });
  const promote = trpc.platform.community.setPromotion.useMutation({ onSuccess: invalidateFeed, onError: error => toast.error(error.message) });

  if (!isAuthenticated) return <PlatformShell><main className="mx-auto grid min-h-[70vh] max-w-xl place-items-center px-4 text-center"><div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><Sparkles className="mx-auto h-8 w-8 text-violet-600" /><h1 className="mt-4 font-serif text-3xl">登录后进入实践社区</h1><p className="mt-3 text-sm leading-6 text-slate-500">这里沉淀的是企业内部的工作方法、案例与讨论。登录后可阅读、互动并发布自己的实践。</p><Button onClick={() => startLogin()} className="mt-6 rounded-lg">登录并进入社区</Button></div></main></PlatformShell>;

  const liked = new Set((personal?.likedPosts ?? []).map(item => item.postId));
  const saved = new Set((favorites ?? []).map(item => item.postId));
  const selectedTopic = topics?.find(item => item.id === topicId);
  const keyword = query.trim().toLowerCase();
  const visible = (posts ?? []).filter(item => {
    const tags = normalizeTags(item.post.tags);
    const haystack = `${item.post.title} ${item.preview} ${tags.join(" ")}`.toLowerCase();
    return haystack.includes(keyword) && (!selectedTopic || tags.includes(selectedTopic.name));
  });
  const score = (item: (typeof visible)[number]) => item.post.likeCount * 2 + item.post.commentCount + (item.post.isFeatured ? 20 : 0);
  const ordered = [...visible].sort((a, b) => sort === "hot" ? score(b) - score(a) : Number(new Date(b.post.createdAt)) - Number(new Date(a.post.createdAt)));

  return <PlatformShell><main className="mx-auto max-w-[1440px] px-4 py-7 lg:px-7">
    <header className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-end lg:justify-between">
      <div><p className="section-kicker">PRACTICE COMMUNITY</p><h1 className="mt-1 font-serif text-4xl font-semibold">实践不是展示，是可复用的工作资产。</h1><p className="mt-2 text-sm text-slate-500">记录真实场景、方法、结果和边界。让一人的试验，成为更多人的起点。</p></div>
      <Button onClick={() => setDraft(emptyDraft())} className="rounded-lg"><Plus className="mr-2 h-4 w-4" />发布实践</Button>
    </header>

    <div className="mt-6 grid gap-5 xl:grid-cols-[.72fr_1.28fr]">
      <aside className="space-y-4">
        <section className="rounded-2xl bg-slate-950 p-5 text-white"><p className="text-xs font-bold tracking-[.16em] text-violet-300">COMMUNITY PRINCIPLE</p><p className="mt-3 text-lg font-semibold leading-7">写下什么有效，也写下什么不适用。</p><p className="mt-3 text-sm leading-6 text-slate-300">高质量实践应说明背景、过程、结果与使用边界，让经验经得起复用和复盘。</p><Button onClick={() => setDraft(emptyDraft())} variant="secondary" className="mt-5 w-full rounded-lg bg-white text-slate-900">开始一份实践记录</Button></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between"><p className="font-semibold">关注主题</p><button onClick={() => setTopicId(null)} className="text-xs text-violet-700">全部</button></div>
          <div className="mt-4 flex flex-wrap gap-2">{topics?.map(topic => <div key={topic.id} className={cn("rounded-full border px-3 py-1.5 text-xs font-medium", topic.id === topicId ? "border-violet-600 bg-violet-600 text-white" : "border-violet-100 bg-violet-50 text-violet-700")}><button onClick={() => setTopicId(topic.id === topicId ? null : topic.id)}>#{topic.name}</button><button onClick={() => toggleTopic.mutate({ topicId: topic.id })} className="ml-1.5 opacity-80">{topic.isFollowed ? "已关注" : "+关注"}</button></div>)}</div>
          <p className="mt-4 text-xs leading-5 text-slate-500">高价值排序综合有效互动、运营精选和讨论量；主题关注用于员工的个人知识流，而非公开社交分发。</p>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="font-semibold">写作提示</p>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <Tip label="描述工作场景" text="先说清问题，读者才能判断是否适用。" />
            <Tip label="展示方法和关键提示" text="用小标题分段，配上过程截图或可复用模板。" />
            <Tip label="标注使用边界" text="涉及内部信息时请避免粘贴敏感数据。" />
          </div>
        </section>
      </aside>

      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">{selectedTopic ? `#${selectedTopic.name}` : "全部实践"} <span className="text-sm font-normal text-slate-400">{ordered.length}</span></h2>
            <div className="mt-2 flex gap-2">
              <button onClick={() => setSort("recent")} className={cn("rounded-full px-3 py-1 text-xs", sort === "recent" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500")}>最新</button>
              <button onClick={() => setSort("hot")} className={cn("rounded-full px-3 py-1 text-xs", sort === "hot" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500")}>高价值</button>
            </div>
          </div>
          <div className="relative w-full sm:w-72"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={query} onChange={event => setQuery(event.target.value)} className="pl-9" placeholder="搜索实践、标签或问题" /></div>
        </div>

        {isLoading ? <div className="grid min-h-80 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-violet-600" /></div> : ordered.length ? <div className="mt-4 space-y-3">{ordered.map(item => {
          const tags = normalizeTags(item.post.tags);
          return <article key={item.post.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-200">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">{POST_KIND_LABEL[item.post.postType as PostKind]}</span>
              {item.post.isPinned ? <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">置顶</span> : null}
              {item.post.isFeatured ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">运营精选</span> : null}
              <span className="text-xs text-slate-400">{item.authorName || "平台成员"}</span>
              <span className="text-xs text-slate-400">{new Date(item.post.createdAt).toLocaleDateString()}</span>
              {item.post.editedAt ? <span className="text-xs text-slate-300">已编辑</span> : null}
            </div>

            <button onClick={() => setLocation(`/community/${item.post.id}`)} className="mt-3 block w-full text-left">
              <h3 className="text-lg font-semibold hover:text-violet-700">{item.post.title}</h3>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{item.preview}</p>
            </button>

            {item.attachments.length ? <div className="mt-4 flex gap-2 overflow-x-auto pb-1">{item.attachments.slice(0, 4).map(attachment => <button key={attachment.id} type="button" onClick={() => setPreview({ url: attachment.url, fileName: attachment.fileName })} aria-label={`预览图片 ${attachment.fileName}`} className="group relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-slate-200">
              <img src={attachment.url} alt={attachment.fileName} className="h-full w-full object-cover transition group-hover:scale-105" />
              <span className="absolute bottom-1 right-1 grid h-5 w-5 place-items-center rounded bg-slate-900/60 text-white"><ImageIcon className="h-3 w-3" /></span>
            </button>)}</div> : null}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">{tags.slice(0, 4).map(tag => <span key={tag} className="text-xs text-violet-600">#{tag}</span>)}</div>
              <div className="flex items-center gap-1">
                {item.canModerate ? <>
                  <IconAction label={item.post.isPinned ? "取消置顶" : "置顶"} active={Boolean(item.post.isPinned)} icon={Pin} onClick={() => promote.mutate({ postId: item.post.id, isPinned: !item.post.isPinned })} />
                  <IconAction label={item.post.isFeatured ? "取消精选" : "设为精选"} active={Boolean(item.post.isFeatured)} icon={Star} onClick={() => promote.mutate({ postId: item.post.id, isFeatured: !item.post.isFeatured })} />
                </> : null}
                {item.canEdit ? <>
                  <IconAction label="编辑" icon={Pencil} onClick={() => setDraft({ postId: item.post.id, postType: item.post.postType as PostKind, title: item.post.title, markdown: item.markdown, tags, replyPolicy: item.post.replyPolicy, quotePostId: item.post.quotePostId, attachments: item.attachments })} />
                  <IconAction label="删除" tone="danger" icon={Trash2} onClick={() => {
                    const reason = window.prompt(`删除「${item.post.title}」的原因（管理员删除他人实践必填）`, "内容需要下线");
                    if (reason === null) return;
                    removePost.mutate({ postId: item.post.id, reason: reason.trim() || undefined });
                  }} />
                </> : null}
                <button onClick={() => toggleLike.mutate({ postId: item.post.id })} className={cn("flex items-center gap-1 rounded-lg px-2 py-1 text-xs", liked.has(item.post.id) ? "bg-rose-50 text-rose-600" : "text-slate-400 hover:bg-slate-50")}><Heart className={cn("h-3.5 w-3.5", liked.has(item.post.id) && "fill-current")} />{item.post.likeCount}</button>
                <button onClick={() => setLocation(`/community/${item.post.id}`)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-50"><MessageCircleMore className="h-3.5 w-3.5" />{item.post.commentCount}</button>
                <button onClick={() => toggleFavorite.mutate({ postId: item.post.id })} className={cn("flex items-center gap-1 rounded-lg px-2 py-1 text-xs", saved.has(item.post.id) ? "bg-violet-50 text-violet-700" : "text-slate-400 hover:bg-slate-50")}><Bookmark className={cn("h-3.5 w-3.5", saved.has(item.post.id) && "fill-current")} />收藏</button>
              </div>
            </div>
          </article>;
        })}</div> : <Empty />}
      </section>
    </div>

    <PostEditorDialog draft={draft} onClose={closeEditor} onSaved={postId => { closeEditor(); setLocation(`/community/${postId}`); }} />
    <ImageLightbox image={preview} onClose={() => setPreview(null)} />
  </main></PlatformShell>;
}

function IconAction({ icon: Icon, label, onClick, active = false, tone = "default" }: { icon: typeof Pin; label: string; onClick: () => void; active?: boolean; tone?: "default" | "danger" }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} className={cn("grid h-7 w-7 place-items-center rounded-lg transition", tone === "danger" ? "text-slate-400 hover:bg-rose-50 hover:text-rose-600" : active ? "bg-violet-100 text-violet-700" : "text-slate-400 hover:bg-slate-50 hover:text-violet-700")}><Icon className="h-3.5 w-3.5" /></button>;
}
function Tip({ label, text }: { label: string; text: string }) { return <div><p className="font-medium text-slate-800">{label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div>; }
function Empty() { return <div className="mt-4 grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white text-center"><div><Sparkles className="mx-auto h-6 w-6 text-violet-600" /><p className="mt-3 font-semibold">还没有匹配的实践内容</p><p className="mt-1 text-sm text-slate-500">换一个关键词，或发布第一份工作方法。</p></div></div>; }
