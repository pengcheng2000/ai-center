import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { eq, desc } from "drizzle-orm";
import { knowledgeDb } from "./repository";
import {
  knowledgeItems,
  knowledgeContents,
  knowledgeSyncRuns,
} from "../../drizzle/schema";
import { initialEditorial } from "./curation";
import { startKnowledgeSync } from "./sync/syncKnowledgeSource";
const target = new URL(process.env.DATABASE_URL ?? "");
if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname))
  throw new Error("维护命令仅允许本地开发数据库");
const mode = process.argv[2] ?? "survey";
if (!["survey", "curate", "sync"].includes(mode)) throw new Error("用法：knowledge:maintain survey|curate|sync [sourceId] [--retry-missing]");
const db = await knowledgeDb();
if (mode === "sync") {
  const sourceId = Number(process.argv[3] ?? 1);
  if (!Number.isSafeInteger(sourceId) || sourceId <= 0) throw new Error("来源编号必须为正整数");
  const { runId } = await startKnowledgeSync(sourceId, "manual", process.argv.includes("--retry-missing"));
  console.log(JSON.stringify({ runId, status: "started" }));
  const timer = setInterval(async () => {
    const [run] = await db
      .select()
      .from(knowledgeSyncRuns)
      .where(eq(knowledgeSyncRuns.id, runId));
    console.log(
      JSON.stringify({
        runId,
        status: run.status,
        created: run.createdCount,
        updated: run.updatedCount,
        unchanged: run.unchangedCount,
        failed: run.contentFailedCount,
      })
    );
    if (run.status !== "running") {
      clearInterval(timer);
      process.exit(run.status === "failed" ? 1 : 0);
    }
  }, 15000);
} else {
  const items = await db.select().from(knowledgeItems);
  const contents = await db
    .select()
    .from(knowledgeContents)
    .where(eq(knowledgeContents.ingestStatus, "ready"))
    .orderBy(desc(knowledgeContents.versionNo));
  const report: Array<
    ReturnType<typeof initialEditorial> & {
      itemId: number;
      title: string;
      contentId?: number;
      version?: number;
      renderStatus?: string;
      issues: Record<string, number> | null | undefined;
    }
  > = [];
  for (const item of items) {
    const content = contents.find(c => c.itemId === item.id);
    const ancestors: string[] = [],
      seen = new Set<number>();
    let parent = items.find(i => i.id === item.parentItemId);
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id);
      ancestors.unshift(parent.title);
      parent = items.find(i => i.id === parent?.parentItemId);
    }
    const editorial =
      item.editorial ??
      initialEditorial({
        title: item.title,
        body:
          content?.bodyMarkdown ?? content?.bodyHtml ?? content?.summary ?? "",
        kind: item.kind,
        ancestors,
        hasChildren: items.some(i => i.parentItemId === item.id),
      });
    if (!content) {
      editorial.included = false;
      editorial.reason = "尚无可读版本，保留在运营库";
    }
    if (mode === "curate" && !item.editorial)
      await db
        .update(knowledgeItems)
        .set({ editorial })
        .where(eq(knowledgeItems.id, item.id));
    report.push({
      itemId: item.id,
      title: item.title,
      contentId: content?.id,
      version: content?.versionNo,
      renderStatus: content?.renderStatus,
      issues: content?.unsupportedSummary,
      ...editorial,
    });
  }
  await mkdir(".data/knowledge", { recursive: true });
  await writeFile(
    ".data/knowledge/curation-report.json",
    JSON.stringify(report, null, 2)
  );
  const counts = Object.fromEntries(
    ["basics", "tools", "tutorials", "cases", "development", "governance"].map(
      c => [c, report.filter(r => r.included && r.category === c).length]
    )
  );
  console.log(
    JSON.stringify({
      mode,
      nodes: report.length,
      readable: report.filter(r => r.contentId).length,
      included: report.filter(r => r.included).length,
      categories: counts,
    })
  );
  process.exit(0);
}
