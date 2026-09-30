import { and, desc, eq, inArray, max } from "drizzle-orm";
import {
  contentPublications,
  knowledgeAssets,
  knowledgeContents,
  knowledgeItems,
  knowledgeSources,
} from "../../drizzle/schema";
import { knowledgeDb } from "./repository";

export type KnowledgeViewer = {
  userId: number;
  role: "admin" | "user";
  remoteAddress?: string | null;
  runtimeMode?: string;
};

/** The peer address comes from the socket, never Host or forwarded headers. */
export function isLocalDevelopmentPreview(
  remoteAddress?: string | null,
  runtimeMode = process.env.NODE_ENV
) {
  return (
    runtimeMode === "development" &&
    ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remoteAddress ?? "")
  );
}

function readableItem() {
  return and(
    eq(knowledgeSources.sourceAccessStatus, "accessible"),
    eq(knowledgeItems.sourceAccessStatus, "accessible"),
    inArray(knowledgeItems.kind, ["docx", "file", "sheet", "bitable"]),
    inArray(knowledgeItems.syncStatus, ["active", "content_failed"])
  );
}

export async function knowledgeListForViewer(viewer: KnowledgeViewer) {
  const db = await knowledgeDb();
  if (isLocalDevelopmentPreview(viewer.remoteAddress, viewer.runtimeMode)) {
    const latestReady = db
      .select({
        itemId: knowledgeContents.itemId,
        versionNo: max(knowledgeContents.versionNo).as("latestVersionNo"),
      })
      .from(knowledgeContents)
      .where(eq(knowledgeContents.ingestStatus, "ready"))
      .groupBy(knowledgeContents.itemId)
      .as("latestReady");
    const rows = await db
      .select({
        itemId: knowledgeItems.id,
        title: knowledgeContents.titleSnapshot,
        summary: knowledgeContents.summary,
        kind: knowledgeItems.kind,
        sourceName: knowledgeSources.name,
        contentId: knowledgeContents.id,
        editorial: knowledgeItems.editorial,
        parentItemId: knowledgeItems.parentItemId,
        sourceUrl: knowledgeItems.sourceUrl,
        sourceUpdatedAt: knowledgeItems.sourceUpdatedAt,
        renderStatus: knowledgeContents.renderStatus,
      })
      .from(knowledgeContents)
      .innerJoin(
        latestReady,
        and(
          eq(latestReady.itemId, knowledgeContents.itemId),
          eq(latestReady.versionNo, knowledgeContents.versionNo)
        )
      )
      .innerJoin(
        knowledgeItems,
        eq(knowledgeContents.itemId, knowledgeItems.id)
      )
      .innerJoin(
        knowledgeSources,
        eq(knowledgeItems.sourceId, knowledgeSources.id)
      )
      .where(readableItem())
      .orderBy(desc(knowledgeItems.sourceUpdatedAt), desc(knowledgeItems.id));
    return rows.map(row => ({
      ...row,
      publicationId: null,
      publishedAt: null,
      isFeatured: 0,
      sortOrder: 0,
      visibility: "development_preview" as const,
    }));
  }

  const rows = await db
    .select({
      publicationId: contentPublications.id,
      itemId: knowledgeItems.id,
      title: knowledgeContents.titleSnapshot,
      summary: knowledgeContents.summary,
      kind: knowledgeItems.kind,
      sourceName: knowledgeSources.name,
      contentId: knowledgeContents.id,
      editorial: contentPublications.editorialSnapshot,
      parentItemId: knowledgeItems.parentItemId,
      sourceUrl: knowledgeItems.sourceUrl,
      sourceUpdatedAt: contentPublications.publishedAt,
      renderStatus: knowledgeContents.renderStatus,
      publishedAt: contentPublications.publishedAt,
      isFeatured: contentPublications.isFeatured,
      sortOrder: contentPublications.sortOrder,
    })
    .from(contentPublications)
    .innerJoin(
      knowledgeContents,
      eq(contentPublications.contentId, knowledgeContents.id)
    )
    .innerJoin(
      knowledgeItems,
      eq(contentPublications.itemId, knowledgeItems.id)
    )
    .innerJoin(
      knowledgeSources,
      eq(knowledgeItems.sourceId, knowledgeSources.id)
    )
    .where(
      and(
        eq(contentPublications.status, "published"),
        eq(contentPublications.channel, "knowledge_cases"),
        eq(contentPublications.audienceType, "authenticated_users"),
        eq(knowledgeContents.ingestStatus, "ready"),
        readableItem()
      )
    )
    .orderBy(
      desc(contentPublications.isFeatured),
      desc(contentPublications.publishedAt)
    );
  return rows.map(row => ({ ...row, visibility: "published" as const }));
}

export async function knowledgeDetailForViewer(
  viewer: KnowledgeViewer,
  itemId: number
) {
  const db = await knowledgeDb();
  if (isLocalDevelopmentPreview(viewer.remoteAddress, viewer.runtimeMode)) {
    const [row] = await db
      .select({
        content: knowledgeContents,
        item: knowledgeItems,
        source: knowledgeSources,
      })
      .from(knowledgeContents)
      .innerJoin(
        knowledgeItems,
        eq(knowledgeContents.itemId, knowledgeItems.id)
      )
      .innerJoin(
        knowledgeSources,
        eq(knowledgeItems.sourceId, knowledgeSources.id)
      )
      .where(
        and(
          eq(knowledgeItems.id, itemId),
          eq(knowledgeContents.ingestStatus, "ready"),
          readableItem()
        )
      )
      .orderBy(desc(knowledgeContents.versionNo))
      .limit(1);
    return row
      ? {
          ...row,
          publication: null,
          visibility: "development_preview" as const,
        }
      : null;
  }

  const [row] = await db
    .select({
      publication: contentPublications,
      content: knowledgeContents,
      item: knowledgeItems,
      source: knowledgeSources,
    })
    .from(contentPublications)
    .innerJoin(
      knowledgeContents,
      eq(contentPublications.contentId, knowledgeContents.id)
    )
    .innerJoin(
      knowledgeItems,
      eq(contentPublications.itemId, knowledgeItems.id)
    )
    .innerJoin(
      knowledgeSources,
      eq(knowledgeItems.sourceId, knowledgeSources.id)
    )
    .where(
      and(
        eq(contentPublications.itemId, itemId),
        eq(contentPublications.status, "published"),
        eq(contentPublications.channel, "knowledge_cases"),
        eq(contentPublications.audienceType, "authenticated_users"),
        eq(knowledgeContents.ingestStatus, "ready"),
        readableItem()
      )
    )
    .limit(1);
  return row ? { ...row, visibility: "published" as const } : null;
}

export async function canAccessAsset(
  viewer: KnowledgeViewer,
  assetId: number,
  mode: "viewer" | "admin_preview" = "viewer"
) {
  const db = await knowledgeDb();
  const [asset] = await db
    .select({ asset: knowledgeAssets, content: knowledgeContents })
    .from(knowledgeAssets)
    .innerJoin(
      knowledgeContents,
      eq(knowledgeAssets.contentId, knowledgeContents.id)
    )
    .where(eq(knowledgeAssets.id, assetId))
    .limit(1);
  if (!asset || asset.content.ingestStatus !== "ready") return null;
  if (mode === "admin_preview")
    return viewer.role === "admin"
      ? { ...asset.asset, publicationId: -1 }
      : null;
  const detail = await knowledgeDetailForViewer(viewer, asset.content.itemId);
  return detail?.content.id === asset.content.id
    ? { ...asset.asset, publicationId: detail.publication?.id ?? 0 }
    : null;
}
