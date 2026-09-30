import type { Express } from "express";
import { and, eq } from "drizzle-orm";
import { knowledgeSources } from "../../drizzle/schema";
import { createHeartbeatJob, updateHeartbeatJob } from "../_core/heartbeat";
import { sdk } from "../_core/sdk";
import { knowledgeDb } from "./repository";
import { recoverKnowledgeStorage } from "./recovery";
import {
  KnowledgeSyncBusy,
  startKnowledgeSync,
} from "./sync/syncKnowledgeSource";

function cronForHours(hours: number) {
  if (!Number.isInteger(hours) || hours < 1 || 24 % hours !== 0)
    throw new Error("同步间隔必须整除 24 小时");
  const times = Array.from(
    { length: 24 / hours },
    (_, index) => (1 + index * hours) % 24
  ).sort((a, b) => a - b);
  return `0 0 ${times.join(",")} * * *`;
}

export async function configureKnowledgeSchedule(
  sourceId: number,
  enabled: boolean,
  intervalHours: number
) {
  const db = await knowledgeDb();
  const [source] = await db
    .select()
    .from(knowledgeSources)
    .where(eq(knowledgeSources.id, sourceId))
    .limit(1);
  if (!source) throw new Error("Knowledge Source 不存在");
  const cron = cronForHours(intervalHours);
  if (process.env.NODE_ENV === "development") {
    await db
      .update(knowledgeSources)
      .set({ syncIntervalHours: intervalHours, scheduleEnabled: 0 })
      .where(eq(knowledgeSources.id, sourceId));
    return { enabled: false, development: true };
  }
  let taskUid = source.scheduleCronTaskUid;
  if (enabled) {
    if (taskUid) {
      try {
        await updateHeartbeatJob(
          taskUid,
          { enable: true, cron, path: "/api/scheduled/knowledge-sync" },
          ""
        );
      } catch {
        taskUid = null;
      }
    }
    if (!taskUid)
      taskUid = (
        await createHeartbeatJob(
          {
            name: `knowledge-source-${sourceId}`,
            cron,
            path: "/api/scheduled/knowledge-sync",
            description: `每 ${intervalHours} 小时同步 Knowledge Source ${sourceId}`,
          },
          ""
        )
      ).taskUid;
  } else if (taskUid) {
    try {
      await updateHeartbeatJob(taskUid, { enable: false }, "");
    } catch {
      /* registry may have been rebuilt */
    }
  }
  await db
    .update(knowledgeSources)
    .set({
      scheduleEnabled: enabled ? 1 : 0,
      syncIntervalHours: intervalHours,
      scheduleCronTaskUid: taskUid,
    })
    .where(eq(knowledgeSources.id, sourceId));
  return { enabled, taskUid };
}

export async function restoreKnowledgeSchedules() {
  if (process.env.NODE_ENV === "development") return;
  const db = await knowledgeDb();
  const sources = await db
    .select()
    .from(knowledgeSources)
    .where(
      and(
        eq(knowledgeSources.scheduleEnabled, 1),
        eq(knowledgeSources.isEnabled, 1)
      )
    );
  for (const source of sources) {
    try {
      await configureKnowledgeSchedule(
        source.id,
        true,
        source.syncIntervalHours
      );
    } catch {
      console.warn(`[Knowledge] 恢复来源 ${source.id} 的周期同步失败`);
    }
  }
}

export function registerKnowledgeScheduledRoute(app: Express) {
  app.post("/api/scheduled/knowledge-sync", async (req, res) => {
    try {
      const identity = await sdk.authenticateRequest(req);
      if (!identity.isCron || !identity.taskUid) {
        res.status(403).json({ error: "cron-only" });
        return;
      }
      const db = await knowledgeDb();
      const [source] = await db
        .select()
        .from(knowledgeSources)
        .where(
          and(
            eq(knowledgeSources.scheduleCronTaskUid, identity.taskUid),
            eq(knowledgeSources.scheduleEnabled, 1),
            eq(knowledgeSources.isEnabled, 1)
          )
        )
        .limit(1);
      if (!source) {
        res.json({ skipped: "orphan-or-paused" });
        return;
      }
      try {
        await recoverKnowledgeStorage();
        res.json(await startKnowledgeSync(source.id, "scheduled"));
      } catch (error) {
        if (error instanceof KnowledgeSyncBusy) {
          res.json({ skipped: "busy" });
          return;
        }
        throw error;
      }
    } catch {
      res.status(500).json({ error: "Knowledge 调度失败" });
    }
  });
}
