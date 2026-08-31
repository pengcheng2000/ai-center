import { lookup } from "node:dns/promises";

export type RssEntry = {
  title: string;
  summary: string;
  content: string;
  link: string;
  categories: string[];
  publishedAt: Date | null;
};

const MAX_FEED_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 12_000;

function unwrapCdata(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1");
}

function decodeEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

export function plainTextFromFeed(value: string) {
  return decodeEntities(unwrapCdata(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function readTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

function readAllTags(block: string, tag: string) {
  return Array.from(block.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi"))).map(match => plainTextFromFeed(match[1] ?? "")).filter(Boolean);
}

function readOriginalUrl(description: string) {
  const match = unwrapCdata(description).match(/<a\s+[^>]*href\s*=\s*(["'])(https?:\/\/[^"'\s<>]+)\1/i);
  return match?.[2] ?? "";
}

function validHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseRssXml(xml: string, limit = 50): RssEntry[] {
  const blocks = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ?? [];
  return blocks.slice(0, limit).map(block => {
    const rawDescription = readTag(block, "description");
    const rawContent = readTag(block, "content:encoded") || rawDescription;
    const link = plainTextFromFeed(readTag(block, "link"));
    const originalUrl = readOriginalUrl(rawDescription);
    const summary = plainTextFromFeed(rawDescription).replace(/\s*(🔗\s*)?(阅读原文|via\s+AIHOT).*$/i, "").trim();
    const publishedValue = plainTextFromFeed(readTag(block, "pubDate") || readTag(block, "dc:date"));
    const timestamp = Date.parse(publishedValue);
    const categories = Array.from(new Set(readAllTags(block, "category").map(value => value.slice(0, 48))));
    const contentBase = plainTextFromFeed(rawContent) || summary;
    const content = originalUrl && originalUrl !== link ? `${contentBase}\n\n原文入口：${originalUrl}` : contentBase;
    return {
      title: plainTextFromFeed(readTag(block, "title")).slice(0, 240),
      summary: (summary || contentBase).slice(0, 6000),
      content: content.slice(0, 12000),
      link: validHttpUrl(link) ? link.slice(0, 500) : "",
      categories,
      publishedAt: Number.isNaN(timestamp) ? null : new Date(timestamp),
    };
  }).filter(entry => entry.title.length > 0 && entry.summary.length > 0 && entry.link.length > 0);
}

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  const ipv4 = normalized.startsWith("::ffff:") ? normalized.slice(7) : normalized;
  const parts = ipv4.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => Number.isNaN(part))) return false;
  return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}

async function assertPublicHttpUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("资讯源地址无效");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("资讯源仅支持无凭据的 HTTP(S) 地址");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || isPrivateAddress(hostname)) throw new Error("资讯源不能指向本地或内网地址");
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("资讯源域名无法解析");
  }
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) throw new Error("资讯源不能解析到本地或内网地址");
  return url;
}

export async function fetchRssEntries(sourceUrl: string, limit = 50) {
  let current = await assertPublicHttpUrl(sourceUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
      const response = await fetch(current, { redirect: "manual", signal: controller.signal, headers: { accept: "application/rss+xml, application/xml, text/xml;q=0.9" } });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error("RSS 地址重定向缺少目标地址");
        current = await assertPublicHttpUrl(new URL(location, current).toString());
        continue;
      }
      if (!response.ok) throw new Error(`RSS 服务返回 ${response.status}`);
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > MAX_FEED_BYTES) throw new Error("RSS 内容超过 2MB 的采集上限");
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_FEED_BYTES) throw new Error("RSS 内容超过 2MB 的采集上限");
      const entries = parseRssXml(new TextDecoder().decode(buffer), limit);
      if (!entries.length) throw new Error("未在 RSS 中找到可导入的文章条目");
      return entries;
    }
    throw new Error("RSS 重定向次数超过上限");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("RSS 拉取超时，请稍后重试");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
