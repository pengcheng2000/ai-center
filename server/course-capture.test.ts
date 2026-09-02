import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
import { capturePublicDocument } from "./courseCapture";

const response = (body: string, status = 200, headers: Record<string, string> = { "content-type": "text/html" }) => new Response(body, { status, headers });
describe("公开课程文档采集安全边界", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); mocks.lookup.mockReset(); });
  it("拒绝本地、内网、带凭据 URL", async () => {
    await expect(capturePublicDocument("http://localhost/guide")).rejects.toThrow("本地或内网");
    await expect(capturePublicDocument("https://user:secret@example.com/guide")).rejects.toThrow("无凭据");
    mocks.lookup.mockResolvedValue([{ address: "10.0.0.8" }]); await expect(capturePublicDocument("https://intranet.example/guide")).rejects.toThrow("本地或内网");
  });
  it("拒绝非文本内容与超过 1.5MB 的响应", async () => {
    mocks.lookup.mockResolvedValue([{ address: "93.184.216.34" }]); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("pdf", 200, { "content-type": "application/pdf" })));
    await expect(capturePublicDocument("https://example.com/guide")).rejects.toThrow("仅支持 HTML、Markdown 或纯文本");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("small", 200, { "content-type": "text/html", "content-length": "1600000" })));
    await expect(capturePublicDocument("https://example.com/large")).rejects.toThrow("1.5MB");
  });
  it("限制重定向并在超时后中止请求", async () => {
    mocks.lookup.mockResolvedValue([{ address: "93.184.216.34" }]); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("", 302, { location: "https://example.com/again" })));
    await expect(capturePublicDocument("https://example.com/start")).rejects.toThrow("重定向次数超过上限");
    vi.useFakeTimers(); vi.stubGlobal("fetch", vi.fn((_url: string, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(new Error("abort"), { name: "AbortError" }))))));
    const expectation = expect(capturePublicDocument("https://example.com/slow")).rejects.toThrow("采集超时"); await vi.advanceTimersByTimeAsync(12_000); await expectation;
  });
  it("保存安全 HTML 快照并识别公开 GitBook 页面", async () => {
    mocks.lookup.mockResolvedValue([{ address: "93.184.216.34" }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(`<!doctype html><html><head><title>GitBook 教程</title><meta name="description" content="课程摘要"><link rel="canonical" href="https://docs.example.com/chapter"></head><body><nav>站点导航</nav><main data-testid="page.body"><h1>章节标题</h1><p>正文 <strong>重点</strong> <a href="javascript:alert(1)" onclick="alert(2)">链接</a></p><ul><li>项目</li></ul><pre><code>const x = 1;</code></pre><table><tr><th>字段</th></tr><tr><td>值</td></tr></table><script>alert(1)</script><script/>alert(2)<iframe src="https://evil.example"></iframe><img src="data:text/html,x" onerror="alert(1)" alt="图"></main></body></html>`)));
    const captured = await capturePublicDocument("https://docs.example.com/chapter");
    expect(captured).toMatchObject({ provider: "gitbook", contentFormat: "html", canonicalUrl: "https://docs.example.com/chapter" });
    expect(captured.contentHtml).toContain("<h1>章节标题</h1>");
    expect(captured.contentHtml).toContain("<ul><li>项目</li></ul>");
    expect(captured.contentHtml).toContain("<pre><code>const x = 1;</code></pre>");
    expect(captured.contentHtml).toContain("<table>");
    expect(captured.contentHtml).not.toMatch(/script|iframe|onclick|javascript:|data:text/i);
    expect(captured.content).toContain("章节标题");
  });
  it("拒绝空壳 GitBook/HTML 页面", async () => {
    mocks.lookup.mockResolvedValue([{ address: "93.184.216.34" }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response('<html><head><meta name="generator" content="GitBook"></head><body><div id="root"></div><script>boot()</script></body></html>')));
    await expect(capturePublicDocument("https://docs.example.com/private")).rejects.toThrow("未采集到可阅读的文档正文");
  });

  it("不会因普通正文提到 GitBook 而误判来源", async () => {
    mocks.lookup.mockResolvedValue([{ address: "93.184.216.34" }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("<html><head><title>迁移说明</title></head><body><article><p>我们正在评估 GitBook 迁移方案。</p></article></body></html>")));
    await expect(capturePublicDocument("https://docs.example.com/migration")).resolves.toMatchObject({ provider: "generic", contentFormat: "html" });
  });
});
