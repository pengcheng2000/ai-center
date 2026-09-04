import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import PlatformShell from "@/components/PlatformShell";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { Badge } from "@/components/ui/badge";
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
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  BookOpenCheck,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Download,
  Flame,
  Loader2,
  PackageCheck,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type ProfileForm = {
  headline: string;
  department: string;
  roleTitle: string;
  abilityTags: string;
  interestTags: string;
  growthGoals: string;
};
const splitTags = (value: string) =>
  value
    .split(/[，,]/)
    .map(item => item.trim())
    .filter(Boolean);

export default function Profile() {
  const { user, isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.platform.personal.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: mySkills } = trpc.platform.skills.myAssets.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const [form, setForm] = useState<ProfileForm>({
    headline: "",
    department: "",
    roleTitle: "",
    abilityTags: "",
    interestTags: "",
    growthGoals: "",
  });
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspace, setWorkspace] = useState({
    title: "",
    description: "",
    destination: "/#learn",
    icon: "sparkles",
    color: "violet",
  });
  const updateProfile = trpc.platform.personal.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("个人画像已更新");
      utils.platform.personal.get.invalidate();
    },
  });
  const addWorkspace = trpc.platform.personal.addWorkspaceItem.useMutation({
    onSuccess: () => {
      toast.success("快捷入口已添加");
      setWorkspaceOpen(false);
      setWorkspace({
        title: "",
        description: "",
        destination: "/#learn",
        icon: "sparkles",
        color: "violet",
      });
      utils.platform.personal.get.invalidate();
    },
  });
  const removeWorkspace =
    trpc.platform.personal.removeWorkspaceItem.useMutation({
      onSuccess: () => {
        toast.success("已从 Workspace 移除");
        utils.platform.personal.get.invalidate();
      },
    });

  useEffect(() => {
    if (data?.profile)
      setForm({
        headline: data.profile.headline,
        department: data.profile.department || "",
        roleTitle: data.profile.roleTitle || "",
        abilityTags: (data.profile.abilityTags as string[]).join("，"),
        interestTags: (data.profile.interestTags as string[]).join("，"),
        growthGoals: (data.profile.growthGoals as string[]).join("，"),
      });
  }, [data?.profile]);

  if (loading || (isAuthenticated && isLoading))
    return (
      <PlatformShell>
        <div className="grid min-h-[65vh] place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
        </div>
      </PlatformShell>
    );
  if (!isAuthenticated)
    return (
      <PlatformShell>
        <div className="mx-auto grid min-h-[68vh] max-w-xl place-items-center px-5 text-center">
          <div>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-violet-100">
              <Sparkles className="h-7 w-7 text-violet-700" />
            </div>
            <h1 className="mt-6 font-serif text-4xl font-semibold">
              登录后，建立你的 AI 成长档案。
            </h1>
            <p className="mt-4 leading-7 text-slate-500">
              个人画像、学习记录与 Workspace 与当前账号绑定，并受访问边界保护。
            </p>
            <Button onClick={() => startLogin()} className="mt-7 rounded-full">
              登录并进入 Workspace
            </Button>
          </div>
        </div>
      </PlatformShell>
    );

  const profile = data?.profile;
  return (
    <PlatformShell>
      <main className="mx-auto max-w-[1180px] px-5 py-12 lg:px-10">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center text-sm font-medium text-slate-500 transition hover:text-violet-700"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回能力提升平台
        </button>
        <section className="rich-panel-learning mt-7 overflow-hidden rounded-[32px] p-7 shadow-sm lg:p-10">
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/14 px-3 py-1.5 text-xs font-semibold text-white/90">
                <ShieldCheck className="h-3.5 w-3.5" />
                仅本人及授权运营管理员可见
              </span>
              <h1 className="mt-5 font-serif text-4xl font-semibold">
                {user?.name || "我的"} 的 AI Workspace
              </h1>
              <p className="mt-3 max-w-xl text-white/78">
                在这里维护能力画像，连接正在学习的内容与最常用的 AI 工作入口。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/10 p-4">
                <Flame className="h-5 w-5 text-orange-300" />
                <p className="mt-5 text-2xl font-semibold">
                  {profile?.learningStreak ?? 0}
                </p>
                <p className="text-xs text-white/70">连续学习天数</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <Clock3 className="h-5 w-5 text-violet-200" />
                <p className="mt-5 text-2xl font-semibold">
                  {profile?.weeklyLearningMinutes ?? 0}
                </p>
                <p className="text-xs text-white/70">本周学习分钟</p>
              </div>
            </div>
          </div>
        </section>
        <div className="mt-8 grid gap-7 lg:grid-cols-[1.08fr_.92fr]">
          <section className="min-w-0 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="section-kicker">PERSONAL PROFILE</p>
                <h2 className="mt-2 font-serif text-2xl font-semibold">
                  能力画像与成长目标
                </h2>
              </div>
              <Button
                disabled={updateProfile.isPending}
                onClick={() =>
                  updateProfile.mutate({
                    headline: form.headline,
                    department: form.department || null,
                    roleTitle: form.roleTitle || null,
                    abilityTags: splitTags(form.abilityTags),
                    interestTags: splitTags(form.interestTags),
                    growthGoals: splitTags(form.growthGoals),
                  })
                }
                className="rounded-full"
              >
                <Save className="mr-2 h-4 w-4" />
                保存
              </Button>
            </div>
            <div className="mt-7 grid gap-5">
              <div className="grid gap-2">
                <label className="text-sm font-medium">我的 AI 成长宣言</label>
                <Textarea
                  value={form.headline}
                  onChange={event =>
                    setForm(prev => ({ ...prev, headline: event.target.value }))
                  }
                  className="min-h-20"
                  placeholder="例如：用 AI 把重复工作变成可复用的流程"
                />
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">部门</label>
                  <Input
                    value={form.department}
                    onChange={event =>
                      setForm(prev => ({
                        ...prev,
                        department: event.target.value,
                      }))
                    }
                    placeholder="例如：技术质量中心"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">岗位 / 角色</label>
                  <Input
                    value={form.roleTitle}
                    onChange={event =>
                      setForm(prev => ({
                        ...prev,
                        roleTitle: event.target.value,
                      }))
                    }
                    placeholder="例如：质量工程师"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">能力标签</label>
                <Input
                  value={form.abilityTags}
                  onChange={event =>
                    setForm(prev => ({
                      ...prev,
                      abilityTags: event.target.value,
                    }))
                  }
                  placeholder="用逗号分隔，例如：提示词，数据分析，报告写作"
                />
                <p className="text-xs text-slate-400">
                  这些标签用于形成你的能力雷达与学习推荐。
                </p>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">兴趣方向</label>
                <Input
                  value={form.interestTags}
                  onChange={event =>
                    setForm(prev => ({
                      ...prev,
                      interestTags: event.target.value,
                    }))
                  }
                  placeholder="用逗号分隔，例如：智能体，知识库，办公提效"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">近期成长目标</label>
                <Input
                  value={form.growthGoals}
                  onChange={event =>
                    setForm(prev => ({
                      ...prev,
                      growthGoals: event.target.value,
                    }))
                  }
                  placeholder="用逗号分隔，例如：完成 AI 入门路径，沉淀一份模板"
                />
              </div>
            </div>
          </section>
          <section className="min-w-0 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="section-kicker">MY WORKSPACE</p>
                <h2 className="mt-2 font-serif text-2xl font-semibold">
                  快捷工作区
                </h2>
              </div>
              <Button
                onClick={() => setWorkspaceOpen(true)}
                variant="outline"
                className="rounded-full"
              >
                <Plus className="mr-2 h-4 w-4" />
                新增
              </Button>
            </div>
            <div className="mt-6 space-y-3">
              {data?.workspace?.length ? (
                data.workspace.map(item => (
                  <article
                    key={item.id}
                    className="group flex items-center gap-4 rounded-2xl bg-slate-50 p-4"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-100">
                      <Sparkles className="h-4 w-4 text-violet-700" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold">{item.title}</h3>
                      <p className="mt-1 truncate text-sm text-slate-500">
                        {item.description}
                      </p>
                    </div>
                    <ConfirmActionDialog
                      title="删除快捷入口？"
                      description={`将从你的工作区移除“${item.title}”，不会删除入口指向的原始内容。`}
                      confirmLabel="确认移除"
                      pending={removeWorkspace.isPending && removeWorkspace.variables?.id === item.id}
                      onConfirm={() => removeWorkspace.mutate({ id: item.id })}
                      trigger={<button className="grid h-9 w-9 place-items-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100" aria-label="删除快捷入口"><Trash2 className="h-4 w-4" /></button>}
                    />
                  </article>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 p-7 text-center">
                  <BriefcaseBusiness className="mx-auto h-6 w-6 text-violet-600" />
                  <p className="mt-3 font-semibold">还没有快捷入口</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    把高频任务、工具或学习资料放进这里。
                  </p>
                  <Button
                    onClick={() => setWorkspaceOpen(true)}
                    variant="link"
                    className="mt-2 text-violet-700"
                  >
                    立即添加
                  </Button>
                </div>
              )}
            </div>
          </section>
        </div>
        <section className="mt-7 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="section-kicker">LEARNING RECORD</p>
              <h2 className="mt-2 font-serif text-2xl font-semibold">
                我的学习记录
              </h2>
            </div>
            <p className="text-sm text-slate-500">进度自动与当前帐号绑定</p>
          </div>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {data?.progress?.length ? (
              data.progress.map(item => (
                <div key={item.id} className="rounded-2xl bg-violet-50 p-5">
                  <BookOpenCheck className="h-5 w-5 text-violet-700" />
                  <p className="mt-5 text-2xl font-semibold">
                    {item.progress}%
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    已记录课程 #{item.courseId}
                  </p>
                  <Progress className="mt-4 h-1.5" value={item.progress} />
                </div>
              ))
            ) : (
              <div className="md:col-span-3 rounded-2xl bg-slate-50 px-6 py-8 text-center">
                <CheckCircle2 className="mx-auto h-6 w-6 text-violet-600" />
                <p className="mt-3 font-semibold">
                  完成第一节课程后，成长记录会出现在这里。
                </p>
                <Button
                  onClick={() => setLocation("/")}
                  variant="link"
                  className="mt-2 text-violet-700"
                >
                  去看看学习路径
                </Button>
              </div>
            )}
          </div>
        </section>
        <section className="mt-7 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="section-kicker">MY SKILLS</p>
              <h2 className="mt-2 font-serif text-2xl font-semibold">
                我的 Skills
              </h2>
            </div>
            <Button
              onClick={() => setLocation("/skills")}
              variant="outline"
              className="rounded-full"
            >
              进入 Skills 广场
            </Button>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">已发布 / 投稿</p>
                <Badge variant="secondary">
                  {mySkills?.submissions.length ?? 0}
                </Badge>
              </div>
              <div className="mt-3 space-y-3">
                {mySkills?.submissions.length ? (
                  mySkills.submissions.map(skill => (
                    <button
                      key={skill.id}
                      onClick={() => setLocation(`/skills/${skill.id}`)}
                      className="w-full rounded-xl bg-violet-50 p-4 text-left hover:ring-1 hover:ring-violet-200"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{skill.name}</p>
                        <SkillStatus status={skill.reviewStatus} />
                      </div>
                      <p className="mt-1 text-xs text-violet-700">
                        {skill.skillKey} · {skill.version}
                      </p>
                      {skill.reviewNote && (
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                          审核说明：{skill.reviewNote}
                        </p>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center">
                    <PackageCheck className="mx-auto h-5 w-5 text-violet-600" />
                    <p className="mt-2 text-sm text-slate-500">
                      你还没有分享 Skills。
                    </p>
                    <Button
                      onClick={() => setLocation("/skills/submit")}
                      variant="link"
                      className="text-violet-700"
                    >
                      分享第一个 Skills
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">已下载</p>
                <Badge variant="secondary">
                  {mySkills?.downloads.length ?? 0}
                </Badge>
              </div>
              <div className="mt-3 space-y-3">
                {mySkills?.downloads.length ? (
                  mySkills.downloads.map(({ download, skill }) => (
                    <button
                      key={download.id}
                      onClick={() => setLocation(`/skills/${skill.id}`)}
                      className="w-full rounded-xl bg-slate-50 p-4 text-left hover:ring-1 hover:ring-violet-200"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{skill.name}</p>
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <Download className="h-3.5 w-3.5" />
                          {download.downloadCount} 次
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        最近下载：
                        {new Date(
                          download.lastDownloadedAt
                        ).toLocaleDateString()}{" "}
                        · {skill.version}
                      </p>
                      <SkillStatus status={skill.reviewStatus} />
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center">
                    <Download className="mx-auto h-5 w-5 text-violet-600" />
                    <p className="mt-2 text-sm text-slate-500">
                      下载过的 Skills 会出现在这里。
                    </p>
                    <Button
                      onClick={() => setLocation("/skills")}
                      variant="link"
                      className="text-violet-700"
                    >
                      去浏览 Skills
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <p className="mt-5 text-xs text-slate-400">
            此处仅显示当前账号的投稿与下载记录，不向其他员工公开。
          </p>
        </section>
        <Dialog open={workspaceOpen} onOpenChange={setWorkspaceOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">
                新增快捷入口
              </DialogTitle>
              <DialogDescription>添加一个仅当前账号可见的常用任务、工具或学习资料入口。</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium">名称</label>
                <Input
                  value={workspace.title}
                  onChange={event =>
                    setWorkspace(prev => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }
                  placeholder="例如：周报生成模板"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">说明</label>
                <Input
                  value={workspace.description}
                  onChange={event =>
                    setWorkspace(prev => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  placeholder="说明这个入口能帮助你完成什么"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">入口地址</label>
                <Input
                  value={workspace.destination}
                  onChange={event =>
                    setWorkspace(prev => ({
                      ...prev,
                      destination: event.target.value,
                    }))
                  }
                  placeholder="例如：/#learn 或内部工具地址"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setWorkspaceOpen(false)}>
                取消
              </Button>
              <Button
                disabled={
                  workspace.title.trim().length < 2 ||
                  workspace.description.trim().length < 2 ||
                  addWorkspace.isPending
                }
                onClick={() => addWorkspace.mutate(workspace)}
              >
                添加入口
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </PlatformShell>
  );
}
function SkillStatus({ status }: { status: string }) {
  const labels: Record<string, string> = {
    pending: "待审核",
    approved: "已上架",
    rejected: "已退回",
    archived: "已下架",
  };
  const colors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-emerald-100 text-emerald-700",
    rejected: "bg-rose-100 text-rose-700",
    archived: "bg-slate-200 text-slate-700",
  };
  return (
    <Badge className={colors[status] || colors.pending}>
      {labels[status] || "待审核"}
    </Badge>
  );
}
