import { useAuth } from "@/_core/hooks/useAuth";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import PlatformShell from "@/components/PlatformShell";
import { PageHeader } from "@/components/ProductSurface";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  getAuditModelProviderId,
  getSelectableAuditModels,
} from "@/lib/auditModelSelection";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  Eye,
  FileCheck2,
  FolderCog,
  Gauge,
  Loader2,
  MessageSquareText,
  Newspaper,
  Plus,
  RadioTower,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type SourceDraft = {
  id?: number;
  name: string;
  url: string;
  sourceType: "rss" | "website" | "api" | "manual";
  category: string;
  description: string;
  isEnabled: boolean;
};
type ModuleDraft = {
  id?: number;
  moduleKey: string;
  name: string;
  description: string;
  destination: string;
  icon: string;
  audience: "all" | "employee" | "admin";
  isEnabled: boolean;
  orderIndex: number;
};
type AgentDraft = {
  id: number;
  name: string;
  description: string;
  modelPreference: string;
  providerId?: number;
  selectedModelId?: number;
  confidenceThreshold: number;
  isEnabled: boolean;
};
type RuleDraft = {
  id?: number;
  name: string;
  description: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  keywords: string;
  isEnabled: boolean;
};
type ConnectionResult = {
  success: boolean;
  message: string;
  latencyMs?: number;
};
const emptySource = (): SourceDraft => ({
  name: "",
  url: "https://",
  sourceType: "rss",
  category: "",
  description: "",
  isEnabled: true,
});
const emptyModule = (): ModuleDraft => ({
  moduleKey: "",
  name: "",
  description: "",
  destination: "/#learn",
  icon: "grid",
  audience: "employee",
  isEnabled: true,
  orderIndex: 10,
});
const statusClass: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700",
  needs_review: "bg-amber-50 text-amber-700",
  pending: "bg-slate-100 text-slate-700",
  rejected: "bg-rose-50 text-rose-700",
};
const dailySyncConfigurationAvailable = !import.meta.env.DEV;
const dailySyncUnavailableMessage = "开发预览环境不运行定时任务，发布后可启用";

