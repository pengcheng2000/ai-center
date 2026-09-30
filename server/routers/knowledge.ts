import { TRPCError } from "@trpc/server";
import { readFile } from "node:fs/promises";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  contentPublications,
  knowledgeContents,
  knowledgeItems,
  knowledgeSources,
  knowledgeSyncRuns,
} from "../../drizzle/schema";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { resolveStoragePath } from "../storage";
import { signedKnowledgeAssetUrl } from "../knowledge/assetRoute";
import { recoverKnowledgeStorage } from "../knowledge/recovery";
import {
  canAccessAsset,
  knowledgeDetailForViewer,
  knowledgeListForViewer,
} from "../knowledge/permissions";
import {
  approveKnowledgeContent,
  publishKnowledgeContent,
  withdrawKnowledgePublication,
  knowledgeApprovalIssue,
} from "../knowledge/publication";
import {
  ensureDefaultKnowledgeSource,
  knowledgeDb,
} from "../knowledge/repository";
import { renderKnowledgeVersion } from "../knowledge/render";
import { configureKnowledgeSchedule } from "../knowledge/schedule";
import { startKnowledgeSync } from "../knowledge/sync/syncKnowledgeSource";
import {
  adminCatalog,
  adminCatalogInput,
  catalogInput,
  editorialInput,
  saveEditorial,
  viewerCatalog,
} from "../knowledge/catalog";
import { defaultEditorial } from "../../shared/knowledge";
import { structuredPage } from "../knowledge/structured";

const idInput = z.object({ id: z.number().int().positive() });

