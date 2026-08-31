export type FullTextCandidate = { content: string | null | undefined; summary: string };

/** 仅将正文明显长于摘要的条目标识为可直接阅读全文，避免把摘要源误标为全文。 */
export function isFullTextNews(item: FullTextCandidate) {
  const body = item.content?.trim() ?? "";
  return body.length > item.summary.trim().length + 80;
}

/**
 * 从聚合源正文中提取“原文入口：URL”指向的真实原文地址。
 * AIHOT 等聚合源会在正文尾部标注原始出处，其价值高于 RSS 条目自带的聚合页链接。
 * RSS XML 中的 URL 常带 HTML 实体（如 &amp;），需解码后再截取，否则链接不完整无法访问。
 */
export function extractOriginalSourceUrl(content: string | null | undefined): string | null {
  const match = content?.match(/原文入口\s*[：:]\s*(\S+)/);
  if (!match) return null;
  const decoded = decodeHtmlEntities(match[1]).replace(/[)）】》。，,；;、"'』」]+$/, "");
  return /^https?:\/\//.test(decoded) ? decoded : null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&quot;/g, "\"")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/**
 * 剥离聚合源正文尾部的样板行（AIHOT 聚合整理声明、“阅读原文 via AIHOT”、原文入口行），
 * 避免阅读页出现重复且低价值的原文链接。原 URL 通过 extractOriginalSourceUrl 单独使用。
 */
export function stripAggregatorFootnotes(content: string): string {
  return content
    .replace(/[—–-]{0,2}\s*本文由\s*AIHOT\s*聚合整理.*$/gm, "")
    .replace(/\s*🔗?\s*阅读原文\s*via\s*AIHOT.*$/gm, "")
    .replace(/原文入口\s*[：:].*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
