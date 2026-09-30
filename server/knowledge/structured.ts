import { readFile } from "node:fs/promises";
import { resolveStoragePath } from "../storage";
import { normalizeTable, type KnowledgeTable } from "../../shared/knowledge";
export async function structuredPage(
  content: {
    structuredData: Record<string, unknown> | null;
    structuredStorageKey: string | null;
  },
  groupIndex: number,
  page: number,
  pageSize: number
) {
  const data =
    content.structuredData ??
    (content.structuredStorageKey
      ? JSON.parse(
          await readFile(
            resolveStoragePath(content.structuredStorageKey),
            "utf8"
          )
        )
      : {});
  const tables: KnowledgeTable[] = Array.isArray(data.displayTables)
    ? data.displayTables
    : (data.sheets ?? data.tables ?? []).map(normalizeTable);
  const table = tables[groupIndex];
  if (!table) throw new Error("数据表不存在");
  return {
    ...table,
    rows: table.rows.slice(page * pageSize, (page + 1) * pageSize),
    total: table.rows.length,
  };
}
