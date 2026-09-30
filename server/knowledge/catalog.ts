import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  knowledgeContents,
  knowledgeItems,
  contentPublications,
} from "../../drizzle/schema";
import {
  KNOWLEDGE_CATEGORIES,
  defaultEditorial,
  sameEditorialPresentation,
  type KnowledgeEditorial,
} from "../../shared/knowledge";
import { knowledgeDb } from "./repository";
import { knowledgeListForViewer, type KnowledgeViewer } from "./permissions";

export const editorialInput = z.object({
  category: z.enum([
    "basics",
    "tools",
    "tutorials",
    "cases",
    "development",
    "governance",
  ]),
  summary: z.string().trim().max(120),
  topic: z.string().trim().max(100),
  topicOrder: z.number().int().min(0).max(10000),
  included: z.boolean(),
  featured: z.boolean(),
  reviewedContentId: z.number().int().positive().nullable(),
  reason: z.string().max(500),
});
export const catalogInput = z
  .object({
    query: z.string().max(200).default(""),
    category: z.string().default("all"),
    topic: z.string().default("all"),
    sort: z.enum(["recommended", "recent"]).default("recommended"),
    page: z.number().int().min(1).default(1),
  })
  .default({
    query: "",
    category: "all",
    topic: "all",
    sort: "recommended",
    page: 1,
  });
