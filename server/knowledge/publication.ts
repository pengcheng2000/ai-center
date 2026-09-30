import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { and, desc, eq } from "drizzle-orm";
import {
  contentPublications,
  knowledgeAssets,
  knowledgeContents,
  knowledgeItems,
  knowledgeSources,
  knowledgeSyncRuns,
} from "../../drizzle/schema";
import { knowledgeDb } from "./repository";
import { knowledgeFilePath } from "./storage";

export class KnowledgePublicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgePublicationError";
  }
}

export function activeSlotKey(
  itemId: number,
  channel: string,
  destinationKey: string
) {
  return createHash("sha256")
    .update(JSON.stringify([itemId, channel, destinationKey]))
    .digest("hex");
}

async function assertEligible(
  db: Awaited<ReturnType<typeof knowledgeDb>>,
  contentId: number,
  allowIncomplete: boolean
) {
  const [row] = await db
    .select({
      content: knowledgeContents,
      item: knowledgeItems,
      source: knowledgeSources,
      run: knowledgeSyncRuns,
    })
    .from(knowledgeContents)
    .innerJoin(knowledgeItems, eq(knowledgeContents.itemId, knowledgeItems.id))
    .innerJoin(
      knowledgeSources,
      eq(knowledgeItems.sourceId, knowledgeSources.id)
    )
    .innerJoin(
      knowledgeSyncRuns,
      eq(knowledgeContents.sourceRunId, knowledgeSyncRuns.id)
    )
    .where(eq(knowledgeContents.id, contentId))
    .limit(1);
  if (!row) throw new KnowledgePublicationError("内容版本不存在");
  if (
    row.content.ingestStatus !== "ready" ||
    row.content.stagingPrefix ||
    !row.content.readyAt
  )
    throw new KnowledgePublicationError("内容正在入库，请等待同步完成");
  if (row.item.syncStatus !== "active")
    throw new KnowledgePublicationError("节点同步异常，请先检查来源与同步记录");
  if (
    row.source.sourceAccessStatus !== "accessible" ||
    row.item.sourceAccessStatus !== "accessible"
  )
    throw new KnowledgePublicationError("来源访问权限已失效，请检查飞书授权");
  if (
    !row.run.directoryTraversalComplete ||
    !["succeeded", "partial"].includes(row.run.status)
  )
    throw new KnowledgePublicationError(
      "当前版本所属同步尚未完成，请稍后再审核发布"
    );
  if (row.content.renderStatus === "preview_only")
    throw new KnowledgePublicationError(
      "该格式仅支持来源预览，不能发布为可读正文"
    );
  if (row.content.renderStatus === "incomplete" && !allowIncomplete)
    throw new KnowledgePublicationError("请核对缺失内容并确认仍适合发布");
  const assets = await db
    .select({
      storageKey: knowledgeAssets.storageKey,
      sizeBytes: knowledgeAssets.sizeBytes,
    })
    .from(knowledgeAssets)
    .where(eq(knowledgeAssets.contentId, contentId));
  if (
    !row.content.rawSnapshotStorageKey ||
    !(await stat(knowledgeFilePath(row.content.rawSnapshotStorageKey)).catch(
      () => null
    ))
  )
    throw new KnowledgePublicationError("原始快照未完成入库");
  if (
    row.content.structuredStorageKey &&
    !(await stat(knowledgeFilePath(row.content.structuredStorageKey)).catch(
      () => null
    ))
  )
    throw new KnowledgePublicationError("结构化内容未完成入库");
  for (const asset of assets) {
    const info = asset.storageKey
      ? await stat(knowledgeFilePath(asset.storageKey)).catch(() => null)
      : null;
    if (!info?.isFile() || info.size !== asset.sizeBytes)
      throw new KnowledgePublicationError("附件未完成入库");
  }
  return row;
}

export async function knowledgeApprovalIssue(
  contentId: number
): Promise<string | null> {
  try {
    await assertEligible(await knowledgeDb(), contentId, true);
    return null;
  } catch (error) {
    if (error instanceof KnowledgePublicationError) return error.message;
    throw error;
  }
}

