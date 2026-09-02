// 社区正文编辑辅助：Markdown 工具栏插入、内联附件占位、纯文本摘要。
// 内联图片写成 ![文件名](attachment:{id})，由服务端在读取时替换为短时签名 URL。

export const ATTACHMENT_REF_PREFIX = "attachment:";
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

export type PostKind = "experience" | "question" | "resource" | "discussion";
export const POST_KIND_LABEL: Record<PostKind, string> = {
  experience: "经验分享", question: "问题求助", resource: "资源推荐", discussion: "开放讨论",
};

export const REPLY_POLICY_LABEL: Record<string, string> = {
  all: "所有员工可讨论", mentioned: "仅提及成员", experts: "仅专家组", operations: "仅运营可评论",
};

export function isImageMimeType(value: string): value is ImageMimeType {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

export function attachmentRef(id: number, fileName: string) {
  return `![${fileName.replace(/[[\]]/g, "")}](${ATTACHMENT_REF_PREFIX}${id})`;
}

type WrapStyle = "bold" | "italic" | "code";
type BlockStyle = "heading" | "quote" | "bullet" | "ordered";

const WRAP_MARKS: Record<WrapStyle, string> = { bold: "**", italic: "*", code: "`" };
const BLOCK_PREFIX: Record<BlockStyle, string> = { heading: "## ", quote: "> ", bullet: "- ", ordered: "1. " };

/** Apply an inline mark around the current selection, returning new text and caret range. */
export function applyWrap(value: string, start: number, end: number, style: WrapStyle) {
  const mark = WRAP_MARKS[style];
  const selected = value.slice(start, end) || (style === "code" ? "代码" : "文字");
  const next = `${value.slice(0, start)}${mark}${selected}${mark}${value.slice(end)}`;
  return { value: next, selectionStart: start + mark.length, selectionEnd: start + mark.length + selected.length };
}

/** Prefix every selected line with a block marker, toggling it off when already present. */
export function applyBlock(value: string, start: number, end: number, style: BlockStyle) {
  const prefix = BLOCK_PREFIX[style];
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEnd = value.indexOf("\n", end) === -1 ? value.length : value.indexOf("\n", end);
  const block = value.slice(lineStart, lineEnd) || (style === "heading" ? "小标题" : "内容");
  const lines = block.split("\n");
  const alreadyApplied = lines.every(line => line.startsWith(prefix));
  const updated = lines.map(line => alreadyApplied ? line.slice(prefix.length) : `${prefix}${line}`).join("\n");
  const next = `${value.slice(0, lineStart)}${updated}${value.slice(lineEnd)}`;
  return { value: next, selectionStart: lineStart, selectionEnd: lineStart + updated.length };
}

/** Insert a link scaffold, keeping any selected text as the link label. */
export function applyLink(value: string, start: number, end: number) {
  const label = value.slice(start, end) || "链接文字";
  const snippet = `[${label}](https://)`;
  const next = `${value.slice(0, start)}${snippet}${value.slice(end)}`;
  return { value: next, selectionStart: start + snippet.length - 9, selectionEnd: start + snippet.length - 1 };
}

/** Append a block-level snippet on its own line so images and code never glue to text. */
export function insertBlockSnippet(value: string, position: number, snippet: string) {
  const before = value.slice(0, position).replace(/\s+$/, "");
  const after = value.slice(position).replace(/^\s+/, "");
  const next = [before, snippet, after].filter(Boolean).join("\n\n");
  const caret = [before, snippet].filter(Boolean).join("\n\n").length;
  return { value: next, selectionStart: caret, selectionEnd: caret };
}

export function stripAttachmentRef(markdown: string, attachmentId: number) {
  return markdown.replace(new RegExp(`!\\[[^\\]]*\\]\\(${ATTACHMENT_REF_PREFIX}${attachmentId}\\)`, "g"), "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Plain-text preview used for card summaries and length validation. */
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

export function normalizeTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
