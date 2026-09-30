import { FeishuClient, FeishuError, feishuObject } from "./client";

export type WikiNode = {
  nodeToken: string;
  parentNodeToken: string | null;
  title: string;
  authorName: string | null;
  objToken: string;
  objType: string;
  nodeType: "origin" | "shortcut";
  originSpaceId: string | null;
  originNodeToken: string | null;
  originObjToken: string | null;
  sourceUpdatedAt: Date | null;
  hasChild: boolean;
};

function parseNode(value: unknown): WikiNode {
  const row = feishuObject(value);
  if (
    typeof row.node_token !== "string" ||
    typeof row.obj_token !== "string" ||
    typeof row.obj_type !== "string"
  )
    throw new FeishuError("wiki_node_shape");
  const updated = Number(row.obj_edit_time ?? row.node_edit_time);
  return {
    nodeToken: row.node_token,
    parentNodeToken:
      typeof row.parent_node_token === "string" && row.parent_node_token
        ? row.parent_node_token
        : null,
    title: typeof row.title === "string" ? row.title : row.node_token,
    authorName:
      typeof row.creator_name === "string"
        ? row.creator_name
        : typeof row.owner_name === "string"
          ? row.owner_name
          : null,
    objToken: row.obj_token,
    objType: row.obj_type,
    nodeType: row.node_type === "shortcut" ? "shortcut" : "origin",
    originSpaceId:
      typeof row.origin_space_id === "string" ? row.origin_space_id : null,
    originNodeToken:
      typeof row.origin_node_token === "string" ? row.origin_node_token : null,
    originObjToken:
      typeof row.origin_obj_token === "string" ? row.origin_obj_token : null,
    sourceUpdatedAt:
      Number.isFinite(updated) && updated > 0 ? new Date(updated * 1000) : null,
    hasChild: row.has_child === true,
  };
}

export async function resolveWikiSpace(
  client: FeishuClient,
  nodeToken: string
) {
  const query = new URLSearchParams({ token: nodeToken, obj_type: "wiki" });
  const data = await client.json(
    `/open-apis/wiki/v2/spaces/get_node?${query}`,
    "wiki_resolve"
  );
  const node = feishuObject(data.node);
  if (typeof node.space_id !== "string")
    throw new FeishuError("wiki_space_shape");
  return node.space_id;
}

/** Traverses only this space. The returned list is authoritative only on full success. */
export async function readWikiDirectory(
  client: FeishuClient,
  spaceId: string
): Promise<{ nodes: WikiNode[]; pages: number }> {
  const parents: Array<string | null> = [null];
  const seenParents = new Set<string>();
  const seenNodes = new Set<string>();
  const nodes: WikiNode[] = [];
  let pages = 0;
  while (parents.length) {
    const parent = parents.shift()!;
    if (parent && seenParents.has(parent)) continue;
    if (parent) seenParents.add(parent);
    let pageToken = "";
    const seenPages = new Set<string>();
    do {
      const query = new URLSearchParams({ page_size: "50" });
      if (parent) query.set("parent_node_token", parent);
      if (pageToken) query.set("page_token", pageToken);
      const data = await client.json(
        `/open-apis/wiki/v2/spaces/${encodeURIComponent(spaceId)}/nodes?${query}`,
        "wiki_directory"
      );
      pages++;
      if (!Array.isArray(data.items))
        throw new FeishuError("wiki_directory_shape");
      for (const raw of data.items) {
        const node = parseNode(raw);
        if (seenNodes.has(node.nodeToken)) continue;
        seenNodes.add(node.nodeToken);
        nodes.push(node);
        if (node.hasChild && node.nodeType === "origin")
          parents.push(node.nodeToken);
      }
      const next = typeof data.page_token === "string" ? data.page_token : "";
      if (data.has_more === true && (!next || seenPages.has(next)))
        throw new FeishuError("wiki_pagination");
      pageToken = data.has_more === true ? next : "";
      if (pageToken) seenPages.add(pageToken);
    } while (pageToken);
  }
  return { nodes, pages };
}
