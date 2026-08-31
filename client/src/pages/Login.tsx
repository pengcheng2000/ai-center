import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { Link } from "wouter";

type Mode = "login" | "register";

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
      window.location.href = "/";
    } catch {
      setError("网络异常，请稍后再试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/60 to-violet-50 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-8 shadow-xl shadow-indigo-100/60 backdrop-blur">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-2xl text-white shadow-lg shadow-indigo-200">
              AI
            </div>
            <h1 className="font-serif text-2xl font-semibold text-slate-900">全员 AI 能力提升平台</h1>
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
                <button type="button" className="ml-1 font-medium text-indigo-600 hover:text-indigo-700" onClick={() => { setMode("register"); setError(null); }}>
                  注册新账号
                </button>
              </>
            ) : (
              <>
                已有账号？
                <button type="button" className="ml-1 font-medium text-indigo-600 hover:text-indigo-700" onClick={() => { setMode("login"); setError(null); }}>
                  直接登录
                </button>
              </>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs leading-5 text-slate-400">
          首次启动会自动创建管理员账号，账号与密码由部署时的 LOCAL_ADMIN_USERNAME / LOCAL_ADMIN_PASSWORD 决定。
          <br />
          <Link href="/" className="hover:text-slate-500">先随便逛逛 →</Link>
        </p>
      </div>
    </div>
  );
}
