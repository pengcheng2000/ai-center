import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import {
  contentPublications,
  knowledgeAssets,
  knowledgeContents,
  knowledgeItems,
  knowledgeSources,
  knowledgeSyncRuns,
} from "../../../drizzle/schema";
import { resolveStoragePath } from "../../storage";
import { FeishuClient, FeishuError } from "../feishu/client";
import { readBitable } from "../feishu/bitableReader";
import { readDocxBlocks } from "../feishu/docxReader";
import {
  fileMime,
  readFeishuFile,
  readFeishuImage,
  readFeishuAttachment,
} from "../feishu/fileReader";
import {
  normalizeDocx,
  normalizeFile,
  normalizeStructured,
} from "../feishu/normalizer";
import { readSheet } from "../feishu/sheetReader";
import { readWikiDirectory, type WikiNode } from "../feishu/wikiReader";
import { knowledgeDb } from "../repository";
import {
  assetConcurrency,
  discardStaged,
  finalizeStaged,
  RunStorageBudget,
  stageBytes,
  stageResponse,
  StorageLimitError,
  type StagedFile,
} from "../storage";
import {
  NORMALIZER_VERSION,
  sha256,
  type AssetRequest,
  type NormalizedContent,
} from "../types";

type Db = Awaited<ReturnType<typeof knowledgeDb>>;
type RunCounts = {
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  unsupported: number;
  assetLimit: number;
};
type RunFailure = { externalId: string; stage: string; code: string };
const LEASE_MS = 15 * 60 * 1000;
const tasks = new Map<number, Promise<void>>();

export class KnowledgeSyncBusy extends Error {}

export async function startKnowledgeSync(
  sourceId: number,
  trigger: "manual" | "scheduled",
  retryMissing = false
) {
  const db = await knowledgeDb();
  const lease = randomUUID();
  const runId = await db.transaction(async tx => {
    const [source] = await tx
      .select()
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, sourceId))
      .for("update");
    if (!source || !source.isEnabled)
      throw new Error("Knowledge Source 不存在或已停用");
    if (source.leaseExpiresAt && source.leaseExpiresAt > new Date())
      throw new KnowledgeSyncBusy("该来源正在同步");
    await tx
      .update(knowledgeSources)
      .set({
        leaseToken: lease,
        leaseExpiresAt: new Date(Date.now() + LEASE_MS),
      })
      .where(eq(knowledgeSources.id, sourceId));
    const [created] = await tx
      .insert(knowledgeSyncRuns)
      .values({ sourceId, trigger, leaseToken: lease, failures: [] })
      .$returningId();
    return created.id;
  });
  const task = executeRun(db, sourceId, runId, lease, retryMissing)
    .catch(() => {
      console.warn(`[Knowledge] 同步运行 ${runId} 未能完成状态记录`);
    })
    .finally(() => tasks.delete(runId));
  tasks.set(runId, task);
  return { runId };
}

function failure(error: unknown, externalId: string): RunFailure {
  if (error instanceof FeishuError)
    return {
      externalId,
      stage: error.stage,
      code: String(error.apiCode ?? error.httpStatus ?? "network"),
    };
  if (error instanceof StorageLimitError)
    return { externalId, stage: "storage", code: error.reason };
  return { externalId, stage: "internal", code: "failed" };
}

function permissionDenied(error: unknown) {
  return (
    error instanceof FeishuError &&
    error.stage !== "image_download" &&
    (error.httpStatus === 403 ||
      [131006, 1770032].includes(error.apiCode ?? -1))
  );
}

async function updateFailures(db: Db, runId: number, failures: RunFailure[]) {
  await db
    .update(knowledgeSyncRuns)
    .set({ failures: failures.slice(0, 500) })
    .where(eq(knowledgeSyncRuns.id, runId));
}

async function assertLease(db: Db, sourceId: number, lease: string) {
  const [source] = await db
    .select({
      leaseToken: knowledgeSources.leaseToken,
      leaseExpiresAt: knowledgeSources.leaseExpiresAt,
    })
    .from(knowledgeSources)
    .where(eq(knowledgeSources.id, sourceId))
    .limit(1);
  if (
    source?.leaseToken !== lease ||
    !source.leaseExpiresAt ||
    source.leaseExpiresAt < new Date()
  )
    throw new KnowledgeSyncBusy("同步租约失效");
}

