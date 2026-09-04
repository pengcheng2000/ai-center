import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("calm product design contracts", () => {
  it("defines the coordinated neutral and domain palette", () => {
    const css = source("client/src/index.css");
    expect(css).toContain("--background: #ffffff");
    expect(css).toContain("--primary: #18181b");
    expect(css).toContain("--brand-learning: #6366f1");
    expect(css).toContain("--brand-work: #f97316");
    expect(css).toContain("--brand-community: #10b981");
    expect(css).toContain("--brand-news: #3b82f6");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("keeps existing button variants and adds low-emphasis product variants", () => {
    const button = source("client/src/components/ui/button.tsx");
    for (const variant of ["default", "destructive", "outline", "secondary", "ghost", "link", "soft", "surface"]) {
      expect(button).toContain(`${variant}:`);
    }
    expect(button).toContain('data-size={size ?? "default"}');
  });

  it("keeps the primary navigation structure while applying the shared shell", () => {
    const shell = source("client/src/components/PlatformShell.tsx");
    for (const label of ["工作台", "学习中心", "AI 资讯", "实践社区", "应用中心", "Skills 广场"]) {
      expect(shell).toContain(`label: "${label}"`);
    }
    expect(shell).toContain("bg-white/80");
    expect(shell).toContain("grid grid-cols-6");
    expect(shell).toContain("<BrandWordmark");
    expect(shell).not.toContain("NEXUS / AI ENABLEMENT");
  });

  it("uses the ChintAI wordmark and the locally hosted official CHINT favicon", () => {
    const brand = source("client/src/components/BrandWordmark.tsx");
    const html = source("client/index.html");
    expect(brand).toContain('Chint<span className="text-[#237ae4]">AI</span>');
    expect(html).toContain('href="/brand/chint-favicon.ico"');
    expect(html).toContain("<title>ChintAI｜全员 AI 能力提升平台</title>");
    expect(statSync(resolve(process.cwd(), "client/public/brand/chint-favicon.ico")).size).toBeGreaterThan(1_000);
  });

  it("uses compact page headers with domain colors instead of rich panels", () => {
    const css = source("client/src/index.css");
    const learning = source("client/src/lib/learnExperience.ts");
    for (const panel of ["learning", "work", "community", "news", "skills"])
      expect(css).not.toContain(`.rich-panel-${panel}`);
    for (const token of ["indigo-600", "orange-600", "emerald-600", "blue-600", "violet-600"])
      expect(learning).toContain(`button: "bg-${token}`);
  });

  it("uses a clean light visual system for the AI assistant", () => {
    const assistant = source("client/src/components/AIAssistantBall.tsx");
    expect(assistant).toContain('bg-white');
    expect(assistant).toContain('text-blue-600');
    expect(assistant).not.toContain('gap-2.5 bg-slate-900');
  });

  it("allows interval configuration but explains that scheduled execution is unavailable in development", () => {
    const operations = source("client/src/pages/Operations.tsx");
    expect(operations).toContain("const dailySyncConfigurationAvailable = !import.meta.env.DEV");
    expect(operations).toContain("!dailySyncConfigurationAvailable ||");
    expect(operations).toContain('开发预览环境不运行定时任务，发布后可启用');
    expect(operations).toContain('"频率可配置，发布后可启用"');
    expect(operations).toContain("setSourceSyncInterval");
    expect(operations).toContain("员工端定时摘要");
    const newsCenter = source("client/src/pages/NewsCenter.tsx");
    expect(newsCenter).toContain("data.newsDigest");
    expect(newsCenter).toContain("员工端定时摘要");
  });
});
