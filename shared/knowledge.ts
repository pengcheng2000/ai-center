export const KNOWLEDGE_CATEGORIES = [
  { id: "basics", name: "AI 入门", description: "理解概念，建立 AI 基础认知" },
  { id: "tools", name: "工具与平台", description: "认识企业可用的 AI 工具" },
  {
    id: "tutorials",
    name: "实操教程",
    description: "跟着步骤，完成一次实际操作",
  },
  { id: "cases", name: "业务案例", description: "了解 AI 在真实业务中的应用" },
  {
    id: "development",
    name: "开发与集成",
    description: "开发、连接与构建 AI 应用",
  },
  { id: "governance", name: "治理与参考", description: "规范、评估与参考资料" },
] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number]["id"];
export type KnowledgeEditorial = {
  category: KnowledgeCategory;
  summary: string;
  topic: string;
  topicOrder: number;
  included: boolean;
  featured: boolean;
  reviewedContentId: number | null;
  reason: string;
};
/** Review bookkeeping does not change the public presentation. */
export function sameEditorialPresentation(
  a: KnowledgeEditorial | null | undefined,
  b: KnowledgeEditorial | null | undefined
) {
  if (!a || !b) return false;
  return (
    a.category === b.category &&
    a.summary === b.summary &&
    a.topic === b.topic &&
    a.topicOrder === b.topicOrder &&
    a.included === b.included &&
    a.featured === b.featured
  );
}
export const categoryName = (id?: string | null) =>
  KNOWLEDGE_CATEGORIES.find(c => c.id === id)?.name ?? "待整理";
export const defaultEditorial = (): KnowledgeEditorial => ({
  category: "basics",
  summary: "",
  topic: "",
  topicOrder: 0,
  included: false,
  featured: false,
  reviewedContentId: null,
  reason: "尚未整理",
});
export function cleanExcerpt(text: string | null | undefined, limit = 120) {
  return (text ?? "")
    .replace(
      /\[(?:暂不完整支持|Image blocked|图片未能读取|外部图片未复制)[^\]]*\]/gi,
      ""
    )
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/[#*`_~>|\\]/g, "")
    .replace(/-{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}
export type KnowledgeCell = { text: string; href?: string };
export function safeKnowledgeLink(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const u = new URL(
      /^https?%3a/i.test(value) ? decodeURIComponent(value) : value
    );
    if (["http:", "https:"].includes(u.protocol) && !u.username && !u.password)
      return u.href;
  } catch {
    /* Unsupported link. */
  }
}
export function cellParts(value: unknown): KnowledgeCell[] {
  if (value == null) return [];
  if (typeof value === "string" || typeof value === "number")
    return [{ text: String(value) }];
  if (typeof value === "boolean") return [{ text: value ? "是" : "否" }];
  if (Array.isArray(value)) return value.flatMap(cellParts);
  if (typeof value !== "object") return [];
  const v = value as Record<string, unknown>;
  if (typeof v.text === "string")
    return [{ text: v.text, href: safeKnowledgeLink(v.link ?? v.url) }];
  if (typeof v.name === "string")
    return [{ text: v.name, href: safeKnowledgeLink(v.link ?? v.url) }];
  if (v.text_run) return cellParts(v.text_run);
  if (typeof v.content === "string") return [{ text: v.content }];
  if (v.value != null) return cellParts(v.value);
  return [];
}
export const cellText = (value: unknown) =>
  cellParts(value)
    .map(p => p.text)
    .join("");
export type KnowledgeTable = {
  name: string;
  columns: string[];
  rows: KnowledgeCell[][][];
  total: number;
};
export function normalizeTable(raw: Record<string, unknown>): KnowledgeTable {
  const fields = Array.isArray(raw.fields)
    ? (raw.fields as Record<string, unknown>[])
    : [];
  const records = Array.isArray(raw.records)
    ? (raw.records as Record<string, unknown>[])
    : [];
  let columns = fields.map(f => String(f.field_name ?? f.name ?? "字段"));
  let rows: KnowledgeCell[][][] = fields.length
    ? records.map(r =>
        columns.map(name =>
          cellParts((r.fields as Record<string, unknown> | undefined)?.[name])
        )
      )
    : (Array.isArray(raw.rows) ? raw.rows : []).map(r =>
        (Array.isArray(r) ? r : []).map(cellParts)
      );
  const nonempty = (c: KnowledgeCell[] | undefined) =>
    !!c?.some(p => p.text.trim());
  while (rows.length && !rows.at(-1)!.some(nonempty)) rows.pop();
  if (!fields.length) {
    const width = Math.max(
      0,
      ...rows.map(r => r.reduce((n, c, i) => (nonempty(c) ? i + 1 : n), 0))
    );
    rows = rows.map(r => Array.from({ length: width }, (_, i) => r[i] ?? []));
    const first =
      rows[0]?.map(c =>
        c
          .map(p => p.text)
          .join("")
          .trim()
      ) ?? [];
    const header =
      first.length > 0 &&
      first.every(
        c => c.length > 0 && c.length <= 30 && !/^[-+\d.,%\s]+$/.test(c)
      ) &&
      new Set(first).size === first.length;
    const columnLabel = (i: number): string =>
      i < 26
        ? String.fromCharCode(65 + i)
        : columnLabel(Math.floor(i / 26) - 1) + columnLabel(i % 26);
    columns = header
      ? first
      : Array.from({ length: width }, (_, i) => columnLabel(i));
    if (header) rows = rows.slice(1);
  }
  return {
    name: String(raw.title ?? raw.name ?? "数据表"),
    columns,
    rows,
    total: rows.length,
  };
}