async function recordDirectory(
  db: Db,
  sourceId: number,
  runId: number,
  lease: string,
  nodes: WikiNode[]
) {
  await assertLease(db, sourceId, lease);
  const idByToken = new Map<string, number>();
  for (const node of nodes) {
    const supported = ["docx", "file", "sheet", "bitable"].includes(
      node.objType
    );
    const kind =
      node.nodeType === "shortcut"
        ? "shortcut"
        : supported
          ? (node.objType as "docx" | "file" | "sheet" | "bitable")
          : "other";
    await db
      .insert(knowledgeItems)
      .values({
        sourceId,
        externalId: node.nodeToken,
        kind,
        objType: node.objType,
        objToken: node.objToken,
        title: node.title,
        authorName: node.authorName,
        originSpaceId: node.originSpaceId,
        originNodeToken: node.originNodeToken,
        originObjToken: node.originObjToken,
        sourceUrl: `https://www.feishu.cn/wiki/${node.nodeToken}`,
        sourceUpdatedAt: node.sourceUpdatedAt,
        lastSeenRunId: runId,
        syncStatus:
          kind === "shortcut" || kind === "other" ? "unsupported" : "active",
      })
      .onDuplicateKeyUpdate({
        set: {
          kind,
          objType: node.objType,
          objToken: node.objToken,
          title: node.title,
          authorName: node.authorName,
          originSpaceId: node.originSpaceId,
          originNodeToken: node.originNodeToken,
          originObjToken: node.originObjToken,
          sourceUpdatedAt: node.sourceUpdatedAt,
          lastSeenRunId: runId,
          ...(kind === "shortcut" || kind === "other"
            ? { syncStatus: "unsupported" as const }
            : {}),
        },
      });
    const [item] = await db
      .select({ id: knowledgeItems.id })
      .from(knowledgeItems)
      .where(
        and(
          eq(knowledgeItems.sourceId, sourceId),
          eq(knowledgeItems.externalId, node.nodeToken)
        )
      )
      .limit(1);
    idByToken.set(node.nodeToken, item.id);
  }
  for (const node of nodes) {
    const id = idByToken.get(node.nodeToken)!;
    const parentId = node.parentNodeToken
      ? (idByToken.get(node.parentNodeToken) ?? null)
      : null;
    await db
      .update(knowledgeItems)
      .set({ parentItemId: parentId })
      .where(eq(knowledgeItems.id, id));
  }
  await db
    .update(knowledgeSyncRuns)
    .set({
      directoryTraversalComplete: 1,
      discoveredCount: nodes.length,
    })
    .where(eq(knowledgeSyncRuns.id, runId));
  await db
    .update(knowledgeSources)
    .set({ lastDirectorySyncAt: new Date(), sourceAccessStatus: "accessible" })
    .where(eq(knowledgeSources.id, sourceId));
  return idByToken;
}

export async function reconcileMissing(
  db: Db,
  sourceId: number,
  runId: number,
  lease: string
) {
  return db.transaction(async tx => {
    const [source] = await tx
      .select({ leaseToken: knowledgeSources.leaseToken })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, sourceId))
      .for("update");
    if (source?.leaseToken !== lease)
      throw new KnowledgeSyncBusy("同步租约失效");
    const [run] = await tx
      .select({
        directoryTraversalComplete:
          knowledgeSyncRuns.directoryTraversalComplete,
      })
      .from(knowledgeSyncRuns)
      .where(
        and(
          eq(knowledgeSyncRuns.id, runId),
          eq(knowledgeSyncRuns.sourceId, sourceId)
        )
      )
      .limit(1);
    if (!run?.directoryTraversalComplete)
      throw new Error("目录遍历未完成，禁止 missing reconciliation");
    const missing = await tx
      .select({ id: knowledgeItems.id })
      .from(knowledgeItems)
      .where(
        and(
          eq(knowledgeItems.sourceId, sourceId),
          or(
            isNull(knowledgeItems.lastSeenRunId),
            ne(knowledgeItems.lastSeenRunId, runId)
          )
        )
      );
    const ids = missing.map(item => item.id);
    if (ids.length) {
      await tx
        .update(knowledgeItems)
        .set({ syncStatus: "missing" })
        .where(inArray(knowledgeItems.id, ids));
      await tx
        .update(contentPublications)
        .set({
          status: "withdrawn",
          activeSlotKey: null,
          withdrawnAt: new Date(),
          withdrawReason: "source_missing",
          withdrawnBy: null,
        })
        .where(
          and(
            inArray(contentPublications.itemId, ids),
            eq(contentPublications.status, "published")
          )
        );
    }
    await tx
      .update(knowledgeSyncRuns)
      .set({ reconciliationComplete: 1, missingCount: ids.length })
      .where(eq(knowledgeSyncRuns.id, runId));
    return ids.length;
  });
}

async function sourceAccessLost(db: Db, sourceId: number) {
  const ids = (
    await db
      .select({ id: knowledgeItems.id })
      .from(knowledgeItems)
      .where(eq(knowledgeItems.sourceId, sourceId))
  ).map(row => row.id);
  await db.transaction(async tx => {
    await tx
      .update(knowledgeSources)
      .set({ sourceAccessStatus: "access_lost" })
      .where(eq(knowledgeSources.id, sourceId));
    if (ids.length)
      await tx
        .update(contentPublications)
        .set({
          status: "withdrawn",
          activeSlotKey: null,
          withdrawnAt: new Date(),
          withdrawReason: "access_lost",
          withdrawnBy: null,
        })
        .where(
          and(
            inArray(contentPublications.itemId, ids),
            eq(contentPublications.status, "published")
          )
        );
  });
}

