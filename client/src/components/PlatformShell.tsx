import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { BrandWordmark } from "@/components/BrandWordmark";
import {
  AppWindow,
  BookOpen,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  Newspaper,
  Puzzle,
  ShieldCheck,
} from "lucide-react";
import { type ReactNode } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const navigation = [
  { label: "工作台", path: "/", icon: LayoutDashboard },
  { label: "学习中心", path: "/learn", icon: BookOpen },
  { label: "AI 资讯", path: "/news", icon: Newspaper },
  { label: "实践社区", path: "/community", icon: MessageSquareText },
  { label: "应用中心", path: "/apps", icon: AppWindow },
  { label: "Skills 广场", path: "/skills", icon: Puzzle },
];

export default function PlatformShell({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [location, setLocation] = useLocation();
  return (
    <div data-area={location.startsWith("/operations") ? "operations" : "member"} className="min-h-screen bg-transparent text-gray-900">
      <header className="sticky top-0 z-30 border-b border-gray-200/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1400px] items-center gap-4 px-4 lg:px-8">
          <button
            onClick={() => setLocation("/")}
            className="flex min-w-0 items-center rounded-xl text-left focus-visible:outline-offset-4"
          >
            <BrandWordmark className="hidden sm:inline-flex" />
            <BrandWordmark compact className="sm:hidden" />
          </button>
          <nav className="ml-auto hidden items-center gap-0.5 rounded-lg border border-gray-200/70 bg-gray-100/50 p-1 md:flex">
            {navigation.map(item => (
              <button
                key={item.path}
                onClick={() => setLocation(item.path)}
                className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition ${location === item.path || (item.path !== "/" && location.startsWith(item.path)) ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:bg-white/60 hover:text-gray-800"}`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-3">
            {isAuthenticated && user?.role === "admin" && (
              <Button
                onClick={() => setLocation("/operations")}
                variant="soft"
                className="hidden lg:flex"
              >
                <ShieldCheck className="mr-1.5 h-4 w-4" />
                运营管理
              </Button>
            )}
            {isAuthenticated ? (
              <div className="flex items-center gap-1 rounded-lg border border-gray-200/90 bg-white/80 p-1">
                <button
                  onClick={() => setLocation("/me")}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-gray-100/80"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-gray-900 text-[11px] font-bold text-white">
                    {user?.name?.slice(0, 1).toUpperCase() || "我"}
                  </span>
                  <span className="hidden max-w-20 truncate lg:block">
                    {user?.name || "我的空间"}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="退出登录"
                  title="退出登录"
                  disabled={loading}
                  onClick={() =>
                    void logout().catch(error =>
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "退出失败，请重试"
                      )
                    )
                  }
                  className="grid h-7 w-7 place-items-center rounded-md text-gray-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-wait disabled:opacity-50"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <Button
                disabled={loading}
                onClick={() => startLogin()}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700"
              >
                登录
              </Button>
            )}
          </div>
        </div>
      </header>
      <div className="pb-24 md:pb-0">{children}</div>
      <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-6 rounded-xl border border-gray-200/80 bg-white/90 p-1.5 pb-[calc(.375rem+env(safe-area-inset-bottom))] shadow-lg backdrop-blur-xl md:hidden">
        {navigation.map(item => (
          <button
            key={item.path}
            onClick={() => setLocation(item.path)}
            className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-1 text-[9px] font-semibold ${location === item.path || (item.path !== "/" && location.startsWith(item.path)) ? "bg-indigo-600 text-white shadow-sm" : "text-gray-500 hover:bg-gray-100"}`}
          >
            <item.icon className="h-4 w-4" />
            <span className="max-w-full truncate">
              {item.path === "/learn"
                ? "学习"
                : item.path === "/news"
                  ? "资讯"
                  : item.path === "/community"
                    ? "社区"
                    : item.path === "/apps"
                      ? "应用"
                      : item.path === "/skills"
                        ? "Skills"
                        : item.label}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