export async function approveKnowledgeContent(input: {
  contentId: number;
  approvedBy: number;
  ownerConfirmedBy: string;
  allowIncomplete: boolean;
}) {
  const db = await knowledgeDb();
  const row = await assertEligible(db, input.contentId, input.allowIncomplete);
  if (
    !row.item.editorial?.included ||
    row.item.editorial.reviewedContentId !== input.contentId
  )
    throw new KnowledgePublicationError(
      "请先保存当前版本的栏目编目并确认内容复核，且勾选收录到学习中心"
    );
  if (!input.ownerConfirmedBy.trim())
    throw new KnowledgePublicationError("需填写确认共享范围的知识负责人");
  const [created] = await db
    .insert(contentPublications)
    .values({
      itemId: row.item.id,
      contentId: input.contentId,
      channel: "knowledge_cases",
      destinationKey: "default",
      audienceType: "authenticated_users",
      approvedBy: input.approvedBy,
      approvedAt: new Date(),
      ownerConfirmedBy: input.ownerConfirmedBy.trim(),
      ownerConfirmedAt: new Date(),
      editorialSnapshot: row.item.editorial,
    })
    .$returningId();
  return { publicationId: created.id };
}

export async function publishKnowledgeContent(
  publicationId: number,
  approvedBy: number
) {
  const db = await knowledgeDb();
  const [candidate] = await db
    .select()
    .from(contentPublications)
    .where(eq(contentPublications.id, publicationId))
    .limit(1);
  if (
    !candidate ||
    candidate.status !== "approved" ||
    candidate.audienceType !== "authenticated_users"
  )
    throw new KnowledgePublicationError("发布候选不存在或未完成审核");
  await assertEligible(db, candidate.contentId, true);
  return db.transaction(async tx => {
    const [item] = await tx
      .select()
      .from(knowledgeItems)
      .where(eq(knowledgeItems.id, candidate.itemId))
      .for("update");
    if (
      !item ||
      item.syncStatus !== "active" ||
      item.sourceAccessStatus !== "accessible"
    )
      throw new KnowledgePublicationError("知识节点不可发布");
    const [source] = await tx
      .select()
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, item.sourceId))
      .limit(1);
    if (source?.sourceAccessStatus !== "accessible")
      throw new KnowledgePublicationError("来源不可访问");
    const [fresh] = await tx
      .select()
      .from(contentPublications)
      .where(eq(contentPublications.id, publicationId))
      .limit(1);
    if (fresh?.status !== "approved")
      throw new KnowledgePublicationError("候选状态已变化");
    const slot = activeSlotKey(
      candidate.itemId,
      candidate.channel,
      candidate.destinationKey
    );
    const [old] = await tx
      .select()
      .from(contentPublications)
      .where(
        and(
          eq(contentPublications.activeSlotKey, slot),
          eq(contentPublications.status, "published")
        )
      )
      .limit(1);
    if (old)
      await tx
        .update(contentPublications)
        .set({
          status: "withdrawn",
          activeSlotKey: null,
          withdrawnAt: new Date(),
          withdrawnBy: approvedBy,
          withdrawReason: "superseded",
        })
        .where(eq(contentPublications.id, old.id));
    await tx
      .update(contentPublications)
      .set({
        status: "published",
        publishedAt: new Date(),
        activeSlotKey: slot,
        supersedesPublicationId: old?.id ?? null,
      })
      .where(eq(contentPublications.id, publicationId));
    return { publicationId, supersedesPublicationId: old?.id ?? null };
  });
}

export async function withdrawKnowledgePublication(
  publicationId: number,
  withdrawnBy: number
) {
  const db = await knowledgeDb();
  const [publication] = await db
    .select()
    .from(contentPublications)
    .where(eq(contentPublications.id, publicationId))
    .limit(1);
  if (!publication || publication.status === "withdrawn")
    throw new KnowledgePublicationError("发布记录不存在或已撤回");
  await db
    .update(contentPublications)
    .set({
      status: "withdrawn",
      activeSlotKey: null,
      withdrawnBy,
      withdrawnAt: new Date(),
      withdrawReason:
        publication.status === "approved" ? "cancelled" : "manual",
    })
    .where(eq(contentPublications.id, publicationId));
  return { publicationId };
}
