import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { knowledgeDb } from "./repository";
import {
  users,
  knowledgeSources,
  knowledgeSyncRuns,
  knowledgeItems,
  knowledgeContents,
  knowledgeAssets,
  contentPublications,
} from "../../drizzle/schema";
import { storagePut, storageDelete } from "../storage";
import { stageBytes, finalizeStaged, RunStorageBudget } from "./storage";
import { defaultEditorial } from "../../shared/knowledge";
import { knowledgeRouter } from "../routers/knowledge";
import { knowledgeDetailForViewer, canAccessAsset } from "./permissions";
import { saveEditorial, viewerCatalog } from "./catalog";
import {
  approveKnowledgeContent,
  publishKnowledgeContent,
  withdrawKnowledgePublication,
} from "./publication";
import {
  registerKnowledgeAssetRoute,
  signedKnowledgeAssetUrl,
} from "./assetRoute";
import { sdk } from "../_core/sdk";
import type { TrpcContext } from "../_core/context";
const target = new URL(process.env.DATABASE_URL ?? "");
if (!["127.0.0.1", "localhost"].includes(target.hostname))
  throw new Error("Integration fixtures require a local database");
process.env.NODE_ENV = "production";
const db = await knowledgeDb();
const [admin] = await db
  .select()
  .from(users)
  .where(eq(users.role, "admin"))
  .limit(1);
assert(admin, "Local administrator fixture required");
let sourceId = 0,
  runId = 0;
const itemIds: number[] = [],
  contentIds: number[] = [],
  assetIds: number[] = [],
  pubIds: number[] = [],
  files: string[] = [];
