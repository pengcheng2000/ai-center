import { sanitizeHtmlSnapshot } from "../../safeHtml";
import { sanitizeMarkdown } from "../../communityContent";
import { feishuObject } from "./client";
import { fileMime } from "./fileReader";
import { cleanExcerpt, normalizeTable } from "../../../shared/knowledge";
import {
  packLocators,
  packStructured,
  sha256,
  type AssetRequest,
  type NormalizedContent,
} from "../types";

const escapeMarkdown = (text: string) =>
  text.replace(/([\\`*_{}\[\]<>])/g, "\\$1");
const textObject = (value: unknown) => feishuObject(value);

function safeLink(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const decoded = /^https?%3a/i.test(value)
      ? decodeURIComponent(value)
      : value;
    const url = new URL(decoded);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href.replace(/\(/g, "%28").replace(/\)/g, "%29")
      : null;
  } catch {
    return null;
  }
}

function richText(payload: unknown): string {
  const data = textObject(payload);
  if (!Array.isArray(data.elements)) return "";
  return data.elements
    .map(element => {
      const item = textObject(element);
      const run = textObject(item.text_run);
      const mention = textObject(item.mention_doc);
      const raw =
        typeof run.content === "string"
          ? run.content
          : typeof mention.title === "string"
            ? mention.title
            : item.mention_user
              ? "@成员"
              : "";
      let value = escapeMarkdown(raw);
      const style = textObject(run.text_element_style);
      if ((style.bold || style.italic) && !style.inline_code)
        value = raw
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      if (style.inline_code) value = `\`${value.replace(/`/g, "\\`")}\``;
      if (style.bold && value.trim()) value = `<strong>${value}</strong>`;
      if (style.italic && value.trim()) value = `<em>${value}</em>`;
      if (style.strikethrough) value = `~~${value}~~`;
      const link =
        safeLink(textObject(style.link).url) ??
        safeLink(mention.url) ??
        (typeof mention.token === "string"
          ? `https://www.feishu.cn/${mention.obj_type === "wiki" ? "wiki" : "docx"}/${encodeURIComponent(mention.token)}`
          : null);
      if (link) value = `[${value}](${link})`;
      return value;
    })
    .join("");
}

function compactGroups(
  groups: unknown[],
  maxBytes = 64 * 1024
): Record<string, unknown> {
  const result = groups.map(value => structuredClone(value)) as Array<
    Record<string, unknown>
  >;
  let truncated = false;
  while (
    Buffer.byteLength(JSON.stringify({ groups: result }), "utf8") > maxBytes &&
    result.length
  ) {
    truncated = true;
    const last = result.at(-1)!;
    const list = [last.rows, last.records, last.fields].find(Array.isArray) as
      | unknown[]
      | undefined;
    if (list?.length) list.pop();
    else result.pop();
  }
  return { groups: result, truncated };
}