export async function viewerCatalog(
  viewer: KnowledgeViewer,
  input: z.infer<typeof catalogInput>
) {
  const authorized = await knowledgeListForViewer(viewer);
  const all = authorized
    .filter(row => row.editorial?.included)
    .map(row => ({
      ...row,
      editorial: row.editorial && {
        ...row.editorial,
        featured:
          !!row.editorial.featured &&
          row.editorial.reviewedContentId === row.contentId,
      },
    }));
  const query = input.query.trim().toLocaleLowerCase();
  const filtered = all.filter(
    row =>
      (input.category === "all" ||
        row.editorial?.category === input.category) &&
      (input.topic === "all" || row.editorial?.topic === input.topic) &&
      `${row.title} ${row.editorial?.summary || row.summary || ""} ${row.editorial?.topic || ""}`
        .toLocaleLowerCase()
        .includes(query)
  );
  filtered.sort(
    (a, b) =>
      (input.sort === "recommended"
        ? Number(b.editorial?.featured) - Number(a.editorial?.featured)
        : 0) ||
      Number(b.sourceUpdatedAt) - Number(a.sourceUpdatedAt) ||
      b.itemId - a.itemId
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 18));
  const page = Math.min(input.page, pages);
  const topics = new Map<string, number>();
  all
    .filter(
      r => input.category === "all" || r.editorial?.category === input.category
    )
    .forEach(r => {
      if (r.editorial?.topic)
        topics.set(r.editorial.topic, (topics.get(r.editorial.topic) ?? 0) + 1);
    });
  return {
    items: filtered.slice((page - 1) * 18, page * 18),
    total: filtered.length,
    page,
    pages,
    allCount: all.length,
    visibility: authorized[0]?.visibility ?? null,
    categories: KNOWLEDGE_CATEGORIES.map(c => ({
      ...c,
      count: all.filter(r => r.editorial?.category === c.id).length,
    })),
    topics: [...topics]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
  };
}
export const adminCatalogInput = z.object({
  sourceId: z.number().int().positive(),
  query: z.string().max(200).default(""),
  category: z.string().default("all"),
  topic: z.string().default("all"),
  status: z.string().default("all"),
  quality: z.string().default("all"),
  page: z.number().int().min(1).default(1),
});
export async function adminCatalog(input: z.infer<typeof adminCatalogInput>) {
  const db = await knowledgeDb();
  const items = await db
    .select()
    .from(knowledgeItems)
    .where(eq(knowledgeItems.sourceId, input.sourceId));
  if (!items.length)
    return {
      items: [],
      total: 0,
      pages: 1,
      page: 1,
      reviewQueue: [] as number[],
      counts: { review: 0, approved: 0, published: 0, updated: 0, issue: 0 },
      topics: [] as string[],
    };
  const ids = items.map(i => i.id);
  const contents = await db
    .select({
      id: knowledgeContents.id,
      itemId: knowledgeContents.itemId,
      versionNo: knowledgeContents.versionNo,
      renderStatus: knowledgeContents.renderStatus,
      readyAt: knowledgeContents.readyAt,
    })
    .from(knowledgeContents)
    .where(
      and(
        eq(knowledgeContents.ingestStatus, "ready"),
        inArray(knowledgeContents.itemId, ids)
      )
    )
    .orderBy(desc(knowledgeContents.versionNo));
  const pubs = await db
    .select()
    .from(contentPublications)
    .where(inArray(contentPublications.itemId, ids))
    .orderBy(desc(contentPublications.id));
  const rows = items.map(item => {
    const latest = contents.find(c => c.itemId === item.id) ?? null;
    const published =
      pubs.find(p => p.itemId === item.id && p.status === "published") ?? null;
    const approved =
      pubs.find(
        p =>
          p.itemId === item.id &&
          p.status === "approved" &&
          p.contentId === latest?.id &&
          sameEditorialPresentation(p.editorialSnapshot, item.editorial)
      ) ?? null;
    const quality =
      !latest ||
      item.syncStatus !== "active" ||
      item.sourceAccessStatus !== "accessible"
        ? "failed"
        : latest.renderStatus === "complete"
          ? "complete"
          : "incomplete";
    const status = !latest
      ? "unavailable"
      : approved
        ? "approved"
        : published
          ? published.contentId === latest?.id &&
            sameEditorialPresentation(
              published.editorialSnapshot,
              item.editorial
            )
            ? "published"
            : "updated"
          : "review";
    return {
      ...item,
      editorial: item.editorial ?? defaultEditorial(),
      latest,
      publishedVersion: published
        ? (contents.find(c => c.id === published.contentId)?.versionNo ?? null)
        : null,
      status,
      quality,
      published: !!published,
    };
  });
  const counts = {
    review: rows.filter(r => r.status === "review" && r.latest).length,
    approved: rows.filter(r => r.status === "approved").length,
    published: rows.filter(r => r.published).length,
    updated: rows.filter(r => r.status === "updated").length,
    issue: rows.filter(r => r.quality !== "complete").length,
  };
  const filtered = rows.filter(
    r =>
      (input.category === "all" || r.editorial.category === input.category) &&
      (input.topic === "all" || r.editorial.topic === input.topic) &&
      (input.quality === "all" || r.quality === input.quality) &&
      (input.status === "all" ||
        (input.status === "issue"
          ? r.quality !== "complete"
          : input.status === "published"
            ? r.published
            : r.status === input.status &&
              (input.status !== "review" || !!r.latest))) &&
      r.title
        .toLocaleLowerCase()
        .includes(input.query.trim().toLocaleLowerCase())
  );
  filtered.sort(
    (a, b) =>
      Number(b.sourceUpdatedAt) - Number(a.sourceUpdatedAt) || b.id - a.id
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 30)),
    page = Math.min(input.page, pages);
  return {
    items: filtered.slice((page - 1) * 30, page * 30),
    total: filtered.length,
    pages,
    page,
    counts,
    reviewQueue: filtered
      .filter(r => r.latest && ["review", "updated"].includes(r.status))
      .map(r => r.id),
    topics: [
      ...new Set(rows.map(r => r.editorial.topic).filter(Boolean)),
    ].sort(),
  };
}
export async function saveEditorial(
  itemId: number,
  editorial: KnowledgeEditorial
) {
  const db = await knowledgeDb();
  if (editorial.reviewedContentId) {
    const [content] = await db
      .select()
      .from(knowledgeContents)
      .where(eq(knowledgeContents.id, editorial.reviewedContentId));
    if (
      !content ||
      content.itemId !== itemId ||
      content.ingestStatus !== "ready"
    )
      throw new Error("复核版本不属于当前文章");
  }
  await db
    .update(knowledgeItems)
    .set({ editorial })
    .where(eq(knowledgeItems.id, itemId));
  return { itemId };
}
