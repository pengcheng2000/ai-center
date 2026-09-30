import { FeishuClient, FeishuError, feishuObject } from "./client";

async function allPages(client: FeishuClient, path: string, stage: string) {
  const items: unknown[] = [];
  let bytes = 0;
  let token = "";
  const seen = new Set<string>();
  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (token) query.set("page_token", token);
    const data = await client.json(`${path}?${query}`, stage);
    if (!Array.isArray(data.items)) throw new FeishuError(`${stage}_shape`);
    for (const item of data.items) {
      bytes += Buffer.byteLength(JSON.stringify(item), "utf8");
      if (bytes > 64 * 1024 * 1024)
        throw new FeishuError(`${stage}_size_limit`);
      items.push(item);
    }
    const next = typeof data.page_token === "string" ? data.page_token : "";
    if (data.has_more === true && (!next || seen.has(next)))
      throw new FeishuError(`${stage}_pagination`);
    token = data.has_more === true ? next : "";
    if (token) seen.add(token);
  } while (token);
  return items;
}

export async function readBitable(client: FeishuClient, appToken: string) {
  const appPath = `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables`;
  const tableRows = await allPages(client, appPath, "bitable_tables");
  const tables = [];
  for (const raw of tableRows) {
    const row = feishuObject(raw);
    const tableId = typeof row.table_id === "string" ? row.table_id : "";
    if (!tableId) throw new FeishuError("bitable_table_id_shape");
    const tablePath = `${appPath}/${encodeURIComponent(tableId)}`;
    const [fieldRows, recordRows] = await Promise.all([
      allPages(client, `${tablePath}/fields`, "bitable_fields"),
      allPages(client, `${tablePath}/records`, "bitable_records"),
    ]);
    tables.push({
      tableId,
      name: typeof row.name === "string" ? row.name : tableId,
      fields: fieldRows,
      records: recordRows,
    });
  }
  return { tables };
}
