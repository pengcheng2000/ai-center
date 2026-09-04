import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandWordmark } from "@/components/BrandWordmark";
import { useState } from "react";

type Mode = "login" | "register";

export function safeLoginDestination(search: string) {
  const value = new URLSearchParams(search).get("next");
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/login") ? value : "/";
}

export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("请输入用户名和密码");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          mode === "register"
            ? { username: username.trim(), password, name: displayName.trim() || username.trim() }
            : { username: username.trim(), password }
        ),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "操作失败，请稍后再试");
        return;
      }
      window.location.href = safeLoginDestination(window.location.search);
    } catch {
      setError("网络异常，请稍后再试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f6f6f3] px-4 py-10">
      <div className="hero-orb -left-24 top-10 h-72 w-72 bg-violet-200/55" />
      <div className="hero-orb -right-24 bottom-8 h-80 w-80 bg-emerald-100/65" />
      <div className="relative w-full max-w-md">
        <div className="rounded-[28px] border border-white/90 bg-white/88 p-7 shadow-2xl backdrop-blur-xl sm:p-9">
          <div className="mb-8 text-center">
            <BrandWordmark centered className="mb-5" />
            <h1 className="text-2xl font-semibold tracking-[-0.045em] text-slate-900">欢迎回到你的 AI 工作台</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {mode === "login" ? "登录以进入你的学习、资讯与实践工作台" : "注册一个员工账号，开始你的 AI 学习之旅"}
            </p>
          </div>

          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={event => setUsername(event.target.value)}
                placeholder="请输入用户名"
                disabled={busy}
              />
            </div>
            {mode === "register" && (
              <div className="grid gap-2">
                <Label htmlFor="displayName">显示名称（可选）</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={event => setDisplayName(event.target.value)}
                  placeholder="例如：张三"
                  disabled={busy}
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder={mode === "register" ? "至少 6 位" : "请输入密码"}
                disabled={busy}
              />
            </div>

            {error && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-700">{error}</p>
            )}

            <Button type="submit" className="h-11 w-full" disabled={busy}>
              {busy ? "请稍候…" : mode === "login" ? "登录" : "注册并登录"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500">
            {mode === "login" ? (
              <>
                还没有账号？
                <button type="button" className="ml-1 font-semibold text-violet-700 hover:text-violet-800" onClick={() => { setMode("register"); setError(null); }}>
                  注册新账号
                </button>
              </>
            ) : (
              <>
                已有账号？
                <button type="button" className="ml-1 font-semibold text-violet-700 hover:text-violet-800" onClick={() => { setMode("login"); setError(null); }}>
                  直接登录
                </button>
              </>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs leading-5 text-slate-400">
          本平台仅面向企业成员开放。请使用员工账号登录；管理员账号由部署负责人统一维护。
        </p>
      </div>
    </div>
  );
}
