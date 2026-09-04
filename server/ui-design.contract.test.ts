import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("calm product design contracts", () => {
  it("defines the coordinated neutral and domain palette", () => {
    const css = source("client/src/index.css");
    expect(css).toContain("--background: #f6f6f3");
    expect(css).toContain("--primary: #242624");
    expect(css).toContain("--brand-learning: #596287");
    expect(css).toContain("--brand-work: #835c4d");
    expect(css).toContain("--brand-community: #3b7070");
    expect(css).toContain("--brand-news: #4b7082");
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
    expect(shell).toContain("bg-[#fafaf8]/88");
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

  it("keeps rich domain panels and path-specific learning actions in the shared palette", () => {
    const css = source("client/src/index.css");
    const learning = source("client/src/lib/learnExperience.ts");
    const applications = source("client/src/pages/ApplicationCenter.tsx");
    for (const panel of ["learning", "work", "community", "news", "skills"])
      expect(css).toContain(`.rich-panel-${panel}`);
    for (const color of ["#596287", "#835c4d", "#3b7070", "#4b7082", "#825f70"])
      expect(learning).toContain(`button: "bg-[${color}]`);
    expect(applications).toContain('<section className="rich-panel-work');
    expect(applications).not.toContain('tone="work"');
  });

  it("uses the lighter blue-gray visual system for the AI assistant", () => {
    const assistant = source("client/src/components/AIAssistantBall.tsx");
    expect(assistant).toContain('from-[#e7eaf2]');
    expect(assistant).toContain('from-[#687398] to-[#4b7082]');
    expect(assistant).not.toContain('gap-2.5 bg-slate-900');
  });

  it("explains that daily RSS scheduling is unavailable in development instead of allowing a failing action", () => {
    const operations = source("client/src/pages/Operations.tsx");
    expect(operations).toContain("const dailySyncConfigurationAvailable = !import.meta.env.DEV");
    expect(operations).toContain("!dailySyncConfigurationAvailable ||");
    expect(operations).toContain('开发预览环境不运行定时任务，发布后可启用');
    expect(operations).toContain('? "发布后可启用"');
  });
});
