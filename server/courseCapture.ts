import { lookup } from "node:dns/promises";

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 12_000;
function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase(); if (normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  const ipv4 = normalized.startsWith("::ffff:") ? normalized.slice(7) : normalized; const parts = ipv4.split(".").map(Number);
  return parts.length === 4 && !parts.some(Number.isNaN) && (parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168));
}
async function assertPublicHttpUrl(value: string) {
  let url: URL; try { url = new URL(value); } catch { throw new Error("文档地址无效"); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error("仅支持无凭据的 HTTP(S) 文档地址");
  const hostname = url.hostname.toLowerCase(); if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || isPrivateAddress(hostname)) throw new Error("文档地址不能指向本地或内网");
  let addresses: { address: string }[]; try { addresses = await lookup(hostname, { all: true, verbatim: true }); } catch { throw new Error("文档域名无法解析"); }
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) throw new Error("文档地址不能解析到本地或内网"); return url;
}
function decode(value: string) { return value.replace(/&nbsp;/gi, " ").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&"); }
function cleanHtml(value: string) { return decode(value.replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h1|h2|h3|li|blockquote)>/gi, "\n").replace(/<[^>]*>/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").replace(/[ \t]+/g, " ").trim()); }
function findMeta(html: string, property: string) { const expression = new RegExp(`<meta[^>]+(?:name|property)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"); return decode(html.match(expression)?.[1] ?? ""); }

export async function capturePublicDocument(sourceUrl: string) {
  let current = await assertPublicHttpUrl(sourceUrl); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const response = await fetch(current, { redirect: "manual", signal: controller.signal, headers: { accept: "text/html, text/markdown, text/plain;q=0.9" } });
      if (response.status >= 300 && response.status < 400) { const location = response.headers.get("location"); if (!location) throw new Error("文档重定向缺少目标地址"); current = await assertPublicHttpUrl(new URL(location, current).toString()); continue; }
      if (!response.ok) throw new Error(`文档服务返回 ${response.status}`); const type = response.headers.get("content-type") ?? "text/html"; if (!/^text\/(html|markdown|plain)/i.test(type)) throw new Error("URL 自动采集仅支持 HTML、Markdown 或纯文本；PDF 和 Word 请上传文件");
      const declared = Number(response.headers.get("content-length") ?? 0); if (declared > MAX_BYTES) throw new Error("文档内容超过 1.5MB 采集上限"); const buffer = await response.arrayBuffer(); if (buffer.byteLength > MAX_BYTES) throw new Error("文档内容超过 1.5MB 采集上限");
      const raw = new TextDecoder().decode(buffer); const title = cleanHtml(raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") || findMeta(raw, "og:title") || current.hostname; const summary = findMeta(raw, "description") || findMeta(raw, "og:description") || cleanHtml(raw).slice(0, 280); const content = /^text\/html/i.test(type) ? cleanHtml(raw) : raw.trim(); if (!content) throw new Error("未采集到可阅读的文档正文");
      return { title: title.slice(0, 180), summary: summary.slice(0, 1000), content: content.slice(0, 20_000), sourceUrl: current.toString(), mimeType: /^text\/markdown/i.test(type) ? "text/markdown" : "text/html" };
    }
    throw new Error("文档重定向次数超过上限");
  } catch (error) { if (error instanceof Error && error.name === "AbortError") throw new Error("文档采集超时，请稍后重试"); throw error; } finally { clearTimeout(timeout); }
}