export default function Operations() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const allowed = user?.role === "admin";
  const { data, isLoading, error, refetch } =
    trpc.platform.operations.get.useQuery(undefined, {
      enabled: Boolean(allowed),
    });
  const [sourceDraft, setSourceDraft] = useState<SourceDraft | null>(null);
  const [moduleDraft, setModuleDraft] = useState<ModuleDraft | null>(null);
  const [agentDraft, setAgentDraft] = useState<AgentDraft | null>(null);
  const [connectionResult, setConnectionResult] =
    useState<ConnectionResult | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{
    id: number;
    title: string;
  } | null>(null);
  const [reviewDecision, setReviewDecision] = useState<
    "approved" | "needs_review" | "rejected"
  >("approved");
  const [reviewNote, setReviewNote] = useState("");
  const [ruleOpen, setRuleOpen] = useState(false);
  const [rule, setRule] = useState<RuleDraft>({
    name: "",
    description: "",
    riskLevel: "medium",
    keywords: "",
    isEnabled: true,
  });
  const refresh = () => utils.platform.operations.get.invalidate();
  const syncSource = trpc.platform.operations.syncSource.useMutation({
    onSuccess: result => {
      toast.success(
        `${result.sourceName}：已读取 ${result.fetched} 条，新增 ${result.created} 条${result.updated ? `，升级 ${result.updated} 条正文` : ""}${result.skipped ? `，跳过 ${result.skipped} 条重复内容` : ""}`
      );
      refresh();
    },
    onError: error => toast.error(`同步失败：${error.message}`),
  });
  const configureDailySync =
    trpc.platform.operations.configureDailySourceSync.useMutation({
      onSuccess: result => {
        toast.success(
          result.enabled
            ? `已启用每日 09:00 自动同步${result.nextExecutionAt ? `；下次运行：${new Date(result.nextExecutionAt).toLocaleString()}` : ""}`
            : "已暂停每日自动同步"
        );
        refresh();
      },
      onError: error => toast.error(`计划配置失败：${error.message}`),
    });
  const addSource = trpc.platform.operations.addSource.useMutation({
    onSuccess: result => {
      const shouldSync = result.sourceType === "rss";
      toast.success(
        shouldSync ? "资讯源已添加，正在读取 RSS 内容" : "资讯源已添加"
      );
      setSourceDraft(null);
      refresh();
      if (shouldSync) syncSource.mutate({ sourceId: result.sourceId });
    },
  });
  const updateSource = trpc.platform.operations.updateSource.useMutation({
    onSuccess: () => {
      toast.success("资讯源已更新");
      setSourceDraft(null);
      refresh();
    },
  });
  const toggleSource = trpc.platform.operations.toggleSource.useMutation({
    onSuccess: refresh,
  });
  const deleteSource = trpc.platform.operations.deleteSource.useMutation({
    onSuccess: () => {
      toast.success("资讯源已删除，其下已导入资讯保留");
      refresh();
    },
    onError: error => toast.error(`删除失败：${error.message}`),
  });
  const addModule = trpc.platform.operations.addModule.useMutation({
    onSuccess: () => {
      toast.success("功能模块已添加");
      setModuleDraft(null);
      refresh();
    },
  });
  const updateModule = trpc.platform.operations.updateModule.useMutation({
    onSuccess: () => {
      toast.success("功能模块已更新");
      setModuleDraft(null);
      refresh();
    },
  });
  const toggleModule = trpc.platform.operations.toggleModule.useMutation({
    onSuccess: refresh,
  });
  const updateAgent = trpc.platform.operations.updateAgent.useMutation({
    onSuccess: () => {
      toast.success("审核员配置已更新");
      setAgentDraft(null);
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const testModelConnection =
    trpc.platform.operations.testModelConnection.useMutation({
      onSuccess: result => {
        setConnectionResult(result);
        if (result.success) toast.success("模型连接测试通过");
        else toast.error(result.message);
        refresh();
      },
      onError: error => {
        setConnectionResult({ success: false, message: error.message });
        toast.error(error.message);
      },
    });
  const toggleAgent = trpc.platform.operations.toggleAgent.useMutation({
    onSuccess: refresh,
  });
  const runAudit = trpc.platform.operations.runAudit.useMutation({
    onSuccess: result => {
      toast.success(
        `审核完成：${result.decision === "approved" ? "建议通过" : result.decision === "rejected" ? "建议拒绝" : "建议人工复核"}`
      );
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const runBatchAudit = trpc.platform.operations.runBatchAudit.useMutation({
    onSuccess: result => {
      toast.success(
        `批量预审完成：处理 ${result.processed}/${result.requested} 条；通过 ${result.approved}，复核 ${result.needsReview}，过滤 ${result.rejected}${result.failed ? `，失败 ${result.failed}` : ""}`
      );
      refresh();
    },
    onError: error => toast.error(`批量预审失败：${error.message}`),
  });
  const addRule = trpc.platform.operations.addRule.useMutation({
    onSuccess: () => {
      toast.success("审核规则已添加");
      setRuleOpen(false);
      setRule({
        name: "",
        description: "",
        riskLevel: "medium",
        keywords: "",
        isEnabled: true,
      });
      refresh();
    },
  });
  const updateRule = trpc.platform.operations.updateRule.useMutation({
    onSuccess: () => {
      toast.success("审核规则已更新");
      setRuleOpen(false);
      setRule({
        name: "",
        description: "",
        riskLevel: "medium",
        keywords: "",
        isEnabled: true,
      });
      refresh();
    },
  });
  const toggleRule = trpc.platform.operations.toggleRule.useMutation({
    onSuccess: refresh,
  });
  const assignReview = trpc.platform.operations.assignReview.useMutation({
    onSuccess: () => {
      toast.success("已领取人工复核");
      refresh();
    },
  });
  const resolveReview = trpc.platform.operations.reviewDecision.useMutation({
    onSuccess: () => {
      toast.success("人工复核结果已保存");
      setReviewTarget(null);
      setReviewNote("");
      refresh();
    },
  });

  if (loading || (allowed && isLoading))
    return (
      <PlatformShell>
        <div className="grid min-h-[65vh] place-items-center">
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
              运营配置、审核记录与内容处置均由服务端角色权限保护，员工账号无法访问。
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
  if (error || !data)
    return (
      <PlatformShell>
        <main className="mx-auto grid min-h-[65vh] max-w-xl place-items-center px-5 text-center">
          <div>
            <h1 className="font-serif text-3xl font-semibold">
              运营数据加载失败
            </h1>
            <p className="mt-4 text-sm leading-6 text-slate-500">
              {error?.message || "运营数据暂时不可用，请稍后重试。"}
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Button variant="outline" onClick={() => void refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                重试
              </Button>
              <Button onClick={() => setLocation("/")}>返回工作台</Button>
            </div>
          </div>
        </main>
      </PlatformShell>
    );

  const saveSource = () => {
    if (!sourceDraft) return;
    const payload = {
      ...sourceDraft,
      description: sourceDraft.description || undefined,
    };
    if (sourceDraft.id) updateSource.mutate({ ...payload, id: sourceDraft.id });
    else addSource.mutate(payload);
  };
  const saveModule = () => {
    if (!moduleDraft) return;
    if (moduleDraft.id)
      updateModule.mutate(moduleDraft as Required<ModuleDraft>);
    else addModule.mutate(moduleDraft);
  };
  const { providers: selectableProviders, models: selectableModels } =
    getSelectableAuditModels(data.providers, data.models);
  const activeAgentProviderId =
    agentDraft?.providerId ??
    getAuditModelProviderId(agentDraft?.selectedModelId, data.models);
  const activeAgentProvider = data.providers.find(
    provider => provider.id === activeAgentProviderId
  );
  const gatewayVerified =
    activeAgentProvider?.gatewayStatus === "verified" ||
    Boolean(connectionResult?.success);

  return (
    <PlatformShell>
      <main className="mx-auto max-w-[1440px] px-5 py-10 lg:px-10">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center text-sm font-medium text-slate-500 hover:text-violet-700"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          退出运营后台
        </button>
        <PageHeader
          className="mt-6"
          compact
          eyebrow="OPERATION CONSOLE / ADMIN ONLY"
          title="平台运营工作台"
          description="监控内容流、员工学习活跃度与审核处置。所有配置变更仅在管理员权限下执行。"
          actions={
            <>
            <Button
              onClick={() => setLocation("/operations/content")}
              variant="soft"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              学习内容运营
            </Button>
            <Button
              onClick={() => setLocation("/operations/governance")}
              variant="outline"
            >
              <Bot className="mr-2 h-4 w-4" />
              模型与资源治理
            </Button>
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700">
              <ShieldCheck className="h-4 w-4" />
              管理员：{user?.name || "已授权账号"}
            </div>
            </>
          }
        />
        <section className="mt-6 flex flex-col justify-between gap-4 rounded-2xl border border-violet-100 bg-violet-50/60 p-5 sm:flex-row sm:items-center">
          <div>
            <p className="font-semibold text-violet-950">企业应用中心</p>
            <p className="mt-1 text-sm text-violet-800">
              集中维护公司 Agent 平台、专利小匠及其他经过批准的企业工具入口。
            </p>
          </div>
          <Button
            onClick={() => setLocation("/operations/apps")}
            className="rounded-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            管理应用入口
          </Button>
        </section>
        <section className="mt-4 flex flex-col justify-between gap-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5 sm:flex-row sm:items-center">
          <div>
            <p className="font-semibold text-indigo-950">企业 Skills 广场</p>
            <p className="mt-1 text-sm text-indigo-800">
              审核员工分享的 Skills、安装包和 SKILL.md，决定是否在员工端上架。
            </p>
          </div>
          <Button
            onClick={() => setLocation("/operations/skills")}
            variant="outline"
            className="rounded-full border-indigo-200 text-indigo-700"
          >
            治理 Skills 投稿
          </Button>
        </section>
        <section className="mt-4 flex flex-col justify-between gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5 sm:flex-row sm:items-center">
          <div>
            <p className="font-semibold text-emerald-950">Agent 内容导入</p>
            <p className="mt-1 text-sm text-emerald-800">
              签发最小权限导入令牌，查看外部 Agent
              自动整理的文章图文、课程资源与 Skills 草稿。
            </p>
          </div>
          <Button
            onClick={() => setLocation("/operations/agent-imports")}
            variant="outline"
            className="rounded-full border-emerald-200 text-emerald-700"
          >
            <Bot className="mr-2 h-4 w-4" />
            管理导入
          </Button>
        </section>
        <section className="mt-4 flex flex-col justify-between gap-4 rounded-2xl border border-rose-100 bg-rose-50/60 p-5 sm:flex-row sm:items-center">
          <div>
            <p className="font-semibold text-rose-950">实践社区治理</p>
            <p className="mt-1 text-sm text-rose-800">
              检索全部实践内容，处置违规或过期帖子（软删除可恢复），把高质量实践置顶或设为精选。
            </p>
          </div>
          <Button
            onClick={() => setLocation("/operations/community")}
            variant="outline"
            className="rounded-full border-rose-200 text-rose-700"
          >
            <MessageSquareText className="mr-2 h-4 w-4" />
            管理社区内容
          </Button>
        </section>
        <section className="mt-4 flex flex-col justify-between gap-4 rounded-2xl border border-amber-100 bg-amber-50/60 p-5 sm:flex-row sm:items-center">
          <div>
            <p className="font-semibold text-amber-950">资源生命周期管理</p>
            <p className="mt-1 text-sm text-amber-800">
              资讯源/模型供应商/社区主题的归档恢复与复审状态，以及全量资讯内容的搜索、删除与恢复。
            </p>
          </div>
          <Button
            onClick={() => setLocation("/operations/lifecycle")}
            variant="outline"
            className="rounded-full border-amber-200 text-amber-700"
          >
            <FolderCog className="mr-2 h-4 w-4" />
            进入生命周期管理
          </Button>
        </section>
        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={Newspaper}
            label="平台资讯"
            value={data.metrics.content}
            note="包含各审核状态"
            tone="violet"
          />
          <Metric
            icon={ClipboardCheck}
            label="待处理内容"
            value={data.metrics.pending}
            note="待审核或待处置"
            tone="orange"
          />
          <Metric
            icon={UsersRound}
            label="学习活跃员工"
            value={data.metrics.learners}
            note="存在学习进度记录"
            tone="cyan"
          />
          <Metric
            icon={Activity}
            label="实践沉淀"
            value={data.metrics.posts}
            note="员工社区发帖数"
            tone="emerald"
          />
        </section>
        <section className="mt-8 rounded-[26px] border border-amber-100 bg-amber-50/50 p-6 shadow-sm">
          <SectionHeading
            icon={ClipboardCheck}
            title="人工审核责任队列"
            description="AI 审核仅作预审。管理员应先领取或分派需要复核的记录，再以处置说明完成最终决策。"
          />
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {data.records
              .filter(
                item =>
                  item.record.decision === "needs_review" ||
                  item.record.reviewAssigneeId
              )
              .map(({ record, title }) => (
                <article
                  key={record.id}
                  className="rounded-2xl bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{title || "已删除资讯"}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        责任人：
                        {data.reviewers.find(
                          reviewer => reviewer.id === record.reviewAssigneeId
                        )?.name ||
                          (record.reviewAssigneeId
                            ? `用户 #${record.reviewAssigneeId}`
                            : "未领取")}{" "}
                        · 置信度 {record.confidence}%
                      </p>
                    </div>
                    <Badge
                      className={
                        record.manualDecision
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }
                    >
                      {record.manualDecision ? "已人工处置" : "待人工复核"}
                    </Badge>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                    <select
                      disabled={Boolean(record.manualDecision)}
                      defaultValue={record.reviewAssigneeId || ""}
                      onChange={event => {
                        const value = event.target.value;
                        if (value)
                          assignReview.mutate({
                            recordId: record.id,
                            assigneeId: Number(value),
                          });
                      }}
                      className="h-8 rounded-md border border-amber-200 bg-white px-2 text-xs"
                    >
                      <option value="">分派给审核人</option>
                      {data.reviewers.map(reviewer => (
                        <option key={reviewer.id} value={reviewer.id}>
                          {reviewer.name ||
                            reviewer.email ||
                            `用户 #${reviewer.id}`}
                        </option>
                      ))}
                    </select>
                    <Button
                      disabled={
                        assignReview.isPending || Boolean(record.manualDecision)
                      }
                      onClick={() =>
                        assignReview.mutate({
                          recordId: record.id,
                          assigneeId: user?.id ?? null,
                        })
                      }
                      size="sm"
                      variant="outline"
                      className="border-amber-300 text-amber-800"
                    >
                      领取复核
                    </Button>
                    <Button
                      disabled={Boolean(record.manualDecision)}
                      onClick={() => {
                        setReviewTarget({
                          id: record.newsId,
                          title: title || "待处置资讯",
                        });
                        setReviewDecision(record.manualDecision || "approved");
                      }}
                      size="sm"
                    >
                      进入处置
                    </Button>
                  </div>
                </article>
              ))}
            {!data.records.some(
              item =>
                item.record.decision === "needs_review" ||
                item.record.reviewAssigneeId
            ) && (
              <p className="rounded-2xl bg-white p-5 text-sm text-slate-500">
                当前没有等待人工审核的内容。
              </p>
            )}
          </div>
        </section>
        <section className="mt-8 grid gap-7 xl:grid-cols-[1.08fr_.92fr]">
          <div className="min-w-0 space-y-7">
            <section className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
              <SectionHeading
                icon={RadioTower}
                title="资讯源管理"
                description="新增 RSS 后会立即导入首批内容；可手动同步，或启用每日 09:00 自动同步、去重入库并进入审核队列。"
                action={
                  <Button
                    onClick={() => setSourceDraft(emptySource())}
                    className="rounded-full"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    新增资讯源
                  </Button>
                }
              />
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[840px] text-left text-sm">
                  <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="pb-3 font-medium">来源</th>
                      <th className="pb-3 font-medium">类型 / 分类</th>
                      <th className="pb-3 font-medium">处理状态</th>
                      <th className="pb-3 font-medium">每日同步</th>
                      <th className="pb-3 font-medium">启用</th>
                      <th className="pb-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sources.map(source => (
                      <tr
                        key={source.id}
                        className="border-b border-slate-50 last:border-0"
                      >
                        <td className="py-4">
                          <p className="font-semibold">{source.name}</p>
                          <p className="mt-1 max-w-56 truncate text-xs text-slate-400">
                            {source.url}
                          </p>
                        </td>
                        <td className="py-4">
                          <Badge variant="secondary">
                            {source.sourceType.toUpperCase()}
                          </Badge>
                          <p className="mt-1 text-xs text-slate-500">
                            {source.category}
                          </p>
                        </td>
                        <td className="py-4">
                          <span className="font-medium text-slate-700">
                            {source.totalProcessed} 条
                          </span>
                          <p className="mt-1 text-xs text-slate-400">
                            {source.lastProcessedAt
                              ? `最近同步：${new Date(source.lastProcessedAt).toLocaleString()}`
                              : "等待首次同步"}
                          </p>
                        </td>
                        <td className="py-4">
                          {source.sourceType === "rss" ? (
                            <div
                              title={
                                dailySyncConfigurationAvailable
                                  ? undefined
                                  : dailySyncUnavailableMessage
                              }
                            >
                              <Switch
                                aria-label={`${source.name}每日自动同步`}
                                disabled={
                                  !dailySyncConfigurationAvailable ||
                                  !source.isEnabled ||
                                  configureDailySync.isPending
                                }
                                checked={Boolean(source.scheduleEnabled)}
                                onCheckedChange={checked =>
                                  configureDailySync.mutate({
                                    sourceId: source.id,
                                    enabled: checked,
                                  })
                                }
                              />
                              <p className="mt-1 text-xs text-slate-400">
                                {!dailySyncConfigurationAvailable
                                  ? "发布后可启用"
                                  : source.scheduleEnabled
                                  ? source.scheduleLastRunAt
                                    ? `上次：${new Date(source.scheduleLastRunAt).toLocaleString()}`
                                    : "每日 09:00 执行"
                                  : "未启用"}
                              </p>
                              {source.scheduleLastError && (
                                <p
                                  className="mt-1 max-w-40 truncate text-xs text-rose-600"
                                  title={source.scheduleLastError}
                                >
                                  失败：{source.scheduleLastError}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">
                              仅 RSS
                            </span>
                          )}
                        </td>
                        <td className="py-4">
                          <Switch
                            checked={Boolean(source.isEnabled)}
                            onCheckedChange={checked =>
                              toggleSource.mutate({
                                id: source.id,
                                isEnabled: checked,
                              })
                            }
                          />
                        </td>
                        <td className="py-4 text-right">
                          <div className="flex justify-end gap-1">
                            {source.sourceType === "rss" && (
                              <Button
                                title="同步 RSS"
                                disabled={
                                  !source.isEnabled || syncSource.isPending
                                }
                                onClick={() =>
                                  syncSource.mutate({ sourceId: source.id })
                                }
                                variant="outline"
                                size="sm"
                                className="border-violet-200 text-violet-700"
                              >
                                <RefreshCw
                                  className={`mr-1.5 h-3.5 w-3.5 ${syncSource.isPending ? "animate-spin" : ""}`}
                                />
                                同步
                              </Button>
                            )}
                            <Button
                              onClick={() =>
                                setSourceDraft({
                                  id: source.id,
                                  name: source.name,
                                  url: source.url,
                                  sourceType: source.sourceType,
                                  category: source.category,
                                  description: source.description || "",
                                  isEnabled: Boolean(source.isEnabled),
                                })
                              }
                              variant="ghost"
                              size="icon"
                            >
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            <ConfirmActionDialog
                              title={`删除资讯源「${source.name}」`}
                              description="其下已导入的资讯会保留，来源将显示为“平台运营”；此操作不可撤销。"
                              pending={deleteSource.isPending}
                              onConfirm={() =>
                                deleteSource.mutate({ id: source.id })
                              }
                              trigger={
                                <Button
                                  title="删除资讯源"
                                  aria-label={`删除资讯源 ${source.name}`}
                                  disabled={deleteSource.isPending}
                                  variant="ghost"
                                  size="icon"
                                  className="text-rose-400 hover:bg-rose-50 hover:text-rose-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              }
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
              <SectionHeading
                icon={FolderCog}
                title="功能模块管理"
                description="统一配置员工端入口的名称、说明、顺序与可见性。"
                action={
                  <Button
                    onClick={() => setModuleDraft(emptyModule())}
                    variant="outline"
                    className="rounded-full"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    新增模块
                  </Button>
                }
              />
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {data.modules.map(module => (
                  <article
                    key={module.id}
                    className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-violet-700 shadow-sm">
                        {String(module.orderIndex).padStart(2, "0")}
                      </span>
                      <Switch
                        checked={Boolean(module.isEnabled)}
                        onCheckedChange={checked =>
                          toggleModule.mutate({
                            id: module.id,
                            isEnabled: checked,
                          })
                        }
                      />
                    </div>
                    <h3 className="mt-5 font-semibold">{module.name}</h3>
                    <p className="mt-1 min-h-10 text-sm leading-5 text-slate-500">
                      {module.description}
                    </p>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-xs text-slate-400">
                        {module.audience === "all"
                          ? "全员"
                          : module.audience === "admin"
                            ? "仅管理员"
                            : "员工端"}
                      </span>
                      <Button
                        onClick={() =>
                          setModuleDraft({
                            id: module.id,
                            moduleKey: module.moduleKey,
                            name: module.name,
                            description: module.description,
                            destination: module.destination,
                            icon: module.icon,
                            audience: module.audience,
                            isEnabled: Boolean(module.isEnabled),
                            orderIndex: module.orderIndex,
                          })
                        }
                        variant="ghost"
                        size="sm"
                        className="text-violet-700"
                      >
                        编辑
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
          <div className="min-w-0 space-y-7">
            <section className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
              <SectionHeading
                icon={Bot}
                title="AI 审核员"
                description="以结构化规则为准绳，辅助资讯内容预审与风险分流。"
              />
              <div className="mt-6 space-y-3">
                {data.agents.map(agent => (
                  <article
                    key={agent.id}
                    className="rich-panel-news rounded-2xl p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{agent.name}</h3>
                          <span
                            className={
                              agent.isEnabled
                                ? "rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs text-emerald-300"
                                : "rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-300"
                            }
                          >
                            {agent.isEnabled ? "运行中" : "已停用"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-5 text-slate-300">
                          {agent.description}
                        </p>
                      </div>
                      <Switch
                        checked={Boolean(agent.isEnabled)}
                        onCheckedChange={checked =>
                          toggleAgent.mutate({
                            id: agent.id,
                            isEnabled: checked,
                          })
                        }
                      />
                    </div>
                    <div className="mt-5 flex items-center justify-between text-xs text-slate-300">
                      <span>模型：{agent.modelPreference}</span>
                      <span>复核阈值：{agent.confidenceThreshold}%</span>
                      <Button
                        onClick={() =>
                          setAgentDraft({
                            id: agent.id,
                            name: agent.name,
                            description: agent.description,
                            modelPreference: agent.modelPreference,
                            confidenceThreshold: agent.confidenceThreshold,
                            isEnabled: Boolean(agent.isEnabled),
                          })
                        }
                        size="sm"
                        variant="secondary"
                        className="rounded-full bg-white text-slate-900 hover:bg-violet-50"
                      >
                        配置
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
              <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-violet-900">审核规则</p>
                    <p className="mt-1 text-xs text-violet-700">
                      已启用 {data.rules.filter(item => item.isEnabled).length}{" "}
                      条，支持按风险等级预审。
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      setRule({
                        name: "",
                        description: "",
                        riskLevel: "medium",
                        keywords: "",
                        isEnabled: true,
                      });
                      setRuleOpen(true);
                    }}
                    variant="outline"
                    size="sm"
                    className="border-violet-200 bg-white text-violet-700"
                  >
                    新增规则
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {data.rules.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs text-slate-600 shadow-sm"
                    >
                      <Switch
                        checked={Boolean(item.isEnabled)}
                        onCheckedChange={checked =>
                          toggleRule.mutate({ id: item.id, isEnabled: checked })
                        }
                      />
                      <button
                        onClick={() => {
                          setRule({
                            id: item.id,
                            name: item.name,
                            description: item.description,
                            riskLevel: item.riskLevel,
                            keywords: (item.keywords as string[]).join("，"),
                            isEnabled: Boolean(item.isEnabled),
                          });
                          setRuleOpen(true);
                        }}
                        className="min-w-0 flex-1 truncate text-left font-medium hover:text-violet-700"
                      >
                        {item.name}
                      </button>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5">
                        {item.riskLevel}
                      </span>
                      <Button
                        onClick={() => {
                          setRule({
                            id: item.id,
                            name: item.name,
                            description: item.description,
                            riskLevel: item.riskLevel,
                            keywords: (item.keywords as string[]).join("，"),
                            isEnabled: Boolean(item.isEnabled),
                          });
                          setRuleOpen(true);
                        }}
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
            <section className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
              <SectionHeading
                icon={FileCheck2}
                title="资讯审核队列"
                description="先对待审核内容批量预审；低置信度和边界内容自动转人工复核，最终责任仍由运营人员承担。"
              />
              <div className="mt-4">
                <Button
                  disabled={
                    runBatchAudit.isPending ||
                    !data.news.some(item => item.reviewStatus === "pending")
                  }
                  onClick={() => runBatchAudit.mutate({ maxItems: 10 })}
                  size="sm"
                  className="w-full rounded-full"
                >
                  <Sparkles
                    className={`mr-1.5 h-3.5 w-3.5 ${runBatchAudit.isPending ? "animate-spin" : ""}`}
                  />
                  批量 AI 预审（最多 10 条）
                </Button>
              </div>
              <div className="mt-6 space-y-3">
                {data.news.map(item => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-slate-100 p-4"
                  >
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[item.reviewStatus] || "bg-slate-100 text-slate-700"}`}
                          >
                            {item.reviewStatus === "approved"
                              ? "已审核"
                              : item.reviewStatus === "needs_review"
                                ? "人工复核"
                                : item.reviewStatus === "pending"
                                  ? "待审核"
                                  : item.reviewStatus}
                          </span>
                          <span className="text-xs text-slate-400">
                            {item.category}
                          </span>
                        </div>
                        <h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-6">
                          {item.title}
                        </h3>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button
                          disabled={runAudit.isPending}
                          onClick={() => runAudit.mutate({ newsId: item.id })}
                          variant="outline"
                          size="sm"
                          className="border-violet-200 text-violet-700"
                        >
                          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                          审核
                        </Button>
                        {item.reviewStatus === "needs_review" &&
                          data.records.some(
                            entry => entry.record.newsId === item.id
                          ) && (
                            <Button
                              onClick={() => {
                                setReviewTarget({
                                  id: item.id,
                                  title: item.title,
                                });
                                setReviewDecision("approved");
                              }}
                              size="sm"
                              variant="ghost"
                            >
                              处置
                            </Button>
                          )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <section className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
              <SectionHeading
                icon={Gauge}
                title="审核记录"
                description="保留 AI 判定原因、命中规则与人工复核信息。"
              />
              <div className="mt-5 space-y-3">
                {data.records.length ? (
                  data.records.map(({ record, title, agentName }) => (
                    <article
                      key={record.id}
                      className="rounded-2xl bg-slate-50 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass[record.decision] || "bg-slate-100"}`}
                          >
                            {record.decision === "approved"
                              ? "建议通过"
                              : record.decision === "rejected"
                                ? "建议拒绝"
                                : "建议复核"}
                          </span>
                          <p className="mt-2 text-sm font-semibold">
                            {title || "已删除资讯"}
                          </p>
                        </div>
                        <span className="text-xs font-medium text-slate-400">
                          {record.confidence}%
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        {record.reason}
                      </p>
                      <p className="mt-2 text-xs text-violet-600">
                        {agentName || "审核员"} · 命中：
                        {(record.matchedRules as string[]).join("、") || "无"}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
                    自动审核后，决策记录会沉淀在这里。
                  </p>
                )}
              </div>
            </section>
          </div>
        </section>
        <Dialog
          open={Boolean(sourceDraft)}
          onOpenChange={open => !open && setSourceDraft(null)}
        >
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">
                {sourceDraft?.id ? "编辑资讯源" : "新增资讯源"}
              </DialogTitle>
              <DialogDescription>
                RSS 来源保存后将立即拉取最多 50 条内容并去重入库；网站、API
                与人工来源可先登记，后续按对应接入方式同步。
              </DialogDescription>
            </DialogHeader>
            {sourceDraft && (
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">来源名称</label>
                  <Input
                    value={sourceDraft.name}
                    onChange={event =>
                      setSourceDraft(
                        prev => prev && { ...prev, name: event.target.value }
                      )
                    }
                    placeholder="例如：AI 行业观察"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">来源地址</label>
                  <Input
                    value={sourceDraft.url}
                    onChange={event =>
                      setSourceDraft(
                        prev => prev && { ...prev, url: event.target.value }
                      )
                    }
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">来源类型</label>
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={sourceDraft.sourceType}
                      onChange={event =>
                        setSourceDraft(
                          prev =>
                            prev && {
                              ...prev,
                              sourceType: event.target
                                .value as SourceDraft["sourceType"],
                            }
                        )
                      }
                    >
                      <option value="rss">RSS</option>
                      <option value="website">网站</option>
                      <option value="api">API</option>
                      <option value="manual">人工录入</option>
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">资讯分类</label>
                    <Input
                      value={sourceDraft.category}
                      onChange={event =>
                        setSourceDraft(
                          prev =>
                            prev && { ...prev, category: event.target.value }
                        )
                      }
                      placeholder="例如：模型趋势"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">说明</label>
                  <Textarea
                    value={sourceDraft.description}
                    onChange={event =>
                      setSourceDraft(
                        prev =>
                          prev && { ...prev, description: event.target.value }
                      )
                    }
                  />
                </div>
                <label className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium">
                  立即启用{" "}
                  <Switch
                    checked={sourceDraft.isEnabled}
                    onCheckedChange={checked =>
                      setSourceDraft(
                        prev => prev && { ...prev, isEnabled: checked }
                      )
                    }
                  />
                </label>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setSourceDraft(null)}>
                取消
              </Button>
              <Button
                disabled={
                  !sourceDraft?.name ||
                  !sourceDraft?.category ||
                  !sourceDraft?.url ||
                  addSource.isPending ||
                  updateSource.isPending
                }
                onClick={saveSource}
              >
                {sourceDraft?.id
                  ? "保存资讯源"
                  : sourceDraft?.sourceType === "rss"
                    ? "保存并同步"
                    : "保存资讯源"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(moduleDraft)}
          onOpenChange={open => !open && setModuleDraft(null)}
        >
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">
                {moduleDraft?.id ? "编辑功能模块" : "新增功能模块"}
              </DialogTitle>
              <DialogDescription>
                模块的启停与排序会直接影响员工端入口展示。
              </DialogDescription>
            </DialogHeader>
            {moduleDraft && (
              <div className="grid gap-4 py-2">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="模块 Key">
                    <Input
                      value={moduleDraft.moduleKey}
                      onChange={event =>
                        setModuleDraft(
                          prev =>
                            prev && { ...prev, moduleKey: event.target.value }
                        )
                      }
                      placeholder="例如：tools"
                    />
                  </Field>
                  <Field label="展示名称">
                    <Input
                      value={moduleDraft.name}
                      onChange={event =>
                        setModuleDraft(
                          prev => prev && { ...prev, name: event.target.value }
                        )
                      }
                      placeholder="例如：工具中心"
                    />
                  </Field>
                </div>
                <Field label="模块说明">
                  <Textarea
                    value={moduleDraft.description}
                    onChange={event =>
                      setModuleDraft(
                        prev =>
                          prev && { ...prev, description: event.target.value }
                      )
                    }
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="入口地址">
                    <Input
                      value={moduleDraft.destination}
                      onChange={event =>
                        setModuleDraft(
                          prev =>
                            prev && { ...prev, destination: event.target.value }
                        )
                      }
                    />
                  </Field>
                  <Field label="排序">
                    <Input
                      type="number"
                      value={moduleDraft.orderIndex}
                      onChange={event =>
                        setModuleDraft(
                          prev =>
                            prev && {
                              ...prev,
                              orderIndex: Number(event.target.value),
                            }
                        )
                      }
                    />
                  </Field>
                </div>
                <label className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium">
                  在员工端展示{" "}
                  <Switch
                    checked={moduleDraft.isEnabled}
                    onCheckedChange={checked =>
                      setModuleDraft(
                        prev => prev && { ...prev, isEnabled: checked }
                      )
                    }
                  />
                </label>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setModuleDraft(null)}>
                取消
              </Button>
              <Button
                disabled={
                  !moduleDraft?.moduleKey ||
                  !moduleDraft?.name ||
                  !moduleDraft?.description ||
                  !moduleDraft?.destination ||
                  addModule.isPending ||
                  updateModule.isPending
                }
                onClick={saveModule}
              >
                保存模块
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(agentDraft)}
          onOpenChange={open =>
            !open && (setAgentDraft(null), setConnectionResult(null))
          }
        >
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">
                配置 AI 审核员
              </DialogTitle>
              <DialogDescription>
                先选择供应商和模型，再用最小请求测试受管网关连接。未完成接入的外部模型不能启用为审核员。
              </DialogDescription>
            </DialogHeader>
            {agentDraft && (
              <div className="grid gap-4 py-2">
                <Field label="名称">
                  <Input
                    value={agentDraft.name}
                    onChange={event =>
                      setAgentDraft(
                        prev => prev && { ...prev, name: event.target.value }
                      )
                    }
                  />
                </Field>
                <Field label="审核范围说明">
                  <Textarea
                    value={agentDraft.description}
                    onChange={event =>
                      setAgentDraft(
                        prev =>
                          prev && { ...prev, description: event.target.value }
                      )
                    }
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="模型供应商">
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={activeAgentProviderId}
                      onChange={event => {
                        setConnectionResult(null);
                        setAgentDraft(
                          prev =>
                            prev && {
                              ...prev,
                              providerId: Number(event.target.value),
                              selectedModelId: undefined,
                            }
                        );
                      }}
                    >
                      <option value={0}>选择供应商</option>
                      {selectableProviders.map(provider => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="审核模型">
                    <select
                      disabled={!activeAgentProviderId}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-50"
                      value={agentDraft.selectedModelId ?? ""}
                      onChange={event => {
                        setConnectionResult(null);
                        setAgentDraft(
                          prev =>
                            prev && {
                              ...prev,
                              selectedModelId: event.target.value
                                ? Number(event.target.value)
                                : undefined,
                            }
                        );
                      }}
                    >
                      <option value="">选择已启用模型</option>
                      {selectableModels
                        .filter(
                          item =>
                            item.model.providerId === activeAgentProviderId
                        )
                        .map(({ model }) => (
                          <option key={model.id} value={model.id}>
                            {model.displayName} · {model.modelId}
                          </option>
                        ))}
                    </select>
                  </Field>
                </div>
                <p className="-mt-1 text-xs leading-5 text-slate-500">
                  仅展示供应商、模型均已启用且供应商未标记为 disabled
                  的目录项。模型 ID 由服务端写入审核配置，不能自由填写。
                </p>
                {activeAgentProvider && !gatewayVerified && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                    <strong>该模型尚未完成受管网关接入。</strong>请先将供应商
                    Base URL 配置为与部署环境 LLM_BASE_URL
                    一致，再执行测试连接；通过后才能启用为实际审核员。
                  </div>
                )}
                {connectionResult && (
                  <div
                    className={`rounded-xl border p-3 text-sm leading-6 ${connectionResult.success ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}
                  >
                    <strong>
                      {connectionResult.success
                        ? "连接测试通过"
                        : "连接尚不可用"}
                    </strong>
                    ：{connectionResult.message}
                    {connectionResult.latencyMs !== undefined
                      ? `（${connectionResult.latencyMs} ms）`
                      : ""}
                  </div>
                )}
                <Field label="人工复核阈值">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={agentDraft.confidenceThreshold}
                    onChange={event =>
                      setAgentDraft(
                        prev =>
                          prev && {
                            ...prev,
                            confidenceThreshold: Number(event.target.value),
                          }
                      )
                    }
                  />
                </Field>
                <label className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium">
                  启用审核员{" "}
                  <Switch
                    checked={agentDraft.isEnabled}
                    onCheckedChange={checked =>
                      setAgentDraft(
                        prev => prev && { ...prev, isEnabled: checked }
                      )
                    }
                  />
                </label>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setAgentDraft(null);
                  setConnectionResult(null);
                }}
              >
                取消
              </Button>
              <Button
                disabled={
                  !agentDraft?.selectedModelId || testModelConnection.isPending
                }
                variant="outline"
                onClick={() =>
                  agentDraft?.selectedModelId &&
                  testModelConnection.mutate({
                    selectedModelId: agentDraft.selectedModelId,
                  })
                }
              >
                {testModelConnection.isPending ? "正在测试…" : "测试连接"}
              </Button>
              <Button
                disabled={
                  !agentDraft?.selectedModelId ||
                  updateAgent.isPending ||
                  (agentDraft.isEnabled && !gatewayVerified)
                }
                onClick={() =>
                  agentDraft?.selectedModelId &&
                  updateAgent.mutate({
                    id: agentDraft.id,
                    name: agentDraft.name,
                    description: agentDraft.description,
                    selectedModelId: agentDraft.selectedModelId,
                    confidenceThreshold: agentDraft.confidenceThreshold,
                    isEnabled: agentDraft.isEnabled,
                  })
                }
              >
                保存配置
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">
                {rule.id ? "编辑审核规则" : "新增审核规则"}
              </DialogTitle>
              <DialogDescription>
                规则将用于内容自动审核，并按风险等级进入相应处置流程。
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <Field label="规则名称">
                <Input
                  value={rule.name}
                  onChange={event =>
                    setRule(prev => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="例如：第三方版权风险"
                />
              </Field>
              <Field label="规则说明">
                <Textarea
                  value={rule.description}
                  onChange={event =>
                    setRule(prev => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  placeholder="描述需要识别和处置的内容边界。"
                />
              </Field>
              <Field label="关键词（用逗号分隔）">
                <Input
                  value={rule.keywords}
                  onChange={event =>
                    setRule(prev => ({ ...prev, keywords: event.target.value }))
                  }
                  placeholder="例如：版权, 未授权, 原创"
                />
              </Field>
              <div className="grid gap-2">
                <label className="text-sm font-medium">风险等级</label>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={rule.riskLevel}
                  onChange={event =>
                    setRule(prev => ({
                      ...prev,
                      riskLevel: event.target.value as typeof rule.riskLevel,
                    }))
                  }
                >
                  <option value="low">低风险</option>
                  <option value="medium">中风险</option>
                  <option value="high">高风险</option>
                  <option value="critical">严重风险</option>
                </select>
              </div>
              <label className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium">
                启用规则{" "}
                <Switch
                  checked={rule.isEnabled}
                  onCheckedChange={checked =>
                    setRule(prev => ({ ...prev, isEnabled: checked }))
                  }
                />
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRuleOpen(false)}>
                取消
              </Button>
              <Button
                disabled={
                  !rule.name ||
                  rule.description.length < 6 ||
                  addRule.isPending ||
                  updateRule.isPending
                }
                onClick={() => {
                  const payload = {
                    agentId: data.agents[0]?.id ?? null,
                    name: rule.name,
                    description: rule.description,
                    riskLevel: rule.riskLevel,
                    keywords: rule.keywords
                      .split(/[，,]/)
                      .map(keyword => keyword.trim())
                      .filter(Boolean),
                    isEnabled: rule.isEnabled,
                  };
                  if (rule.id) updateRule.mutate({ ...payload, id: rule.id });
                  else addRule.mutate(payload);
                }}
              >
                {rule.id ? "保存规则" : "添加规则"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(reviewTarget)}
          onOpenChange={open => !open && setReviewTarget(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">
                人工复核处置
              </DialogTitle>
              <DialogDescription>{reviewTarget?.title}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium">处置结果</label>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={reviewDecision}
                  onChange={event =>
                    setReviewDecision(
                      event.target.value as typeof reviewDecision
                    )
                  }
                >
                  <option value="approved">通过并展示</option>
                  <option value="needs_review">继续复核</option>
                  <option value="rejected">拒绝展示</option>
                </select>
              </div>
              <Field label="处置说明">
                <Textarea
                  value={reviewNote}
                  onChange={event => setReviewNote(event.target.value)}
                  placeholder="说明人工判断依据，便于后续追溯。"
                />
              </Field>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReviewTarget(null)}>
                取消
              </Button>
              <Button
                disabled={
                  !reviewTarget ||
                  reviewNote.trim().length < 2 ||
                  resolveReview.isPending
                }
                onClick={() =>
                  reviewTarget &&
                  resolveReview.mutate({
                    recordId:
                      data.records.find(
                        item => item.record.newsId === reviewTarget.id
                      )?.record.id ?? 0,
                    decision: reviewDecision,
                    reviewNote,
                  })
                }
              >
                保存处置
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </PlatformShell>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  note: string;
  tone: "violet" | "orange" | "cyan" | "emerald";
}) {
  const colors = {
    violet: "bg-violet-50 text-violet-700",
    orange: "bg-orange-50 text-orange-600",
    cyan: "bg-indigo-50 text-indigo-700",
    emerald: "bg-emerald-50 text-emerald-700",
  };
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div
        className={`grid h-10 w-10 place-items-center rounded-xl ${colors[tone]}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-5 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 font-medium">{label}</p>
      <p className="mt-1 text-xs text-slate-400">{note}</p>
    </article>
  );
}
function SectionHeading({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Activity;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div className="flex gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50">
          <Icon className="h-5 w-5 text-violet-700" />
        </span>
        <div>
          <h2 className="font-serif text-xl font-semibold">{title}</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">
            {description}
          </p>
        </div>
      </div>
      {action}
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