async function itemAccessLost(db: Db, itemId: number) {
  await db.transaction(async tx => {
    await tx
      .update(knowledgeItems)
      .set({
        sourceAccessStatus: "access_lost",
        syncStatus: "content_failed",
        lastContentErrorCode: "403",
      })
      .where(eq(knowledgeItems.id, itemId));
    await tx
      .update(contentPublications)
      .set({
        status: "withdrawn",
        activeSlotKey: null,
        withdrawnAt: new Date(),
        withdrawReason: "access_lost",
        withdrawnBy: null,
      })
      .where(
        and(
          eq(contentPublications.itemId, itemId),
          eq(contentPublications.status, "published")
        )
      );
  });
}

export async function stageAssets(
  client: FeishuClient,
  requests: AssetRequest[],
  runId: number,
  externalId: string,
  budget: RunStorageBudget
) {
  const result: Array<{ request: AssetRequest; file: StagedFile }> = [];
  const missing: Record<string, number> = {};
  const reserve = Math.min(16 * 1024 * 1024, budget.maxRunBytes / 16);
  for (let start = 0; start < requests.length; start += assetConcurrency) {
    const batch = requests.slice(start, start + assetConcurrency);
    const settled = await Promise.allSettled(
      batch.map(async request => {
        if (budget.usedBytes >= budget.maxRunBytes - reserve)
          throw new StorageLimitError("run");
        const response =
          request.kind === "inline_image"
            ? await readFeishuImage(client, request.token)
            : await readFeishuAttachment(client, request.token);
        const length = Number(response.headers.get("content-length"));
        if (
          length > budget.maxSingleBytes ||
          length > budget.maxRunBytes - budget.usedBytes - reserve
        ) {
          await response.body?.cancel();
          throw new StorageLimitError(
            length > budget.maxSingleBytes ? "single" : "run"
          );
        }
        const mime =
          response.headers.get("content-type")?.split(";")[0] ||
          request.mimeType;
        return {
          request,
          file: await stageResponse(
            runId,
            externalId,
            request.assetRef,
            response,
            mime,
            budget
          ),
        };
      })
    );
    for (let i = 0; i < settled.length; i++) {
      const entry = settled[i];
      if (entry.status !== "rejected") continue;
      if (
        entry.reason instanceof StorageLimitError &&
        ["free_space", "not_writable"].includes(entry.reason.reason)
      )
        throw entry.reason;
      // Optional embedded assets must not discard a successfully read document.
      const key =
        batch[i].kind === "inline_image"
          ? "missing_image"
          : "missing_attachment";
      missing[key] = (missing[key] ?? 0) + 1;
      if (entry.reason instanceof StorageLimitError)
        missing.asset_budget = (missing.asset_budget ?? 0) + 1;
    }
    result.push(
      ...settled
        .filter(
          (
            item
          ): item is PromiseFulfilledResult<{
            request: AssetRequest;
            file: StagedFile;
          }> => item.status === "fulfilled"
        )
        .map(item => item.value)
    );
  }
  return { assets: result, missing };
}

async function versionFilesAvailable(
  db: Db,
  content: typeof knowledgeContents.$inferSelect
) {
  if (
    !content.rawSnapshotStorageKey ||
    !(await stat(resolveStoragePath(content.rawSnapshotStorageKey)).catch(
      () => null
    ))
  )
    return false;
  if (
    content.structuredStorageKey &&
    !(await stat(resolveStoragePath(content.structuredStorageKey)).catch(
      () => null
    ))
  )
    return false;
  const assets = await db
    .select({
      storageKey: knowledgeAssets.storageKey,
      sizeBytes: knowledgeAssets.sizeBytes,
    })
    .from(knowledgeAssets)
    .where(eq(knowledgeAssets.contentId, content.id));
  for (const asset of assets) {
    const info = await stat(resolveStoragePath(asset.storageKey)).catch(
      () => null
    );
    if (!info?.isFile() || info.size !== asset.sizeBytes) return false;
  }
  return true;
}