export const knowledgeRouter = router({
  list: protectedProcedure.input(catalogInput).query(({ ctx, input }) =>
    viewerCatalog(
      {
        userId: ctx.user.id,
        role: ctx.user.role,
        remoteAddress: ctx.req.socket?.remoteAddress,
      },
      input
    )
  ),
  detail: protectedProcedure.input(idInput).query(async ({ ctx, input }) => {
    const row = await knowledgeDetailForViewer(
      {
        userId: ctx.user.id,
        role: ctx.user.role,
        remoteAddress: ctx.req.socket?.remoteAddress,
      },
      input.id
    );
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    const content = await renderKnowledgeVersion(
      row.content,
      ctx.user.id,
      row.publication?.id ?? 0
    );
    const visible = await knowledgeListForViewer({
      userId: ctx.user.id,
      role: ctx.user.role,
      remoteAddress: ctx.req.socket?.remoteAddress,
    });
    const editorial =
      (row.visibility === "development_preview"
        ? row.item.editorial
        : row.publication?.editorialSnapshot) ?? defaultEditorial();
    const peers = editorial.topic
      ? visible
          .filter(
            r => r.editorial?.included && r.editorial.topic === editorial.topic
          )
          .sort(
            (a, b) =>
              (a.editorial?.topicOrder ?? 0) - (b.editorial?.topicOrder ?? 0) ||
              a.itemId - b.itemId
          )
      : [];
    const index = peers.findIndex(p => p.itemId === row.item.id);
    const link = (r: (typeof visible)[number] | undefined) =>
      r ? { id: r.itemId, title: r.title } : null;
    const links = Object.fromEntries(
      visible
        .filter(r => r.sourceUrl)
        .map(r => [
          r.sourceUrl!.split("/").at(-1)!.split("?")[0],
          `/learn/knowledge/${r.itemId}`,
        ])
    );
    return {
      item: {
        id: row.item.id,
        kind: row.item.kind,
        sourceUrl: row.item.sourceUrl,
      },
      source: { name: row.source.name },
      visibility: row.visibility,
      editorial,
      updatedAt: row.item.sourceUpdatedAt,
      previous: index > 0 ? link(peers[index - 1]) : null,
      next: index >= 0 ? link(peers[index + 1]) : null,
      children: visible
        .filter(r => r.parentItemId === row.item.id)
        .map(r => link(r)!),
      links,
      publication: row.publication
        ? {
            id: row.publication.id,
            publishedAt: row.publication.publishedAt,
          }
        : null,
      content: {
        id: content.id,
        titleSnapshot: content.titleSnapshot,
        summary: content.summary,
        versionNo: content.versionNo,
        format: content.format,
        bodyMarkdown: content.bodyMarkdown,
        bodyHtml: content.bodyHtml,
        structuredData: content.structuredData,
        structuredSchema: content.structuredSchema,
        structuredPreview: content.structuredPreview,
        rowCount: content.rowCount,
        columnCount: content.columnCount,
        renderStatus: content.renderStatus,
        unsupportedSummary: content.unsupportedSummary,
        assets: content.assets,
      },
    };
  }),
  structuredPage: protectedProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        contentId: z.number().int().positive(),
        groupIndex: z.number().int().nonnegative(),
        page: z.number().int().nonnegative(),
        pageSize: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const row = await knowledgeDetailForViewer(
        {
          userId: ctx.user.id,
          role: ctx.user.role,
          remoteAddress: ctx.req.socket?.remoteAddress,
        },
        input.itemId
      );
      if (!row || row.content.format !== "structured")
        throw new TRPCError({ code: "NOT_FOUND" });
      if (row.content.id !== input.contentId)
        throw new TRPCError({
          code: "CONFLICT",
          message: "内容版本已变化，请重新加载文章",
        });
      return structuredPage(
        row.content,
        input.groupIndex,
        input.page,
        input.pageSize
      );
    }),
  assetUrl: protectedProcedure
    .input(z.object({ assetId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const asset = await canAccessAsset(
        {
          userId: ctx.user.id,
          role: ctx.user.role,
          remoteAddress: ctx.req.socket?.remoteAddress,
        },
        input.assetId
      );
      if (!asset) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        url: signedKnowledgeAssetUrl(
          asset.id,
          ctx.user.id,
          asset.publicationId
        ),
      };
    }),
  admin: router({
    catalog: adminProcedure
      .input(adminCatalogInput)
      .query(({ input }) => adminCatalog(input)),
    saveEditorial: adminProcedure
      .input(
        z.object({
          itemId: z.number().int().positive(),
          editorial: editorialInput,
        })
      )
      .mutation(({ input }) => saveEditorial(input.itemId, input.editorial)),
    bulkEditorial: adminProcedure
      .input(
        z.object({
          itemIds: z.array(z.number().int().positive()).min(1).max(100),
          category: editorialInput.shape.category.optional(),
          included: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await knowledgeDb();
        const items = await db
          .select()
          .from(knowledgeItems)
          .where(inArray(knowledgeItems.id, input.itemIds));
        for (const item of items)
          await saveEditorial(item.id, {
            ...(item.editorial ?? defaultEditorial()),
            ...(input.category ? { category: input.category } : {}),
            ...(input.included !== undefined
              ? { included: input.included }
              : {}),
            reviewedContentId: null,
          });
        return { count: items.length };
      }),
    structuredPage: adminProcedure
      .input(
        z.object({
          contentId: z.number().int().positive(),
          groupIndex: z.number().int().nonnegative(),
          page: z.number().int().nonnegative(),
          pageSize: z.number().int().min(1).max(100).default(50),
        })
      )
      .query(async ({ input }) => {
        const db = await knowledgeDb();
        const [content] = await db
          .select()
          .from(knowledgeContents)
          .where(
            and(
              eq(knowledgeContents.id, input.contentId),
              eq(knowledgeContents.ingestStatus, "ready")
            )
          );
        if (!content || content.format !== "structured")
          throw new TRPCError({ code: "NOT_FOUND" });
        return structuredPage(
          content,
          input.groupIndex,
          input.page,
          input.pageSize
        );
      }),
    assetUrl: adminProcedure
      .input(z.object({ assetId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const asset = await canAccessAsset(
          { userId: ctx.user.id, role: ctx.user.role },
          input.assetId,
          "admin_preview"
        );
        if (!asset) throw new TRPCError({ code: "NOT_FOUND" });
        return { url: signedKnowledgeAssetUrl(asset.id, ctx.user.id, -1) };
      }),
    sources: adminProcedure.query(async () => {
      await ensureDefaultKnowledgeSource();
      const db = await knowledgeDb();
      const rows = await db
        .select()
        .from(knowledgeSources)
        .orderBy(knowledgeSources.id);
      return rows.map(row => ({
        ...row,
        scheduleAvailable: process.env.NODE_ENV === "production",
      }));
    }),
    sourceDetail: adminProcedure.input(idInput).query(async ({ input }) => {
      const db = await knowledgeDb();
      const [source] = await db
        .select()
        .from(knowledgeSources)
        .where(eq(knowledgeSources.id, input.id))
        .limit(1);
      if (!source) throw new TRPCError({ code: "NOT_FOUND" });
      return source;
    }),
    runs: adminProcedure
      .input(z.object({ sourceId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const db = await knowledgeDb();
        const runs = await db
          .select()
          .from(knowledgeSyncRuns)
          .where(eq(knowledgeSyncRuns.sourceId, input.sourceId))
          .orderBy(desc(knowledgeSyncRuns.startedAt))
          .limit(50);
        const contentRows = runs.length
          ? await db
              .select({
                runId: knowledgeContents.sourceRunId,
                issues: knowledgeContents.unsupportedSummary,
              })
              .from(knowledgeContents)
              .where(
                inArray(
                  knowledgeContents.sourceRunId,
                  runs.map(r => r.id)
                )
              )
          : [];
        return runs.map(run => {
          const rows = contentRows.filter(c => c.runId === run.id);
          return {
            ...run,
            quality: {
              images: rows.reduce(
                (n, c) => n + (c.issues?.missing_image ?? 0),
                0
              ),
              attachments: rows.reduce(
                (n, c) => n + (c.issues?.missing_attachment ?? 0),
                0
              ),
              budget: rows.reduce(
                (n, c) => n + (c.issues?.asset_budget ?? 0),
                0
              ),
              structures: rows.filter(c =>
                Object.keys(c.issues ?? {}).some(
                  k => !["missing_image", "missing_attachment"].includes(k)
                )
              ).length,
            },
          };
        });
      }),
    tree: adminProcedure
      .input(z.object({ sourceId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const db = await knowledgeDb();
        return db
          .select()
          .from(knowledgeItems)
          .where(eq(knowledgeItems.sourceId, input.sourceId))
          .orderBy(knowledgeItems.id);
      }),
    versions: adminProcedure
      .input(z.object({ itemId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const db = await knowledgeDb();
        const contents = await db
          .select()
          .from(knowledgeContents)
          .where(eq(knowledgeContents.itemId, input.itemId))
          .orderBy(desc(knowledgeContents.versionNo));
        const publications = await db
          .select()
          .from(contentPublications)
          .where(eq(contentPublications.itemId, input.itemId))
          .orderBy(desc(contentPublications.id));
        return {
          contents: contents.map(
            ({
              bodyMarkdown: _markdown,
              bodyHtml: _html,
              structuredData: _structured,
              ...metadata
            }) => metadata
          ),
          publications,
        };
      }),
    preview: adminProcedure
      .input(
        z.object({
          itemId: z.number().int().positive(),
          contentId: z.number().int().positive().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const db = await knowledgeDb();
        const [item] = await db
          .select()
          .from(knowledgeItems)
          .where(eq(knowledgeItems.id, input.itemId))
          .limit(1);
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        const [content] = await db
          .select()
          .from(knowledgeContents)
          .where(
            and(
              eq(knowledgeContents.itemId, item.id),
              eq(knowledgeContents.ingestStatus, "ready"),
              ...(input.contentId
                ? [eq(knowledgeContents.id, input.contentId)]
                : [])
            )
          )
          .orderBy(desc(knowledgeContents.versionNo))
          .limit(1);
        return {
          item,
          approvalIssue: content
            ? await knowledgeApprovalIssue(content.id)
            : "尚无可读内容版本",
          content: content
            ? await renderKnowledgeVersion(content, ctx.user.id)
            : null,
        };
      }),
    rawSnapshot: adminProcedure
      .input(z.object({ contentId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const db = await knowledgeDb();
        const [content] = await db
          .select({ key: knowledgeContents.rawSnapshotStorageKey })
          .from(knowledgeContents)
          .where(eq(knowledgeContents.id, input.contentId))
          .limit(1);
        if (!content?.key) throw new TRPCError({ code: "NOT_FOUND" });
        return {
          snapshot: await readFile(resolveStoragePath(content.key), "utf8"),
        };
      }),
    syncNow: adminProcedure
      .input(
        z.object({
          sourceId: z.number().int().positive(),
          retryMissing: z.boolean().default(false),
        })
      )
      .mutation(async ({ input }) => {
        await recoverKnowledgeStorage();
        return startKnowledgeSync(input.sourceId, "manual", input.retryMissing);
      }),
    configureSchedule: adminProcedure
      .input(
        z.object({
          sourceId: z.number().int().positive(),
          enabled: z.boolean(),
          intervalHours: z
            .number()
            .int()
            .refine(value => value >= 1 && 24 % value === 0),
        })
      )
      .mutation(({ input }) =>
        configureKnowledgeSchedule(
          input.sourceId,
          input.enabled,
          input.intervalHours
        )
      ),
    approve: adminProcedure
      .input(
        z.object({
          contentId: z.number().int().positive(),
          ownerConfirmedBy: z.string().trim().min(1).max(160),
          allowIncomplete: z.boolean().default(false),
        })
      )
      .mutation(({ ctx, input }) =>
        approveKnowledgeContent({ ...input, approvedBy: ctx.user.id })
      ),
    publish: adminProcedure
      .input(z.object({ publicationId: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        publishKnowledgeContent(input.publicationId, ctx.user.id)
      ),
    withdraw: adminProcedure
      .input(z.object({ publicationId: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        withdrawKnowledgePublication(input.publicationId, ctx.user.id)
      ),
    setFeatured: adminProcedure
      .input(
        z.object({
          publicationId: z.number().int().positive(),
          featured: z.boolean(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await knowledgeDb();
        const [row] = await db
          .select({ status: contentPublications.status })
          .from(contentPublications)
          .where(eq(contentPublications.id, input.publicationId))
          .limit(1);
        if (row?.status !== "published")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "只有已发布内容可以设为精选",
          });
        await db
          .update(contentPublications)
          .set({ isFeatured: input.featured ? 1 : 0 })
          .where(eq(contentPublications.id, input.publicationId));
        return { publicationId: input.publicationId };
      }),
  }),
});
