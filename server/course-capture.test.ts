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
});
