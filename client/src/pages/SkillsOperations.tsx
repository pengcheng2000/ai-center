import { useAuth } from "@/_core/hooks/useAuth";
import PlatformShell from "@/components/PlatformShell";
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
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  Loader2,
  ShieldAlert,
  Upload,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type ReviewStatus = "approved" | "rejected" | "archived";
export default function SkillsOperations() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const allowed = user?.role === "admin";
  const { data, isLoading } = trpc.platform.skills.adminList.useQuery(
    undefined,
    { enabled: Boolean(allowed) }
  );
  const [target, setTarget] = useState<{
    id: number;
    name: string;
    status: ReviewStatus;
  } | null>(null);
  const [note, setNote] = useState("");
  const review = trpc.platform.skills.review.useMutation({
    onSuccess: () => {
      toast.success("Skills 审核状态已更新");
      setTarget(null);
      setNote("");
      utils.platform.skills.adminList.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  if (loading || (allowed && isLoading))
    return (
      <PlatformShell>
        <div className="grid min-h-[65vh] place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
        </div>
      </PlatformShell>
    );
  if (!allowed || !data)
    return (
      <PlatformShell>
        <main className="mx-auto grid min-h-[65vh] max-w-xl place-items-center px-5 text-center">
          <div>
            <ShieldAlert className="mx-auto h-8 w-8 text-rose-600" />
            <h1 className="mt-5 font-serif text-3xl font-semibold">
              此区域仅对运营管理员开放
            </h1>
            <Button onClick={() => setLocation("/")} className="mt-6">
              返回员工端
            </Button>
          </div>
        </main>
      </PlatformShell>
    );
  const open = (id: number, name: string, status: ReviewStatus) => {
    setTarget({ id, name, status });
    setNote("");
  };
  return (
    <PlatformShell>
      <main className="mx-auto max-w-[1400px] px-5 py-9 lg:px-10">
        <button
          onClick={() => setLocation("/operations")}
          className="flex items-center text-sm font-medium text-slate-500 hover:text-violet-700"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回运营管理
        </button>
        <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-kicker">SKILLS GOVERNANCE / ADMIN</p>
            <h1 className="mt-2 font-serif text-4xl font-semibold">
              Skills 广场治理
            </h1>
            <p className="mt-3 max-w-3xl text-slate-500">
              审核员工投稿，或通过管理员直接导入将已核验的企业 Skills
              批量纳入目录。上架后员工才可查看详情、下载包并复制安装指令。
            </p>
          </div>
          <Button onClick={() => setLocation("/operations/skills/import")}>
            <Upload className="mr-2 h-4 w-4" />
            直接导入 Skills
          </Button>
        </div>
        <section className="mt-7 overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1060px] text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-4">Skills</th>
                  <th className="px-5 py-4">来源 / 批次</th>
                  <th className="px-5 py-4">分类 / 版本</th>
                  <th className="px-5 py-4">状态</th>
                  <th className="px-5 py-4">审核说明</th>
                  <th className="px-5 py-4"></th>
                </tr>
              </thead>
              <tbody>
                {data.map(({ skill, authorName }) => (
                  <tr
                    key={skill.id}
                    className="border-b border-slate-50 last:border-0"
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold">{skill.name}</p>
                      <p className="mt-1 text-xs text-violet-700">
                        {skill.skillKey} · {skill.packageFileName}
                      </p>
                      <p className="mt-1 max-w-72 truncate text-xs text-slate-500">
                        {skill.summary}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant="secondary">
                        {skill.submissionSource === "admin_direct"
                          ? "管理员直接导入"
                          : skill.submissionSource === "agent"
                            ? "Agent 草稿"
                            : "员工投稿"}
                      </Badge>
                      <p className="mt-1 max-w-44 truncate text-xs text-slate-500">
                        {skill.importBatchKey ||
                          authorName ||
                          `用户 #${skill.authorId}`}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant="secondary">{skill.category}</Badge>
                      <p className="mt-1 text-xs text-slate-500">
                        {skill.version}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <Status status={skill.reviewStatus} />
                    </td>
                    <td className="px-5 py-4">
                      <p className="max-w-52 truncate text-xs text-slate-500">
                        {skill.reviewNote || "待填写"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          onClick={() => setLocation(`/skills/${skill.id}`)}
                          size="sm"
                          variant="ghost"
                          className="text-violet-700"
                        >
                          详情
                        </Button>
                        <Button
                          onClick={() => open(skill.id, skill.name, "approved")}
                          size="sm"
                          variant="outline"
                          className="border-emerald-200 text-emerald-700"
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          上架
                        </Button>
                        <Button
                          onClick={() => open(skill.id, skill.name, "rejected")}
                          size="sm"
                          variant="outline"
                          className="border-rose-200 text-rose-700"
                        >
                          <XCircle className="mr-1 h-3.5 w-3.5" />
                          拒绝
                        </Button>
                        <Button
                          onClick={() => open(skill.id, skill.name, "archived")}
                          size="sm"
                          variant="ghost"
                        >
                          下架
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!data.length && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-12 text-center text-slate-500"
                    >
                      尚无员工投稿或管理员导入记录。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <Dialog
          open={Boolean(target)}
          onOpenChange={open => !open && setTarget(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {target?.status === "approved"
                  ? "上架 Skills"
                  : target?.status === "rejected"
                    ? "拒绝 Skills 投稿"
                    : "下架 Skills"}
              </DialogTitle>
              <DialogDescription>
                审核结论与说明会保存在 Skills 治理记录中，并决定员工端是否可见。
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm text-slate-500">{target?.name}</p>
            <Textarea
              value={note}
              onChange={event => setNote(event.target.value)}
              placeholder="填写审核依据、修改建议或下架原因。"
              className="min-h-28"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setTarget(null)}>
                取消
              </Button>
              <Button
                disabled={!target || note.trim().length < 2 || review.isPending}
                onClick={() =>
                  target &&
                  review.mutate({
                    id: target.id,
                    reviewStatus: target.status,
                    reviewNote: note,
                  })
                }
              >
                确认处理
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </PlatformShell>
  );
}
function Status({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "待审核", cls: "bg-amber-50 text-amber-700" },
    approved: { label: "已上架", cls: "bg-emerald-50 text-emerald-700" },
    rejected: { label: "已拒绝", cls: "bg-rose-50 text-rose-700" },
    archived: { label: "已下架", cls: "bg-slate-100 text-slate-600" },
  };
  const item = map[status] || map.pending;
  return <Badge className={item.cls}>{item.label}</Badge>;
}
