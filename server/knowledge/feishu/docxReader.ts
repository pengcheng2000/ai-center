import { FeishuClient, FeishuError } from "./client";

export async function readDocxBlocks(
  client: FeishuClient,
  objToken: string
): Promise<{ blocks: Record<string, unknown>[]; pages: number }> {
  const blocks: Record<string, unknown>[] = [];
  let pageToken = "";
  let pages = 0;
  const seen = new Set<string>();
  do {
    const query = new URLSearchParams({ page_size: "500" });
    if (pageToken) query.set("page_token", pageToken);
    const data = await client.json(
      `/open-apis/docx/v1/documents/${encodeURIComponent(objToken)}/blocks?${query}`,
      "docx_blocks"
    );
    pages++;
    if (!Array.isArray(data.items)) throw new FeishuError("docx_blocks_shape");
    blocks.push(
      ...data.items.filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === "object" && !Array.isArray(item)
      )
    );
    const next = typeof data.page_token === "string" ? data.page_token : "";
    if (data.has_more === true && (!next || seen.has(next)))
      throw new FeishuError("docx_pagination");
    pageToken = data.has_more === true ? next : "";
    if (pageToken) seen.add(pageToken);
  } while (pageToken);
  return { blocks, pages };
}
