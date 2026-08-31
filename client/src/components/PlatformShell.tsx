import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { AppWindow, BookOpen, LayoutDashboard, LogOut, MessageSquareText, Newspaper, Puzzle, ShieldCheck, Sparkles } from "lucide-react";
import { type ReactNode } from "react";
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
  return <div className="min-h-screen bg-[#f6f7fb] text-slate-900">
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl"><div className="mx-auto flex h-[68px] max-w-[1600px] items-center gap-4 px-4 lg:px-7">
      <button onClick={() => setLocation("/")} className="flex min-w-0 items-center gap-2.5 text-left"><span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-200"><Sparkles className="h-4 w-4" /></span><span className="hidden sm:block"><span className="block text-[9px] font-extrabold tracking-[.2em] text-violet-600">NEXUS / AI ENABLEMENT</span><span className="block font-serif text-[17px] font-semibold leading-5">全员 AI 能力提升平台</span></span></button>
      <nav className="ml-auto hidden items-center gap-1 md:flex">{navigation.map(item => <button key={item.path} onClick={() => setLocation(item.path)} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${location === item.path || (item.path !== "/" && location.startsWith(item.path)) ? "bg-violet-50 text-violet-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}>{item.label}</button>)}</nav>
      <div className="ml-auto flex items-center gap-2 md:ml-3">{isAuthenticated && user?.role === "admin" && <Button onClick={() => setLocation("/operations")} variant="outline" className="hidden rounded-lg border-violet-200 text-violet-700 lg:flex"><ShieldCheck className="mr-1.5 h-4 w-4" />运营管理</Button>}{isAuthenticated ? <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1"><button onClick={() => setLocation("/me")} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-slate-50"><span className="grid h-6 w-6 place-items-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-700">{user?.name?.slice(0, 1).toUpperCase() || "我"}</span><span className="hidden max-w-20 truncate lg:block">{user?.name || "我的空间"}</span></button><button onClick={logout} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"><LogOut className="h-3.5 w-3.5" /></button></div> : <Button disabled={loading} onClick={() => startLogin()} className="rounded-lg bg-slate-900 hover:bg-violet-700">登录</Button>}</div>
    </div></header>
    <div className="pb-16 md:pb-0">{children}</div>
    <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-6 border-t border-slate-200 bg-white/95 px-1 py-1 backdrop-blur md:hidden">{navigation.map(item => <button key={item.path} onClick={() => setLocation(item.path)} className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-medium ${location === item.path ? "text-violet-700" : "text-slate-500"}`}><item.icon className="h-4 w-4" />{item.label}</button>)}</nav>
  </div>;
}
