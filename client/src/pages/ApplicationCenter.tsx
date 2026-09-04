import { useAuth } from "@/_core/hooks/useAuth";
import PlatformShell from "@/components/PlatformShell";
import PageSkeleton from "@/components/PageSkeleton";
import { EmptyState } from "@/components/ProductSurface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  AppWindow,
  ArrowUpRight,
  Blocks,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import { startLogin } from "@/const";

export default function ApplicationCenter() {
  const { isAuthenticated, loading } = useAuth();
  const { data, isLoading } = trpc.platform.applications.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  if (loading || (isAuthenticated && isLoading))
    return (
      <PlatformShell>
        <PageSkeleton cards={6} />
      </PlatformShell>
    );
  if (!isAuthenticated)
    return (
      <PlatformShell>
        <main className="mx-auto grid min-h-[66vh] max-w-xl place-items-center px-5 text-center">
          <div>
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-orange-50 text-orange-600">
              <LockKeyhole className="h-6 w-6" />
            </span>
            <h1 className="mt-5 text-3xl font-semibold">
              登录后访问企业应用中心
            </h1>
            <p className="mt-3 leading-7 text-gray-500">
              公司 Agent
              平台、业务助手与其他经运营审核的工具入口，仅向企业成员展示。
            </p>
            <Button onClick={() => startLogin()} className="mt-6 rounded-lg">
              登录后查看应用
            </Button>
          </div>
        </main>
      </PlatformShell>
    );
  const categories = Array.from(new Set((data ?? []).map(app => app.category)));
  return (
    <PlatformShell>
      <main className="mx-auto max-w-[1400px] px-5 py-9 lg:px-10">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-semibold tracking-wide text-orange-600">应用中心</p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-gray-900 md:text-3xl">企业应用中心</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              将经运营维护的企业 AI 平台、业务工具和专项助手集中为可信入口。
            </p>
          </div>
          <span className="inline-flex items-center gap-2 self-start rounded-lg bg-orange-50 px-4 py-2 text-sm text-orange-700">
            <Blocks className="h-4 w-4" />
            {data?.length ?? 0} 个可用入口
          </span>
        </div>
        <div className="mt-7 flex flex-wrap gap-2">
          {categories.map(category => (
            <Badge
              key={category}
              className="rounded-full bg-orange-50 px-3 py-1.5 text-orange-600"
            >
              {category}
            </Badge>
          ))}
        </div>
        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.map(app => (
            <article
              key={app.id}
              className="product-surface product-surface-interactive group p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-orange-50 text-orange-600">
                  <AppWindow className="h-5 w-5" />
                </span>
                <Badge variant="secondary">{app.category}</Badge>
              </div>
              <h2 className="mt-5 text-lg font-semibold">{app.name}</h2>
              <p className="mt-2 min-h-12 text-sm leading-6 text-gray-500">
                {app.description}
              </p>
              <a
                href={app.appUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center text-sm font-semibold text-orange-600 hover:text-orange-700"
              >
                打开应用 <ArrowUpRight className="ml-1.5 h-4 w-4" />
              </a>
            </article>
          ))}
          {!data?.length && (
            <EmptyState
              className="col-span-full"
              icon={Sparkles}
              title="应用入口尚未配置"
              description="运营管理员可在运营管理中添加公司 Agent 平台、专利小匠及其他企业工具。"
            />
          )}
        </section>
      </main>
    </PlatformShell>
  );
}