let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
let checks = 0;
const check = (value: unknown, message: string) => {
  assert(value, message);
  checks++;
};
try {
  const [source] = await db
    .insert(knowledgeSources)
    .values({
      name: "知识体验集成测试",
      connectorKey: "test",
      config: {},
      externalId: randomUUID(),
      sourceAccessStatus: "accessible",
    })
    .$returningId();
  sourceId = source.id;
  const [run] = await db
    .insert(knowledgeSyncRuns)
    .values({
      sourceId,
      trigger: "manual",
      status: "succeeded",
      leaseToken: randomUUID(),
      directoryTraversalComplete: 1,
      contentFetchComplete: 1,
      reconciliationComplete: 1,
      failures: [],
    })
    .$returningId();
  runId = run.id;
  for (let i = 0; i < 2; i++) {
    const [item] = await db
      .insert(knowledgeItems)
      .values({
        sourceId,
        externalId: randomUUID(),
        kind: "sheet",
        title: i ? "未发布的私密测试标题" : "测试表格",
        sourceAccessStatus: "accessible",
        syncStatus: "active",
      })
      .$returningId();
    itemIds.push(item.id);
  }
  const budget = new RunStorageBudget();
  const rawStage = await stageBytes(
    runId,
    "integration",
    "raw",
    "{}",
    "application/json",
    budget
  );
  const imageStage = await stageBytes(
    runId,
    "integration",
    "image",
    Buffer.from([0, 1, 2, 3]),
    "image/png",
    budget
  );
  await finalizeStaged([rawStage, imageStage]);
  const raw = { key: rawStage.finalKey },
    image = { key: imageStage.finalKey };
  files.push(raw.key, image.key);
  for (let version = 1; version <= 2; version++) {
    const [content] = await db
      .insert(knowledgeContents)
      .values({
        itemId: itemIds[0],
        sourceRunId: runId,
        versionNo: version,
        ingestStatus: "ready",
        readyAt: new Date(),
        format: "structured",
        titleSnapshot: "测试表格",
        structuredData: {
          displayTables: [
            {
              name: "版本",
              columns: ["版本"],
              total: 1,
              rows: [[[{ text: String(version) }]]],
            },
          ],
        },
        rawSnapshotStorageKey: raw.key,
        contentHash: String(version).repeat(64),
        rawHash: "a".repeat(64),
        normalizerVersion: "test",
        renderStatus: "complete",
      })
      .$returningId();
    contentIds.push(content.id);
    const [asset] = await db
      .insert(knowledgeAssets)
      .values({
        contentId: content.id,
        assetRef: "image",
        kind: "inline_image",
        fileName: "image.png",
        mimeType: "image/png",
        sizeBytes: 4,
        sha256: "b".repeat(64),
        storageKey: image.key,
      })
      .$returningId();
    assetIds.push(asset.id);
  }
  const viewer = {
    userId: admin.id,
    role: "user",
    remoteAddress: "10.0.0.10",
    runtimeMode: "production",
  } as const;
  const ctx = {
    user: { ...admin, role: "user" },
    req: { socket: { remoteAddress: "10.0.0.10" } },
    res: {},
  } as TrpcContext;
  const caller = knowledgeRouter.createCaller(ctx);
  const operator = knowledgeRouter.createCaller({ ...ctx, user: admin });
  check(
    (await knowledgeDetailForViewer(viewer, itemIds[0])) === null,
    "Unpublished content must remain private"
  );
  await assert.rejects(
    () =>
      caller.admin.structuredPage({
        contentId: contentIds[0],
        groupIndex: 0,
        page: 0,
      }),
    { code: "FORBIDDEN" }
  );
  checks++;
  await assert.rejects(
    () =>
      approveKnowledgeContent({
        contentId: contentIds[0],
        approvedBy: admin.id,
        ownerConfirmedBy: "测试负责人",
        allowIncomplete: false,
      }),
    /编目/
  );
  checks++;
  const editorial = {
    ...defaultEditorial(),
    category: "tools" as const,
    included: true,
    featured: true,
    summary: "已批准的简介",
    topic: "测试专题",
    reviewedContentId: contentIds[0],
  };
  await saveEditorial(itemIds[0], editorial);
  const previewCatalog = await viewerCatalog(
    { userId: admin.id, role: "user", remoteAddress: "127.0.0.1", runtimeMode: "development" },
    { query: "测试表格", category: "all", topic: "all", sort: "recommended", page: 1 }
  );
  check(
    previewCatalog.items.find(i => i.itemId === itemIds[0])?.editorial?.featured === false,
    "A newer unreviewed preview version cannot inherit an old featured badge"
  );
  const approved = await approveKnowledgeContent({
    contentId: contentIds[0],
    approvedBy: admin.id,
    ownerConfirmedBy: "集成测试专用",
    allowIncomplete: false,
  });
  pubIds.push(approved.publicationId);
  await publishKnowledgeContent(approved.publicationId, admin.id);
  check(
    (await caller.detail({ id: itemIds[0] })).content.id === contentIds[0],
    "Employee detail must remain on the published version"
  );
  check(
    (
      await caller.structuredPage({
        itemId: itemIds[0],
        contentId: contentIds[0],
        groupIndex: 0,
        page: 0,
      })
    ).rows[0][0][0].text === "1",
    "Published table uses v1"
  );
  check(
    (
      await operator.admin.structuredPage({
        contentId: contentIds[1],
        groupIndex: 0,
        page: 0,
      })
    ).rows[0][0][0].text === "2",
    "Admin can independently preview v2"
  );
  await assert.rejects(
    () =>
      caller.structuredPage({
        itemId: itemIds[0],
        contentId: contentIds[1],
        groupIndex: 0,
        page: 0,
      }),
    /版本/
  );
  checks++;
  await saveEditorial(itemIds[0], {
    ...editorial,
    category: "cases",
    summary: "尚未发布的草稿修改",
    reviewedContentId: contentIds[1],
  });
  const detail = await caller.detail({ id: itemIds[0] });
  check(
    detail.editorial.summary === "已批准的简介" &&
      detail.editorial.category === "tools",
    "Draft metadata cannot leak into published content"
  );
  const listing = await viewerCatalog(viewer, {
    query: "",
    category: "all",
    topic: "all",
    sort: "recommended",
    page: 1,
  });
  check(
    listing.items.some(i => i.itemId === itemIds[0]) &&
      !listing.items.some(i => i.itemId === itemIds[1]),
    "Catalog excludes private content"
  );
  check(
    detail.children.every(c => c.id !== itemIds[1]),
    "Navigation excludes private content"
  );
  check(
    !!(await canAccessAsset(viewer, assetIds[0])),
    "Published asset readable"
  );
  check(
    (await canAccessAsset(viewer, assetIds[1])) === null,
    "Unpublished asset remains private"
  );
  const app = express();
  registerKnowledgeAssetRoute(app);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const origin = "http://127.0.0.1:" + address.port;
  const cookie =
    "app_session_id=" +
    (await sdk.createSessionToken(admin.openId, {
      name: admin.name ?? "",
      expiresInMs: 60000,
    }));
  const assetUrl = signedKnowledgeAssetUrl(
    assetIds[0],
    admin.id,
    approved.publicationId
  );
  const response = await fetch(origin + assetUrl, {
    headers: { cookie, Range: "bytes=1-2" },
  });
  check(
    response.status === 206 &&
      Buffer.from(await response.arrayBuffer()).equals(Buffer.from([1, 2])),
    "Asset range reader preserves authorization"
  );
  check(
    (await fetch(origin + assetUrl)).status !== 200,
    "Anonymous asset rejected"
  );
  const expired = new URL(assetUrl, origin);
  expired.searchParams.set("expires", "1");
  check(
    (await fetch(expired, { headers: { cookie } })).status === 404,
    "Expired signature rejected"
  );
  const approved2 = await approveKnowledgeContent({
    contentId: contentIds[1],
    approvedBy: admin.id,
    ownerConfirmedBy: "集成测试专用",
    allowIncomplete: false,
  });
  pubIds.push(approved2.publicationId);
  await publishKnowledgeContent(approved2.publicationId, admin.id);
  const catalogArgs = {
    sourceId,
    query: "",
    category: "all",
    topic: "all",
    status: "all",
    quality: "all",
    page: 1,
  };
  check(
    (await operator.admin.catalog(catalogArgs)).counts.published === 1,
    "Published count reflects active publication"
  );
  const draft = {
    ...editorial,
    category: "cases" as const,
    summary: "仅更新简介的草稿",
    reviewedContentId: contentIds[1],
  };
  await saveEditorial(itemIds[0], draft);
  check(
    (await operator.admin.catalog(catalogArgs)).items.find(
      i => i.id === itemIds[0]
    )?.status === "updated",
    "Metadata-only edits appear as an update"
  );
  const pending = await approveKnowledgeContent({
    contentId: contentIds[1],
    approvedBy: admin.id,
    ownerConfirmedBy: "集成测试专用",
    allowIncomplete: false,
  });
  pubIds.push(pending.publicationId);
  const queued = await operator.admin.catalog(catalogArgs);
  check(
    queued.counts.published === 1 && queued.counts.approved === 1,
    "A pending replacement does not hide an active publication from counts"
  );
  await saveEditorial(itemIds[0], { ...draft, summary: "批准后再次修改" });
  check(
    (await operator.admin.catalog(catalogArgs)).counts.approved === 0,
    "Stale editorial approvals are not presented as current pending publications"
  );
  check(
    (await fetch(origin + assetUrl, { headers: { cookie } })).status === 404,
    "Republish invalidates old asset URLs"
  );
  await assert.rejects(
    () =>
      caller.structuredPage({
        itemId: itemIds[0],
        contentId: contentIds[0],
        groupIndex: 0,
        page: 0,
      }),
    /版本/
  );
  checks++;
  await withdrawKnowledgePublication(approved2.publicationId, admin.id);
  check(
    (await knowledgeDetailForViewer(viewer, itemIds[0])) === null,
    "Withdrawal hides detail"
  );
  check(
    (await canAccessAsset(viewer, assetIds[1])) === null,
    "Withdrawal hides assets"
  );
  console.log(
    JSON.stringify({ checks, result: "passed", fixtures: "synthetic only" })
  );
} finally {
  if (server)
    await new Promise<void>(resolve => server!.close(() => resolve()));
  if (pubIds.length) {
    await db
      .update(contentPublications)
      .set({ supersedesPublicationId: null })
      .where(inArray(contentPublications.id, pubIds));
    await db
      .delete(contentPublications)
      .where(inArray(contentPublications.id, pubIds));
  }
  if (assetIds.length)
    await db
      .delete(knowledgeAssets)
      .where(inArray(knowledgeAssets.id, assetIds));
  if (contentIds.length)
    await db
      .delete(knowledgeContents)
      .where(inArray(knowledgeContents.id, contentIds));
  if (itemIds.length)
    await db.delete(knowledgeItems).where(inArray(knowledgeItems.id, itemIds));
  if (runId)
    await db.delete(knowledgeSyncRuns).where(eq(knowledgeSyncRuns.id, runId));
  if (sourceId)
    await db.delete(knowledgeSources).where(eq(knowledgeSources.id, sourceId));
  for (const file of files) await storageDelete(file);
}
process.exit(0);