async function rebuildFromSnapshot(
  db: Db,
  node: WikiNode,
  itemId: number,
  sourceId: number,
  runId: number,
  lease: string,
  previous: typeof knowledgeContents.$inferSelect,
  budget: RunStorageBudget,
  client: FeishuClient,
  retryMissing: boolean
): Promise<NormalizedContent["renderStatus"] | "unchanged" | null> {
  if (
    !previous.rawSnapshotStorageKey ||
    !node.sourceUpdatedAt ||
    previous.sourceRevision !== node.sourceUpdatedAt.toISOString() ||
    previous.titleSnapshot !== node.title
  )
    return null;
  const rawPath = resolveStoragePath(previous.rawSnapshotStorageKey);
  if (!(await stat(rawPath).catch(() => null))) return null;
  let normalized: NormalizedContent;
  try {
    if (node.objType === "docx")
      normalized = normalizeDocx(
        node.title,
        JSON.parse(await readFile(rawPath, "utf8")) as Record<string, unknown>[]
      );
    else if (node.objType === "sheet" || node.objType === "bitable")
      normalized = normalizeStructured(
        node.title,
        JSON.parse(await readFile(rawPath, "utf8")) as Record<string, unknown>,
        node.objType
      );
    else if (node.objType === "file")
      normalized = normalizeFile(
        node.title,
        fileMime(node.title) === "application/pdf"
          ? new Uint8Array()
          : await readFile(rawPath)
      );
    else return null;
  } catch {
    return null;
  }
  let rebuiltStructured: StagedFile | undefined;
  const previousAssets = await db
    .select()
    .from(knowledgeAssets)
    .where(eq(knowledgeAssets.contentId, previous.id));
  const reusable = normalized.assets.map(request =>
    previousAssets.find(
      asset =>
        asset.assetRef === request.assetRef &&
        asset.externalToken === request.token
    )
  );
  const fileAssets = previousAssets.filter(
    asset => asset.kind === "primary_file"
  );
  if (node.objType === "file" && fileAssets.length !== 1) return null;
  for (const asset of previousAssets) {
    const info = await stat(resolveStoragePath(asset.storageKey)).catch(
      () => null
    );
    if (!info?.isFile() || info.size !== asset.sizeBytes) return null;
  }
  const orderedAssets: Array<
    Omit<typeof knowledgeAssets.$inferSelect, "id" | "contentId" | "createdAt">
  > = [
    ...reusable.filter(
      (asset): asset is typeof knowledgeAssets.$inferSelect => !!asset
    ),
    ...fileAssets,
  ];
  const missingRequests = normalized.assets.filter(
    (_, index) => !reusable[index]
  );
  const knownMissing = !!(
    previous.unsupportedSummary?.missing_image ||
    previous.unsupportedSummary?.missing_attachment
  );
  const extra =
    !retryMissing && knownMissing
      ? {
          assets: [] as Array<{ request: AssetRequest; file: StagedFile }>,
          missing: missingRequests.reduce<Record<string, number>>(
            (counts, request) => {
              const key =
                request.kind === "inline_image"
                  ? "missing_image"
                  : "missing_attachment";
              counts[key] = (counts[key] ?? 0) + 1;
              return counts;
            },
            previous.unsupportedSummary?.asset_budget
              ? { asset_budget: previous.unsupportedSummary.asset_budget }
              : {}
          ),
        }
      : await stageAssets(
          client,
          missingRequests,
          runId,
          node.nodeToken,
          budget
        );
  if (extra.assets.length) {
    await finalizeStaged(extra.assets.map(a => a.file));
    orderedAssets.push(
      ...extra.assets.map(({ request, file }) => ({
        assetRef: request.assetRef,
        kind: request.kind,
        externalToken: request.token,
        fileName: request.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256,
        storageKey: file.finalKey,
        metadata: null,
      }))
    );
  }
  if (Object.keys(extra.missing).length) {
    normalized.renderStatus = "incomplete";
    Object.assign(normalized.unsupportedSummary, extra.missing);
    const available = new Set(orderedAssets.map(a => a.assetRef));
    normalized.bodyMarkdown = normalized.bodyMarkdown?.replace(
      /!?\[[^\]]*\]\(knowledge-asset:([a-zA-Z0-9_-]+)\)/g,
      (match, ref: string) => (available.has(ref) ? match : "")
    );
  }
  if (normalized.structuredStorageData) {
    rebuiltStructured = await stageBytes(
      runId,
      node.nodeToken,
      "structured",
      normalized.structuredStorageData,
      "application/json",
      budget
    );
    await finalizeStaged([rebuiltStructured]);
  }
  const contentHash = sha256(
    JSON.stringify({
      title: normalized.title,
      format: normalized.format,
      markdown: normalized.bodyMarkdown,
      html: normalized.bodyHtml,
      structured: normalized.structuredData ?? normalized.structuredStorageData,
      assets: orderedAssets.map(asset => [asset.assetRef, asset.sha256]),
    })
  );
  if (
    previous.normalizerVersion === NORMALIZER_VERSION &&
    previous.contentHash === contentHash &&
    JSON.stringify(previous.unsupportedSummary) ===
      JSON.stringify(normalized.unsupportedSummary)
  )
    return "unchanged";
  await db.transaction(async tx => {
    const [item] = await tx
      .select({ id: knowledgeItems.id })
      .from(knowledgeItems)
      .where(eq(knowledgeItems.id, itemId))
      .for("update");
    const [source] = await tx
      .select({ leaseToken: knowledgeSources.leaseToken })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, sourceId));
    if (!item || source?.leaseToken !== lease)
      throw new KnowledgeSyncBusy("同步租约失效");
    const [last] = await tx
      .select({ versionNo: knowledgeContents.versionNo })
      .from(knowledgeContents)
      .where(eq(knowledgeContents.itemId, itemId))
      .orderBy(desc(knowledgeContents.versionNo))
      .limit(1);
    const [inserted] = await tx
      .insert(knowledgeContents)
      .values({
        itemId,
        sourceRunId: runId,
        versionNo: (last?.versionNo ?? 0) + 1,
        ingestStatus: "ready",
        readyAt: new Date(),
        format: normalized.format,
        titleSnapshot: normalized.title,
        summary: normalized.summary,
        bodyMarkdown: normalized.bodyMarkdown,
        bodyHtml: normalized.bodyHtml,
        structuredData: normalized.structuredData,
        structuredStorageKey: rebuiltStructured?.finalKey ?? null,
        structuredSchema: normalized.structuredSchema,
        structuredPreview: normalized.structuredPreview,
        rowCount: normalized.rowCount,
        columnCount: normalized.columnCount,
        contentHash,
        rawHash: previous.rawHash,
        normalizerVersion: NORMALIZER_VERSION,
        sourceRevision: previous.sourceRevision,
        rawSnapshotStorageKey: previous.rawSnapshotStorageKey,
        renderStatus: normalized.renderStatus,
        unsupportedSummary: normalized.unsupportedSummary,
        locatorMap: normalized.locatorMap,
        locatorTruncated: normalized.locatorTruncated ? 1 : 0,
      })
      .$returningId();
    if (orderedAssets.length)
      await tx.insert(knowledgeAssets).values(
        orderedAssets.map(asset => ({
          contentId: inserted.id,
          assetRef: asset.assetRef,
          kind: asset.kind,
          externalToken: asset.externalToken,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
          sha256: asset.sha256,
          storageKey: asset.storageKey,
          metadata: asset.metadata,
        }))
      );
    await tx
      .update(knowledgeItems)
      .set({
        syncStatus: "active",
        sourceAccessStatus: "accessible",
        syncedAt: new Date(),
        lastContentErrorCode: null,
      })
      .where(eq(knowledgeItems.id, itemId));
  });
  return normalized.renderStatus;
}

