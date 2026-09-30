import { FeishuClient, FeishuError, feishuObject } from "./client";

function columnName(number: number): string {
  let value = number;
  let name = "";
  while (value > 0) {
    value--;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

export async function readSheet(client: FeishuClient, token: string) {
  const meta = await client.json(
    `/open-apis/sheets/v3/spreadsheets/${encodeURIComponent(token)}/sheets/query`,
    "sheet_meta"
  );
  if (!Array.isArray(meta.sheets)) throw new FeishuError("sheet_meta_shape");
  const sheets = [];
  for (const raw of meta.sheets) {
    const item = feishuObject(raw);
    const grid = feishuObject(item.grid_properties);
    const sheetId = typeof item.sheet_id === "string" ? item.sheet_id : "";
    if (!sheetId) throw new FeishuError("sheet_id_shape");
    const rowCount = Math.max(0, Number(grid.row_count) || 0);
    const columnCount = Math.max(0, Number(grid.column_count) || 0);
    const rows: unknown[][] = [];
    let bytes = 0;
    for (let start = 1; start <= rowCount; start += 500) {
      const end = Math.min(rowCount, start + 499);
      const range = `${sheetId}!A${start}:${columnName(Math.max(columnCount, 1))}${end}`;
      const data = await client.json(
        `/open-apis/sheets/v2/spreadsheets/${encodeURIComponent(token)}/values/${encodeURIComponent(range)}`,
        "sheet_values"
      );
      const valueRange = feishuObject(data.valueRange);
      if (!Array.isArray(valueRange.values))
        throw new FeishuError("sheet_values_shape");
      for (const value of valueRange.values) {
        const row = Array.isArray(value) ? value : [];
        bytes += Buffer.byteLength(JSON.stringify(row), "utf8");
        if (bytes > 64 * 1024 * 1024) throw new FeishuError("sheet_size_limit");
        rows.push(row);
      }
    }
    sheets.push({
      sheetId,
      title: typeof item.title === "string" ? item.title : sheetId,
      rowCount,
      columnCount,
      rows,
    });
  }
  return { sheets };
}
