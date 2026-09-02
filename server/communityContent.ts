// 社区正文内容层：新帖统一存 Markdown，历史 HTML 帖读取时确定性转 Markdown；
// 内联图片以 attachment:{id} 占位存储，读取时替换为短时签名 URL（签名会过期，不能落库）。

const DANGEROUS_URL = /^\s*(javascript|data|vbscript|file)\s*:/i;
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
// 旧版清洗器把每个 <img> 替换成这句占位文字并写进了库；转换时移除，图片本身仍在附件里。
const LEGACY_IMAGE_PLACEHOLDER = /【已添加图片附件】/g;

export const MARKDOWN_MAX_LENGTH = 30_000;
export const ATTACHMENT_REF_PREFIX = "attachment:";

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

function decodeEntities(input: string) {
  return input
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/gi, match => HTML_ENTITIES[match.toLowerCase()] ?? match)
    .replace(/&#(\d{1,6});/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function safeLinkTarget(url: string) {
  const trimmed = decodeEntities(url).trim();
  if (!trimmed || DANGEROUS_URL.test(trimmed) || trimmed.startsWith("//")) return null;
  if (trimmed.startsWith(ATTACHMENT_REF_PREFIX)) {
    return /^attachment:\d+$/.test(trimmed) ? trimmed : null;
  }
  return /^(https?:\/\/|\/)/i.test(trimmed) ? trimmed : null;
}

/** Strip raw HTML and unsafe link targets so stored Markdown never carries executable markup. */
export function sanitizeMarkdown(input: string) {
  const withoutControl = input.replace(CONTROL_CHARS, "").replace(/\r\n?/g, "\n");
  // 先整块丢掉脚本/样式，避免只去标签留下裸露的脚本正文。
  const withoutScripts = withoutControl.replace(/<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "").replace(/<(script|style|iframe|object|embed)\b[^>]*>/gi, "");
  const withoutHtml = withoutScripts.replace(/<\/?[a-z][^>]*>/gi, "");
  const withSafeLinks = withoutHtml.replace(/(!?)\[([^\]]*)\]\(([^)\s]*)(\s+"[^"]*")?\)/g, (_match, bang: string, label: string, target: string) => {
    const safe = safeLinkTarget(target);
    if (safe) return `${bang}[${label}](${safe})`;
    return bang ? "" : label;
  });
  return withSafeLinks.replace(/\n{3,}/g, "\n\n").trim().slice(0, MARKDOWN_MAX_LENGTH);
}

/** Convert legacy stored rich-text HTML into Markdown so old posts render through the same pipeline. */
export function htmlToMarkdown(input: string) {
  let output = input.replace(CONTROL_CHARS, "").replace(/\r\n?/g, "\n");
  output = output.replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, "");
  output = output.replace(/<img\b[^>]*>/gi, (match: string) => {
    const src = match.match(/src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const alt = match.match(/alt\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const target = safeLinkTarget(src?.[1] ?? src?.[2] ?? src?.[3] ?? "");
    return target ? `\n\n![${decodeEntities(alt?.[1] ?? alt?.[2] ?? "图片")}](${target})\n\n` : "";
  });
  output = output.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (match: string, label: string) => {
    const href = match.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const target = safeLinkTarget(href?.[1] ?? href?.[2] ?? href?.[3] ?? "");
    const text = label.replace(/<[^>]+>/g, "").trim();
    return target ? `[${text || target}](${target})` : text;
  });
  output = output.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag: string, text: string) => `**${text.replace(/<[^>]+>/g, "").trim()}**`);
  output = output.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag: string, text: string) => `*${text.replace(/<[^>]+>/g, "").trim()}*`);
  output = output
    .replace(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi, (_match, text: string) => `\n\n## ${text.replace(/<[^>]+>/g, "").trim()}\n\n`)
    .replace(/<h[3-6]\b[^>]*>([\s\S]*?)<\/h[3-6]>/gi, (_match, text: string) => `\n\n### ${text.replace(/<[^>]+>/g, "").trim()}\n\n`)
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_match, text: string) => `\`${text.replace(/<[^>]+>/g, "").trim()}\``)
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_match, text: string) => `\n\n> ${text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}\n\n`)
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_match, text: string) => `\n- ${text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`)
    .replace(/<\/(p|div|ul|ol|section|article)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n");
  return sanitizeMarkdown(decodeEntities(output.replace(/<[^>]+>/g, "")).replace(LEGACY_IMAGE_PLACEHOLDER, ""));
}

export type StoredPostContent = {
  content: string;
  contentMarkdown?: string | null;
  contentHtml?: string | null;
  contentFormat?: "html" | "markdown" | null;
};

/** Stored post row -> Markdown ready for rendering, regardless of when it was authored. */
export function toRenderableMarkdown(post: StoredPostContent) {
  if (post.contentFormat === "markdown" && post.contentMarkdown) return sanitizeMarkdown(post.contentMarkdown);
  if (post.contentHtml) return htmlToMarkdown(post.contentHtml);
  return sanitizeMarkdown(post.content);
}

/** Plain text used for list previews, search and the canonical `content` column. */
export function markdownToPlainText(input: string) {
  return input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Replace attachment refs with freshly signed URLs; drop refs whose attachment no longer exists. */
export function resolveAttachmentRefs(markdown: string, urlByAttachmentId: Map<number, string>) {
  return markdown.replace(/!\[([^\]]*)\]\(attachment:(\d+)\)/g, (_, alt: string, id: string) => {
    const url = urlByAttachmentId.get(Number(id));
    return url ? `![${alt}](${url})` : "";
  }).replace(/\n{3,}/g, "\n\n").trim();
}

/** Remove one attachment's inline image so deleting a thumbnail also clears it from the body. */
export function stripAttachmentRef(markdown: string, attachmentId: number) {
  const pattern = new RegExp(`!\\[[^\\]]*\\]\\(attachment:${attachmentId}\\)`, "g");
  return markdown.replace(pattern, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Attachment ids still referenced inline, used to keep body and attachment set consistent. */
export function referencedAttachmentIds(markdown: string) {
  return Array.from(markdown.matchAll(/!\[[^\]]*\]\(attachment:(\d+)\)/g)).map(match => Number(match[1]));
}