async function processNode(
  db: Db,
  client: FeishuClient,
  sourceId: number,
  runId: number,
  lease: string,
  node: WikiNode,
  itemId: number,
  budget: RunStorageBudget,
  retryMissing: boolean
): Promise<{
  status: "created" | "updated" | "unchanged";
  incomplete: boolean;
}> {
  await assertLease(db, sourceId, lease);
  const [existing] = await db
    .select()
    .from(knowledgeContents)
    .where(
      and(
        eq(knowledgeContents.itemId, itemId),
        eq(knowledgeContents.ingestStatus, "ready")
      )
    )
    .orderBy(desc(knowledgeContents.versionNo))
    .limit(1);
  const [itemBefore] = await db
    .select({
      syncStatus: knowledgeItems.syncStatus,
      sourceAccessStatus: knowledgeItems.sourceAccessStatus,
    })
    .from(knowledgeItems)
    .where(eq(knowledgeItems.id, itemId))
    .limit(1);
  // A stable source revision lets a full directory traversal avoid downloading unchanged assets again.
  if (
    node.sourceUpdatedAt &&
    existing?.sourceRevision === node.sourceUpdatedAt.toISOString() &&
    existing.titleSnapshot === node.title &&
    existing.normalizerVersion === NORMALIZER_VERSION &&
    !(
      retryMissing &&
      (existing.unsupportedSummary?.missing_image ||
        existing.unsupportedSummary?.missing_attachment)
    ) &&
    itemBefore?.syncStatus === "active" &&
    itemBefore.sourceAccessStatus === "accessible" &&
    (await versionFilesAvailable(db, existing))
  ) {
    await db
      .update(knowledgeItems)
      .set({ syncedAt: new Date(), lastContentErrorCode: null })
      .where(eq(knowledgeItems.id, itemId));
    return {
      status: "unchanged",
      incomplete: existing.renderStatus !== "complete",
    };
  }
  if (
    existing &&
    (existing.normalizerVersion !== NORMALIZER_VERSION || retryMissing)
  ) {
    const rebuilt = await rebuildFromSnapshot(
      db,
      node,
      itemId,
      sourceId,
      runId,
      lease,
      existing,
      budget,
      client,
      retryMissing
    );
    if (rebuilt)
      return {
        status: rebuilt === "unchanged" ? "unchanged" : "updated",
        incomplete:
          rebuilt === "unchanged"
            ? existing.renderStatus !== "complete"
            : rebuilt !== "complete",
      };
  }
  let normalized: NormalizedContent;
  let rawFile: StagedFile;
  let structuredFile: StagedFile | undefined;
  let primaryFile: StagedFile | undefined;
  const staged: StagedFile[] = [];
  let stagingCommitted = false;
  try {
    if (node.objType === "docx") {
      normalized = normalizeDocx(
        node.title,
        (await readDocxBlocks(client, node.objToken)).blocks
      );
      rawFile = await stageBytes(
        runId,
        node.nodeToken,
        "raw",
        normalized.rawSnapshot,
        "application/json",
        budget
      );
      staged.push(rawFile);
    } else if (node.objType === "sheet" || node.objType === "bitable") {
      const raw =
        node.objType === "sheet"
          ? await readSheet(client, node.objToken)
          : await readBitable(client, node.objToken);
      normalized = normalizeStructured(
        node.title,
        raw as Record<string, unknown>,
        node.objType
      );
      rawFile = await stageBytes(
        runId,
        node.nodeToken,
        "raw",
        normalized.rawSnapshot,
        "application/json",
        budget
      );
      staged.push(rawFile);
      if (normalized.structuredStorageData) {
        structuredFile = await stageBytes(
          runId,
          node.nodeToken,
          "structured",
          normalized.structuredStorageData,
          "application/json",
          budget
        );
        staged.push(structuredFile);
      }
    } else if (node.objType === "file") {
      const mime = fileMime(node.title);
      primaryFile = await stageResponse(
        runId,
        node.nodeToken,
        "primary",
        await readFeishuFile(client, node.objToken),
        mime,
        budget
      );
      staged.push(primaryFile);
      normalized = normalizeFile(
        node.title,
        mime === "application/pdf"
          ? new Uint8Array()
          : await readFile(resolveStoragePath(primaryFile.tempKey))
      );
      rawFile = primaryFile;
    } else throw new Error("Unsupported Wiki object type");
    const assetResult = await stageAssets(
      client,
      normalized.assets,
      runId,
      node.nodeToken,
      budget
    );
    const assets = assetResult.assets;
    if (Object.keys(assetResult.missing).length) {
      normalized.renderStatus = "incomplete";
      Object.assign(normalized.unsupportedSummary, assetResult.missing);
      const available = new Set(assets.map(a => a.request.assetRef));
      normalized.bodyMarkdown = normalized.bodyMarkdown?.replace(
        /!?\[[^\]]*\]\(knowledge-asset:([a-zA-Z0-9_-]+)\)/g,
        (match, ref: string) => (available.has(ref) ? match : "")
      );
    }
    staged.push(...assets.map(item => item.file));
    const assetRows: Array<{
      assetRef: string;
      kind: "inline_image" | "attachment" | "primary_file";
      externalToken: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      sha256: string;
      storageKey: string;
    }> = assets.map(({ request, file }) => ({
      assetRef: request.assetRef,
      kind: request.kind,
      externalToken: request.token,
      fileName: request.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
      storageKey: file.finalKey,
    }));
    if (primaryFile)
      assetRows.push({
        assetRef: "primary",
        kind: "primary_file",
        externalToken: node.objToken,
        fileName: node.title,
        mimeType: primaryFile.mimeType,
        sizeBytes: primaryFile.sizeBytes,
        sha256: primaryFile.sha256,
        storageKey: primaryFile.finalKey,
      });
    const contentHash = sha256(
      JSON.stringify({
        title: normalized.title,
        format: normalized.format,
        markdown: normalized.bodyMarkdown,
        html: normalized.bodyHtml,
        structured:
          normalized.structuredData ?? normalized.structuredStorageData,
        assets: assetRows.map(asset => [asset.assetRef, asset.sha256]),
      })
    );
    const latest = await db
      .select()
      .from(knowledgeContents)
      .where(
        and(
          eq(knowledgeContents.itemId, itemId),
          eq(knowledgeContents.ingestStatus, "ready")
        )
      )
      .orderBy(desc(knowledgeContents.versionNo))
      .limit(1);
    if (
      latest[0]?.contentHash === contentHash &&
      latest[0].rawHash === rawFile.sha256 &&
      latest[0].normalizerVersion === NORMALIZER_VERSION &&
      (await versionFilesAvailable(db, latest[0]))
    ) {
      await discardStaged(runId, node.nodeToken);
      await db
        .update(knowledgeItems)
        .set({
          syncStatus: "active",
          sourceAccessStatus: "accessible",
          syncedAt: new Date(),
          lastContentErrorCode: null,
        })
        .where(eq(knowledgeItems.id, itemId));
      return {
        status: "unchanged",
        incomplete: latest[0].renderStatus !== "complete",
      };
    }
    const result = await db.transaction(async tx => {
      const [item] = await tx
        .select({ id: knowledgeItems.id })
        .from(knowledgeItems)
        .where(eq(knowledgeItems.id, itemId))
        .for("update");
      if (!item) throw new Error("Knowledge Item disappeared");
      const [source] = await tx
        .select({ leaseToken: knowledgeSources.leaseToken })
        .from(knowledgeSources)
        .where(eq(knowledgeSources.id, sourceId));
      if (source?.leaseToken !== lease)
        throw new KnowledgeSyncBusy("同步租约失效");
      const [last] = await tx
        .select({ versionNo: knowledgeContents.versionNo })
        .from(knowledgeContents)
        .where(eq(knowledgeContents.itemId, itemId))
        .orderBy(desc(knowledgeContents.versionNo))
        .limit(1);
      const [inserted] = await tx
        .insert(knowledgeContents)
        .values({
          itemId,
          sourceRunId: runId,
          versionNo: (last?.versionNo ?? 0) + 1,
          format: normalized.format,
          titleSnapshot: normalized.title,
          summary: normalized.summary,
          bodyMarkdown: normalized.bodyMarkdown,
          bodyHtml: normalized.bodyHtml,
          structuredData: normalized.structuredData,
          structuredStorageKey: structuredFile?.finalKey,
          structuredSchema: normalized.structuredSchema,
          structuredPreview: normalized.structuredPreview,
          rowCount: normalized.rowCount,
          columnCount: normalized.columnCount,
          contentHash,
          rawHash: rawFile.sha256,
          normalizerVersion: NORMALIZER_VERSION,
          sourceRevision: node.sourceUpdatedAt?.toISOString(),
          rawSnapshotStorageKey: rawFile.finalKey,
          stagingPrefix: path.posix.dirname(rawFile.tempKey),
          renderStatus: normalized.renderStatus,
          unsupportedSummary: normalized.unsupportedSummary,
          locatorMap: normalized.locatorMap,
          locatorTruncated: normalized.locatorTruncated ? 1 : 0,
        })
        .$returningId();
      if (assetRows.length)
        await tx
          .insert(knowledgeAssets)
          .values(
            assetRows.map(asset => ({ ...asset, contentId: inserted.id }))
          );
      return { contentId: inserted.id, isNew: !last };
    });
    stagingCommitted = true;
    await finalizeStaged(staged);
    await db.transaction(async tx => {
      const [source] = await tx
        .select({ leaseToken: knowledgeSources.leaseToken })
        .from(knowledgeSources)
        .where(eq(knowledgeSources.id, sourceId));
      if (source?.leaseToken !== lease)
        throw new KnowledgeSyncBusy("同步租约失效");
      await tx
        .update(knowledgeContents)
        .set({
          ingestStatus: "ready",
          readyAt: new Date(),
          stagingPrefix: null,
        })
        .where(eq(knowledgeContents.id, result.contentId));
      await tx
        .update(knowledgeItems)
        .set({
          syncStatus: "active",
          sourceAccessStatus: "accessible",
          syncedAt: new Date(),
          lastContentErrorCode: null,
        })
        .where(eq(knowledgeItems.id, itemId));
    });
    await discardStaged(runId, node.nodeToken);
    return {
      status: result.isNew ? "created" : "updated",
      incomplete: normalized.renderStatus !== "complete",
    };
  } catch (error) {
    if (!stagingCommitted)
      await discardStaged(runId, node.nodeToken).catch(() => undefined);
    throw error;
  }
}

