import type { Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { newsDigestSettings, newsSources } from "../drizzle/schema";
import { getDb } from "./db";
import {
  generateNewsDigest,
  getNewsDigestSettings,
  intervalHoursToCron,
} from "./newsDigest";
import { syncRssSourceById } from "./newsSync";
import { sdk } from "./_core/sdk";
import {
  createHeartbeatJob,
  updateHeartbeatJob,
} from "./_core/heartbeat";

type RssScheduleSource = {
  id: number;
  name: string;
  syncIntervalHours: number;
  scheduleCronTaskUid: string | null;
};

type DigestScheduleSettings = {
  intervalHours: number;
  scheduleCronTaskUid: string | null;
};

function isMissingHeartbeatJob(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "NOT_FOUND"
  );
}

export async function upsertRssSyncJob(source: RssScheduleSource) {
  const cron = intervalHoursToCron(source.syncIntervalHours);
  if (source.scheduleCronTaskUid) {
    try {
      const schedule = await updateHeartbeatJob(
        source.scheduleCronTaskUid,
        {
          enable: true,
          cron,
          path: "/api/scheduled/rss-sync",
          description: `每 ${source.syncIntervalHours} 小时同步：${source.name}`,
        },
        ""
      );
      return { taskUid: source.scheduleCronTaskUid, ...schedule };
    } catch (error) {
      if (!isMissingHeartbeatJob(error)) throw error;
    }
  }
  return createHeartbeatJob(
    {
      name: `daily-rss-source-${source.id}`,
      cron,
      path: "/api/scheduled/rss-sync",
      payload: {},
      description: `每 ${source.syncIntervalHours} 小时同步：${source.name}`,
    },
    ""
  );
}

export async function upsertNewsDigestJob(settings: DigestScheduleSettings) {
  const cron = intervalHoursToCron(settings.intervalHours);
  if (settings.scheduleCronTaskUid) {
    try {
      const schedule = await updateHeartbeatJob(
        settings.scheduleCronTaskUid,
        {
          enable: true,
          cron,
          path: "/api/scheduled/news-digest",
          description: `每 ${settings.intervalHours} 小时生成员工端资讯摘要`,
        },
        ""
      );
      return { taskUid: settings.scheduleCronTaskUid, ...schedule };
    } catch (error) {
      if (!isMissingHeartbeatJob(error)) throw error;
    }
  }
  return createHeartbeatJob(
    {
      name: "employee-news-digest",
      cron,
      path: "/api/scheduled/news-digest",
      payload: {},
      description: `每 ${settings.intervalHours} 小时生成员工端资讯摘要`,
    },
    ""
  );
}

export async function pauseScheduledJob(taskUid: string | null) {
  if (!taskUid) return;
  try {
    await updateHeartbeatJob(taskUid, { enable: false }, "");
  } catch (error) {
    if (!isMissingHeartbeatJob(error)) throw error;
  }
}

/** 服务重启后按数据库状态重建 RSS 同步与员工端摘要任务。 */
export async function restoreScheduledRssSyncJobs() {
  if (process.env.NODE_ENV === "development") return;
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  try {
    const database = await getDb();
    if (!database) return;
    db = database;
    const sources = await db
      .select({
        id: newsSources.id,
        name: newsSources.name,
        syncIntervalHours: newsSources.syncIntervalHours,
        scheduleCronTaskUid: newsSources.scheduleCronTaskUid,
      })
      .from(newsSources)
      .where(
        and(eq(newsSources.scheduleEnabled, 1), eq(newsSources.isEnabled, 1))
      );
    for (const source of sources) {
      try {
        const schedule = await upsertRssSyncJob(source);
        if (source.scheduleCronTaskUid !== schedule.taskUid)
          await db
            .update(newsSources)
            .set({ scheduleCronTaskUid: schedule.taskUid })
            .where(eq(newsSources.id, source.id));
        console.log(
          `[ScheduledNews] 已恢复每 ${source.syncIntervalHours} 小时同步：${source.name}`
        );
      } catch (error) {
        console.warn(`[ScheduledNews] 恢复资讯源 ${source.id} 的同步失败:`, error);
      }
    }

    const settings = await getNewsDigestSettings(db);
    if (settings.isEnabled) {
      const schedule = await upsertNewsDigestJob(settings);
      if (settings.scheduleCronTaskUid !== schedule.taskUid)
        await db
          .update(newsDigestSettings)
          .set({ scheduleCronTaskUid: schedule.taskUid })
          .where(eq(newsDigestSettings.id, 1));
      console.log(
        `[ScheduledNews] 已恢复每 ${settings.intervalHours} 小时员工端资讯摘要`
      );
    }
  } catch (error) {
    console.warn(
      "[ScheduledNews] 恢复资讯调度失败（数据库可能尚未就绪）:",
      error instanceof Error ? error.message : error
    );
  }
}

export async function runScheduledRssSync(taskUid: string) {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用");
  const [source] = await db
    .select()
    .from(newsSources)
    .where(eq(newsSources.scheduleCronTaskUid, taskUid))
    .limit(1);
  if (!source || !source.scheduleEnabled || source.isEnabled === 0)
    return { ok: true, skipped: "orphan-or-paused" as const };
  try {
    const result = await syncRssSourceById(source.id, 50);
    await db
      .update(newsSources)
      .set({ scheduleLastRunAt: new Date(), scheduleLastError: null })
      .where(eq(newsSources.id, source.id));
    return { ok: true, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "资讯源同步失败";
    await db
      .update(newsSources)
      .set({ scheduleLastError: message.slice(0, 1000) })
      .where(eq(newsSources.id, source.id));
    throw error;
  }
}

export async function runScheduledNewsDigest(taskUid: string) {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用");
  const settings = await getNewsDigestSettings(db);
  if (!settings.isEnabled || settings.scheduleCronTaskUid !== taskUid)
    return { ok: true, skipped: "orphan-or-paused" as const };
  return { ok: true, ...(await generateNewsDigest()) };
}

function registerCronRoute(
  app: Express,
  path: string,
  run: (taskUid: string) => Promise<unknown>
) {
  app.post(path, async (req: Request, res: Response) => {
    let taskUid: string | undefined;
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid)
        return res.status(403).json({ error: "cron-only" });
      taskUid = user.taskUid;
      return res.json(await run(taskUid));
    } catch (error) {
      const message = error instanceof Error ? error.message : "资讯调度失败";
      return res.status(500).json({
        error: message,
        context: { taskUid },
        timestamp: new Date().toISOString(),
      });
    }
  });
}

export function registerScheduledNewsRoutes(app: Express) {
  registerCronRoute(app, "/api/scheduled/rss-sync", runScheduledRssSync);
  registerCronRoute(app, "/api/scheduled/news-digest", runScheduledNewsDigest);
}
