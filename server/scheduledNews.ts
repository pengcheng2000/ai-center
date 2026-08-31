import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { newsSources } from "../drizzle/schema";
import { getDb } from "./db";
import { DAILY_SYNC_CRON, syncRssSourceById } from "./newsSync";
import { sdk } from "./_core/sdk";
import { createHeartbeatJob } from "./_core/heartbeat";

/**
 * 服务重启后本地定时注册表为空，这里按业务表状态重建启用了每日同步的资讯源，
 * 并把新的 taskUid 写回业务行，保证“暂停/恢复/更新计划”继续可用。
 */
export async function restoreScheduledRssSyncJobs() {
  let sources: Array<{ id: number; name: string; scheduleCronTaskUid: string | null }>;
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  try {
    const database = await getDb();
    if (!database) return;
    db = database;
    sources = await db.select({ id: newsSources.id, name: newsSources.name, scheduleCronTaskUid: newsSources.scheduleCronTaskUid }).from(newsSources).where(eq(newsSources.scheduleEnabled, 1));
  } catch (error) {
    console.warn("[ScheduledNews] 恢复每日同步计划失败（数据库可能尚未就绪）:", error instanceof Error ? error.message : error);
    return;
  }
  for (const source of sources) {
    try {
      const schedule = await createHeartbeatJob({ name: `daily-rss-source-${source.id}`, cron: DAILY_SYNC_CRON, path: "/api/scheduled/rss-sync", payload: {}, description: `每日同步：${source.name}` }, "");
      if (source.scheduleCronTaskUid !== schedule.taskUid) {
        await db.update(newsSources).set({ scheduleCronTaskUid: schedule.taskUid }).where(eq(newsSources.id, source.id));
      }
      console.log(`[ScheduledNews] 已恢复每日同步：${source.name}`);
    } catch (error) {
      console.warn(`[ScheduledNews] 恢复资讯源 ${source.id} 的每日同步失败:`, error);
    }
  }
}

export async function runScheduledRssSync(taskUid: string) {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用");
  const [source] = await db.select().from(newsSources).where(eq(newsSources.scheduleCronTaskUid, taskUid)).limit(1);
  if (!source || !source.scheduleEnabled) return { ok: true, skipped: "orphan-or-paused" as const };
  try {
    const result = await syncRssSourceById(source.id, 50);
    await db.update(newsSources).set({ scheduleLastRunAt: new Date(), scheduleLastError: null }).where(eq(newsSources.id, source.id));
    return { ok: true, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "每日同步失败";
    await db.update(newsSources).set({ scheduleLastError: message.slice(0, 1000) }).where(eq(newsSources.id, source.id));
    throw error;
  }
}

export function registerScheduledNewsRoutes(app: Express) {
  app.post("/api/scheduled/rss-sync", async (req: Request, res: Response) => {
    let taskUid: string | undefined;
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      taskUid = user.taskUid;
      return res.json(await runScheduledRssSync(taskUid));
    } catch (error) {
      const message = error instanceof Error ? error.message : "每日同步失败";
      return res.status(500).json({ error: message, context: { taskUid }, timestamp: new Date().toISOString() });
    }
  });
}
