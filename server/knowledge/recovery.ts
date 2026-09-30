import { stat } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import {
  knowledgeAssets,
  knowledgeContents,
  knowledgeSources,
  knowledgeSyncRuns,
} from "../../drizzle/schema";
import { storageDelete, resolveStoragePath } from "../storage";
import { knowledgeDb } from "./repository";
import {
  cleanupStaleTmp,
  finalizeStaged,
  hashFile,
  type StagedFile,
} from "./storage";
import { abandonExpiredKnowledgeRuns } from "./sync/syncKnowledgeSource";

function stagedKey(finalKey: string) {
  if (!finalKey.startsWith("knowledge/objects/"))
    throw new Error("Invalid staged knowledge key");
  return finalKey.replace("knowledge/objects/", "knowledge/tmp/");
}

/** Recover committed staging rows before removing any stale temporary directory. */
export async function recoverKnowledgeStorage() {
  const db = await knowledgeDb();
  await abandonExpiredKnowledgeRuns();
  const pending = await db
    .select()
    .from(knowledgeContents)
    .where(eq(knowledgeContents.ingestStatus, "staging"));
  for (const content of pending) {
    const [run] = await db
      .select()
      .from(knowledgeSyncRuns)
      .where(eq(knowledgeSyncRuns.id, content.sourceRunId))
      .limit(1);
    const [source] = run
      ? await db
          .select()
          .from(knowledgeSources)
          .where(eq(knowledgeSources.id, run.sourceId))
          .limit(1)
      : [];
    if (
      run?.status === "running" &&
      source?.leaseToken === run.leaseToken &&
      source.leaseExpiresAt &&
      source.leaseExpiresAt > new Date()
    )
      continue;
    const assets = await db
      .select()
      .from(knowledgeAssets)
      .where(eq(knowledgeAssets.contentId, content.id));
    const requested = new Map<
      string,
      { sha256: string; mimeType: string; sizeBytes?: number }
    >();
    if (content.rawSnapshotStorageKey)
      requested.set(content.rawSnapshotStorageKey, {
        sha256: content.rawHash,
        mimeType:
          content.format === "binary" ? "application/pdf" : "application/json",
      });
    if (content.structuredStorageKey)
      requested.set(content.structuredStorageKey, {
        sha256: content.rawHash,
        mimeType: "application/json",
      });
    for (const asset of assets)
      requested.set(asset.storageKey, {
        sha256: asset.sha256,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
      });
    const files: StagedFile[] = [];
    let complete = true;
    for (const [finalKey, info] of requested) {
      const tempKey = stagedKey(finalKey);
      const finalPath = resolveStoragePath(finalKey);
      const tempPath = resolveStoragePath(tempKey);
      const candidate = (await stat(finalPath).catch(() => null))
        ? finalPath
        : (await stat(tempPath).catch(() => null))
          ? tempPath
          : null;
      if (
        !candidate ||
        (info.sizeBytes !== undefined &&
          (await stat(candidate)).size !== info.sizeBytes) ||
        (await hashFile(candidate)) !== info.sha256
      ) {
        complete = false;
        break;
      }
      files.push({
        tempKey,
        finalKey,
        mimeType: info.mimeType,
        sizeBytes: (await stat(candidate)).size,
        sha256: info.sha256,
      });
    }
    if (complete && files.length) {
      await finalizeStaged(files);
      await db
        .update(knowledgeContents)
        .set({
          ingestStatus: "ready",
          readyAt: new Date(),
          stagingPrefix: null,
        })
        .where(eq(knowledgeContents.id, content.id));
    } else {
      await db.transaction(async tx => {
        await tx
          .delete(knowledgeAssets)
          .where(eq(knowledgeAssets.contentId, content.id));
        await tx
          .delete(knowledgeContents)
          .where(
            and(
              eq(knowledgeContents.id, content.id),
              eq(knowledgeContents.ingestStatus, "staging")
            )
          );
      });
      for (const finalKey of requested.keys()) await storageDelete(finalKey);
    }
  }
  await cleanupStaleTmp(async runId => {
    const [run] = await db
      .select()
      .from(knowledgeSyncRuns)
      .where(eq(knowledgeSyncRuns.id, runId))
      .limit(1);
    if (run?.status !== "running") return false;
    const [source] = await db
      .select()
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, run.sourceId))
      .limit(1);
    return (
      source?.leaseToken === run.leaseToken &&
      !!source.leaseExpiresAt &&
      source.leaseExpiresAt > new Date()
    );
  });
}