export function normalizeDocx(
  title: string,
  blocks: Record<string, unknown>[]
): NormalizedContent {
  const byId = new Map(blocks.map(block => [String(block.block_id), block]));
  const root = blocks.find(block => block.block_type === 1);
  const topIds = Array.isArray(root?.children)
    ? root.children.map(String)
    : blocks
        .filter(block => block.parent_id === root?.block_id)
        .map(block => String(block.block_id));
  const assets = new Map<string, AssetRequest>();
  const unsupported: Record<string, number> = {};
  const locators: Record<string, unknown> = {};
  const mark = (kind: string) => {
    unsupported[kind] = (unsupported[kind] ?? 0) + 1;
  };
  const visiting = new Set<string>();

  function render(id: string): string {
    const block = byId.get(id);
    if (!block || visiting.has(id)) return "";
    visiting.add(id);
    const type = Number(block.block_type);
    const payloadName = Object.keys(block).find(
      key => !["block_id", "block_type", "parent_id", "children"].includes(key)
    );
    const payload = textObject(payloadName ? block[payloadName] : null);
    if (Array.isArray(payload.elements)) {
      for (const element of payload.elements)
        if (textObject(element).undefined) mark("unsupported_inline");
    }
    const children = Array.isArray(block.children)
      ? block.children.map(String)
      : [];
    let result = "";
    if (type === 1) result = children.map(render).filter(Boolean).join("\n\n");
    else if (type >= 3 && type <= 11) {
      const level = type - 2;
      result = `${"#".repeat(Math.min(level, 6))} ${richText(payload)}`;
      locators[id] = { heading: level };
    } else if (type === 2) result = [richText(payload), ...children.map(render)].filter(Boolean).join("\n\n");
    else if (type === 12 || type === 13 || type === 17) {
      const nested = children.map(render).filter(Boolean).join("\n\n");
      result = `${type === 13 ? "1." : type === 17 ? "- [ ]" : "-"} ${richText(payload)}`;
      if (nested) result += "\n\n" + nested.split("\n").map(line => "    " + line).join("\n");
    }
    else if (type === 14) {
      const code = Array.isArray(payload.elements)
        ? payload.elements
            .map(e => String(textObject(textObject(e).text_run).content ?? ""))
            .join("")
        : "";
      const fence = "`".repeat(
        Math.max(3, ...[...code.matchAll(/`+/g)].map(m => m[0].length + 1))
      );
      result = `${fence}\n${code}\n${fence}`;
    } else if (type === 15) result = `> ${richText(payload)}`;
    else if (type === 22) result = "---";
    else if (type === 27) {
      const token = typeof payload.token === "string" ? payload.token : "";
      if (token) {
        const assetRef = `image-${sha256(token).slice(0, 24)}`;
        assets.set(assetRef, {
          assetRef,
          token,
          kind: "inline_image",
          fileName: `${assetRef}.png`,
          mimeType: "image/png",
        });
        result = `![图片](knowledge-asset:${assetRef})`;
      } else {
        mark("image_without_token");
        result = "";
      }
    } else if (type === 31) {
      const properties = textObject(payload.property);
      const cells = Array.isArray(payload.cells)
        ? payload.cells.map(String)
        : children;
      const cols = Math.max(1, Number(properties.column_size) || 1);
      const rows = Math.ceil(cells.length / cols);
      const renderedCells = cells.map(render);
      const matrix = Array.from({ length: rows }, (_, row) =>
        Array.from({ length: cols }, (_, col) => {
          const value = renderedCells[row * cols + col] ?? "";
          return value
            .replace(/^\s{0,3}#{1,6}\s*/gm, "")
            .replace(/^\s*>\s*/gm, "")
            .replace(/\|/g, "\\|")
            .replace(/\n+/g, "<br>");
        })
      );
      if (Object.keys(textObject(properties.merge_info)).length)
        mark("merged_table_cells");
      const header = matrix[0] ?? [];
      const labels = header.map(c => cleanExcerpt(c, 1000)).filter(Boolean);
      const isDataTable =
        labels.length >= Math.min(2, cols) &&
        labels.every(c => c.length <= 30) &&
        new Set(labels).size === labels.length;
      result = !isDataTable
        ? renderedCells.filter(Boolean).join("\n\n---\n\n")
        : matrix.length
          ? [
              `| ${matrix[0].join(" | ")} |`,
              `| ${matrix[0].map(() => "---").join(" | ")} |`,
              ...matrix.slice(1).map(row => `| ${row.join(" | ")} |`),
            ].join("\n")
          : "";
      locators[id] = { tableRows: rows, tableColumns: cols };
    } else if (type === 32)
      result = children.map(render).filter(Boolean).join("\n\n");
    else if (type === 19 || type === 34)
      result = children
        .map(render)
        .filter(Boolean)
        .map(text =>
          text
            .split("\n")
            .map(line => `> ${line}`)
            .join("\n")
        )
        .join("\n");
    else if (payloadName === "file" && typeof payload.token === "string") {
      const assetRef = `file-${sha256(payload.token).slice(0, 24)}`;
      const name = String(payload.name ?? "附件");
      assets.set(assetRef, {
        assetRef,
        token: payload.token,
        kind: "attachment",
        fileName: name,
        mimeType: fileMime(name),
      });
      result = `[${escapeMarkdown(name)}](knowledge-asset:${assetRef})`;
    } else if (["grid", "view", "grid_column"].includes(payloadName ?? "")) {
      mark(`${payloadName}_linearized`);
      result = children.map(render).filter(Boolean).join("\n\n");
    } else {
      mark(payloadName ?? `block_${type}`);
      const nested = children.map(render).filter(Boolean).join("\n\n");
      result = nested;
    }
    visiting.delete(id);
    return result;
  }

  const body = (
    topIds.length ? topIds : blocks.map(block => String(block.block_id))
  )
    .map(render)
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{4,}/g, "\n\n\n");
  const locatorsPacked = packLocators(locators);
  return {
    format: "markdown",
    title,
    summary: cleanExcerpt(body),
    bodyMarkdown: body,
    rawSnapshot: JSON.stringify(blocks),
    renderStatus: Object.keys(unsupported).length ? "incomplete" : "complete",
    unsupportedSummary: unsupported,
    ...locatorsPacked,
    assets: [...assets.values()],
  };
}

export function normalizeStructured(
  title: string,
  data: Record<string, unknown>,
  kind: "sheet" | "bitable"
): NormalizedContent {
  const groups = kind === "sheet" ? data.sheets : data.tables;
  const rows = Array.isArray(groups) ? groups : [];
  const tables = rows.map(g => normalizeTable(textObject(g)));
  const packed = packStructured({ displayTables: tables });
  return {
    format: "structured",
    title,
    summary: `${tables.length} 个数据表，${tables.reduce((n, t) => n + t.total, 0)} 行`,
    ...packed,
    structuredSchema: {
      groups: tables.map(t => ({
        name: t.name,
        columns: t.columns,
        total: t.total,
      })),
    },
    structuredPreview: compactGroups(
      tables.map(t => ({ ...t, rows: t.rows.slice(0, 20) }))
    ),
    rowCount: tables.reduce((n, t) => n + t.total, 0),
    columnCount: Math.max(0, ...tables.map(t => t.columns.length)),
    rawSnapshot: JSON.stringify(data),
    renderStatus: "complete",
    unsupportedSummary: {},
    locatorMap: {},
    locatorTruncated: false,
    assets: [],
  };
}

export function normalizeFile(
  title: string,
  content: Uint8Array
): NormalizedContent {
  const mime = fileMime(title);
  const rawSnapshot = content;
  if (mime === "text/markdown") {
    const original = Buffer.from(content).toString("utf8");
    const remoteImages = /!\[[^\]]*\]\(https?:\/\/[^)]+\)/gi;
    const hasRemoteImages = remoteImages.test(original);
    const markdown = sanitizeMarkdown(
      original.replace(remoteImages, "[外部图片未复制]"),
      Number.MAX_SAFE_INTEGER
    );
    return {
      format: "markdown",
      title,
      summary: cleanExcerpt(markdown),
      bodyMarkdown: markdown,
      rawSnapshot,
      renderStatus: hasRemoteImages ? "incomplete" : "complete",
      unsupportedSummary: hasRemoteImages ? { remote_image: 1 } : {},
      locatorMap: {},
      locatorTruncated: false,
      assets: [],
    };
  }
  if (mime === "text/html") {
    const original = Buffer.from(content).toString("utf8");
    const remoteImages = /<img\b[^>]*\bsrc\s*=\s*["']?https?:/i.test(original);
    const unsafeElements = /<(script|iframe|object|embed)\b/i.test(original);
    const html = sanitizeHtmlSnapshot(original, { allowRemoteImages: false });
    return {
      format: "html",
      title,
      summary: cleanExcerpt(html),
      bodyHtml: html,
      rawSnapshot,
      renderStatus: remoteImages || unsafeElements ? "incomplete" : "complete",
      unsupportedSummary: {
        ...(remoteImages ? { remote_image: 1 } : {}),
        ...(unsafeElements ? { unsafe_html: 1 } : {}),
      },
      locatorMap: {},
      locatorTruncated: false,
      assets: [],
    };
  }
  return {
    format: "binary",
    title,
    summary: mime === "application/pdf" ? "PDF 文件" : "暂不支持预览的文件",
    rawSnapshot,
    renderStatus: mime === "application/pdf" ? "complete" : "preview_only",
    unsupportedSummary:
      mime === "application/pdf" ? {} : { unsupported_file_type: 1 },
    locatorMap: {},
    locatorTruncated: false,
    assets: [],
  };
}