async function executeRun(
  db: Db,
  sourceId: number,
  runId: number,
  lease: string,
  retryMissing: boolean
) {
  const failures: RunFailure[] = [];
  const counts: RunCounts = {
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    unsupported: 0,
    assetLimit: 0,
  };
  const renew = setInterval(
    () =>
      void db
        .update(knowledgeSources)
        .set({ leaseExpiresAt: new Date(Date.now() + LEASE_MS) })
        .where(
          and(
            eq(knowledgeSources.id, sourceId),
            eq(knowledgeSources.leaseToken, lease)
          )
        )
        .catch(() => undefined),
    60_000
  );
  renew.unref?.();
  let directoryComplete = false;
  try {
    const budget = new RunStorageBudget();
    await budget.preflight();
    const client = FeishuClient.fromEnvironment();
    const [source] = await db
      .select()
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, sourceId))
      .limit(1);
    if (!source || source.connectorKey !== "feishu_wiki")
      throw new Error("Unsupported Knowledge Source");
    const { nodes, pages } = await readWikiDirectory(client, source.externalId);
    const ids = await recordDirectory(db, sourceId, runId, lease, nodes);
    directoryComplete = true;
    await db
      .update(knowledgeSyncRuns)
      .set({ pagination: { directoryPages: pages } })
      .where(eq(knowledgeSyncRuns.id, runId));
    await reconcileMissing(db, sourceId, runId, lease);
    for (const node of nodes) {
      if (
        node.nodeType === "shortcut" ||
        !["docx", "file", "sheet", "bitable"].includes(node.objType)
      ) {
        counts.unsupported++;
        continue;
      }
      const itemId = ids.get(node.nodeToken)!;
      try {
        const result = await processNode(
          db,
          client,
          sourceId,
          runId,
          lease,
          node,
          itemId,
          budget,
          retryMissing
        );
        counts[result.status]++;
        if (result.incomplete) counts.unsupported++;
      } catch (error) {
        if (error instanceof KnowledgeSyncBusy) throw error;
        counts.failed++;
        if (error instanceof StorageLimitError) counts.assetLimit++;
        const detail = failure(error, node.nodeToken);
        failures.push(detail);
        if (permissionDenied(error)) await itemAccessLost(db, itemId);
        else
          await db
            .update(knowledgeItems)
            .set({
              syncStatus: "content_failed",
              lastContentErrorCode: detail.code,
              ...(error instanceof FeishuError &&
              error.stage === "image_download"
                ? { sourceAccessStatus: "accessible" as const }
                : {}),
            })
            .where(eq(knowledgeItems.id, itemId));
        if (
          error instanceof StorageLimitError &&
          ["run", "free_space", "not_writable"].includes(error.reason)
        )
          break;
      }
      if (
        (counts.created + counts.updated + counts.unchanged + counts.failed) %
          10 ===
        0
      )
        await db
          .update(knowledgeSyncRuns)
          .set({
            createdCount: counts.created,
            updatedCount: counts.updated,
            unchangedCount: counts.unchanged,
            contentFailedCount: counts.failed,
            assetLimitCount: counts.assetLimit,
            bytesWritten: budget.usedBytes,
            failures: failures.slice(0, 500),
          })
          .where(eq(knowledgeSyncRuns.id, runId));
    }
    await db
      .update(knowledgeSyncRuns)
      .set({
        status: counts.failed ? "partial" : "succeeded",
        contentFetchComplete: counts.failed ? 0 : 1,
        createdCount: counts.created,
        updatedCount: counts.updated,
        unchangedCount: counts.unchanged,
        contentFailedCount: counts.failed,
        unsupportedCount: counts.unsupported,
        assetLimitCount: counts.assetLimit,
        bytesWritten: budget.usedBytes,
        failures: failures.slice(0, 500),
        finishedAt: new Date(),
      })
      .where(eq(knowledgeSyncRuns.id, runId));
    if (!counts.failed)
      await db
        .update(knowledgeSources)
        .set({ lastSuccessfulSyncAt: new Date() })
        .where(eq(knowledgeSources.id, sourceId));
  } catch (error) {
    const detail = failure(error, String(sourceId));
    failures.push(detail);
    if (permissionDenied(error) && !directoryComplete)
      await sourceAccessLost(db, sourceId);
    await updateFailures(db, runId, failures);
    await db
      .update(knowledgeSyncRuns)
      .set({
        status:
          directoryComplete || error instanceof StorageLimitError
            ? "partial"
            : "failed",
        finishedAt: new Date(),
        contentFailedCount: counts.failed,
        assetLimitCount: counts.assetLimit,
      })
      .where(eq(knowledgeSyncRuns.id, runId));
  } finally {
    clearInterval(renew);
    await db
      .update(knowledgeSources)
      .set({ leaseToken: null, leaseExpiresAt: null })
      .where(
        and(
          eq(knowledgeSources.id, sourceId),
          eq(knowledgeSources.leaseToken, lease)
        )
      )
      .catch(() => undefined);
  }
}

export async function abandonExpiredKnowledgeRuns() {
  const db = await knowledgeDb();
  const runs = await db
    .select()
    .from(knowledgeSyncRuns)
    .where(eq(knowledgeSyncRuns.status, "running"));
  for (const run of runs) {
    const [source] = await db
      .select({
        leaseToken: knowledgeSources.leaseToken,
        leaseExpiresAt: knowledgeSources.leaseExpiresAt,
      })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, run.sourceId))
      .limit(1);
    if (
      source?.leaseToken === run.leaseToken &&
      source.leaseExpiresAt &&
      source.leaseExpiresAt > new Date()
    )
      continue;
    await db
      .update(knowledgeSyncRuns)
      .set({ status: "abandoned", finishedAt: new Date() })
      .where(eq(knowledgeSyncRuns.id, run.id));
  }
}
