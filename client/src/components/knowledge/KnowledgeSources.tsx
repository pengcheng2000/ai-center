import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { knowledgeInput } from "./KnowledgeControls";
import { Link } from "wouter";
import { toast } from "sonner";
const labels = {
  running: "同步中",
  succeeded: "完成",
  partial: "部分完成",
  failed: "失败",
  abandoned: "已中断",
};
export default function KnowledgeSources({ sourceId }: { sourceId: number }) {
  const utils = trpc.useUtils();
  const sources = trpc.knowledge.admin.sources.useQuery();
  const source = sources.data?.find(s => s.id === sourceId);
  const runs = trpc.knowledge.admin.runs.useQuery(
    { sourceId },
    {
      enabled: sourceId > 0,
      refetchInterval: q =>
        q.state.data?.[0]?.status === "running" ? 3000 : false,
    }
  );
  const tree = trpc.knowledge.admin.tree.useQuery(
    { sourceId },
    { enabled: sourceId > 0 }
  );
  const refresh = () => {
    void utils.knowledge.admin.invalidate();
  };
  const sync = trpc.knowledge.admin.syncNow.useMutation({
    onSuccess: () => {
      toast.success("同步已开始，完成后可在内容管理中审核");
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const schedule = trpc.knowledge.admin.configureSchedule.useMutation({
    onSuccess: () => {
      toast.success("同步设置已保存");
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  if (!source) return <p>正在加载来源…</p>;
  return (
    <div className="mt-6 space-y-5">
      <section className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">{source.name}</h2>
            <p className="mt-1 text-sm text-gray-500">
              {source.sourceAccessStatus === "accessible"
                ? "飞书连接正常"
                : "来源访问异常，请检查授权"}{" "}
              · 最近目录同步：
              {source.lastDirectorySyncAt
                ? new Date(source.lastDirectorySyncAt).toLocaleString("zh-CN")
                : "尚未同步"}
            </p>
          </div>
          <Button
            disabled={sync.isPending || runs.data?.[0]?.status === "running"}
            onClick={() => sync.mutate({ sourceId })}
          >
            同步最新内容
          </Button>
        </div>
        <Button
          className="mt-3"
          size="sm"
          variant="outline"
          disabled={sync.isPending || runs.data?.[0]?.status === "running"}
          onClick={() => sync.mutate({ sourceId, retryMissing: true })}
        >
          重试缺失图片与附件
        </Button>
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4 text-sm">
          <span>同步频率</span>
          <select
            aria-label="同步频率"
            className={knowledgeInput}
            value={source.syncIntervalHours}
            disabled={schedule.isPending}
            onChange={e =>
              schedule.mutate({
                sourceId,
                enabled: !!source.scheduleEnabled,
                intervalHours: Number(e.target.value),
              })
            }
          >
            {[6, 12, 24].map(h => (
              <option key={h} value={h}>
                每 {h} 小时
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            disabled={!source.scheduleAvailable || schedule.isPending}
            onClick={() =>
              schedule.mutate({
                sourceId,
                enabled: !source.scheduleEnabled,
                intervalHours: source.syncIntervalHours,
              })
            }
          >
            {source.scheduleEnabled ? "关闭周期同步" : "开启周期同步"}
          </Button>
          {!source.scheduleAvailable && (
            <span className="text-gray-500">开发环境仅执行手动同步</span>
          )}
        </div>
        <details className="mt-4 text-xs text-gray-500">
          <summary className="cursor-pointer">技术详情</summary>
          <p className="mt-2">
            来源编号 {source.id} · 空间 {source.externalId} ·{" "}
            {source.connectorKey}
          </p>
        </details>
      </section>
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">同步记录</h2>
        <p className="mt-1 text-sm text-gray-500">
          同步只更新内容副本，不会自动发布。正文入库与阅读质量分别核查。
        </p>
        {runs.isError ? (
          <Button variant="outline" onClick={() => void runs.refetch()}>
            加载失败，重试
          </Button>
        ) : runs.isLoading ? (
          <p className="py-5">正在加载记录…</p>
        ) : !runs.data?.length ? (
          <p className="py-5 text-sm text-gray-500">尚无同步记录。</p>
        ) : (
          runs.data.map((run, i) => (
            <details
              key={run.id}
              open={i === 0 ? true : undefined}
              className="mt-4 rounded-lg border p-4"
            >
              <summary className="cursor-pointer text-sm font-medium">
                {labels[run.status]} ·{" "}
                {new Date(run.startedAt).toLocaleString("zh-CN")}
              </summary>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  正文入库
                  <p className="mt-1 text-xl font-semibold">
                    {run.createdCount + run.updatedCount + run.unchangedCount}
                  </p>
                </div>
                <div>
                  读取失败
                  <p className="mt-1 text-xl font-semibold">
                    {run.contentFailedCount}
                  </p>
                </div>
                <div>
                  特殊结构提示
                  <p className="mt-1 text-xl font-semibold">
                    {run.quality.structures}
                  </p>
                </div>
                <div>
                  容量限制中断
                  <p className="mt-1 text-xl font-semibold">
                    {run.assetLimitCount}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm text-amber-800">
                图片缺失 {run.quality.images} 张 · 附件缺失{" "}
                {run.quality.attachments} 个
                {run.quality.budget > 0 && (
                  <span> · 其中 {run.quality.budget} 项受容量限制</span>
                )}
              </p>
              {run.failures.length > 0 && (
                <ul className="mt-4 space-y-2 border-t pt-3 text-sm">
                  {run.failures.map((f, n) => {
                    const item = tree.data?.find(
                      t => t.externalId === f.externalId
                    );
                    return (
                      <li key={n}>
                        {item ? (
                          <Link
                            className="text-indigo-700 underline"
                            href={`/operations/knowledge/${item.id}`}
                          >
                            {item.title}
                          </Link>
                        ) : (
                          "来源读取异常"
                        )}
                        <span className="ml-2 text-amber-800">
                          {f.stage === "image_download"
                            ? "图片读取失败，请检查飞书资源授权"
                            : "读取未完成，请核对技术详情"}
                        </span>
                        <details className="mt-1 text-xs text-gray-500">
                          <summary>技术详情</summary>
                          {f.stage} / {f.code}
                        </details>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-3 text-xs text-gray-500">
                目录{run.directoryTraversalComplete ? "已完整遍历" : "未完成"} ·
                运行编号 {run.id}
              </p>
            </details>
          ))
        )}
      </section>
    </div>
  );
}
