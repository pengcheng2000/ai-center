import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { sdk } from "./sdk";

export type HeartbeatJob = {
  name: string;
  /**
   * 6-field cron with seconds (`sec min hour dom mon dow`), evaluated in UTC,
   * min interval 60s. Use `0` for the seconds field — e.g. `"0 0 1 * * *"`
   * is daily 01:00 UTC (= 09:00 UTC+8).
   */
  cron: string;
  /** Callback path. MUST start with `/api/scheduled/`. */
  path: string;
  method?: "POST" | "PUT";
  payload?: unknown;
  description?: string;
};

/**
 * Update patch. All fields optional; unset = leave unchanged.
 * `enable`: true = resume, false = pause; omit = unchanged.
 * `name` is the unique key of a job and cannot be changed.
 */
export type HeartbeatJobUpdate = Partial<Omit<HeartbeatJob, "name">> & {
  enable?: boolean;
};

export type HeartbeatJobInfo = {
  taskUid: string;
  name: string;
  description: string;
  cronExpression: string;
  callbackPath: string;
  callbackMethod: string;
  callbackPayload: string;
  isEnable: boolean;
  createdAt?: string | null;
  lastExecutedAt?: string | null;
  nextExecutionAt?: string | null;
};

type RegistryEntry = {
  taskUid: string;
  job: HeartbeatJob;
  enabled: boolean;
  timer: NodeJS.Timeout | null;
  nextExecutionAt: Date | null;
  lastExecutedAt: Date | null;
};

// 本地进程内调度注册表。定时任务随服务重启而丢失，
// 由业务侧（如 scheduledNews.restoreScheduledRssSyncJobs）在启动时重建。
const registry = new Map<string, RegistryEntry>();

const MAX_TIMEOUT_MS = 2 ** 31 - 1;

// ---------------------------------------------------------------------------
// 最小 6 段 cron 解析：支持 * 、数字、列表、区间（a-b）与步长（/n），UTC 语义。
// ---------------------------------------------------------------------------

type CronFields = {
  sec: Set<number>;
  min: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  mon: Set<number>;
  dow: Set<number>;
  domWildcard: boolean;
  dowWildcard: boolean;
};

function parseField(expr: string, min: number, max: number, label: string): Set<number> {
  const values = new Set<number>();
  for (const part of expr.split(",")) {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart !== undefined ? Number.parseInt(stepPart, 10) : 1;
    if (!Number.isInteger(step) || step <= 0) {
      throw new Error(`cron 字段 ${label} 的步长非法：${part}`);
    }
    let lo = min;
    let hi = max;
    if (rangePart !== "*") {
      const bounds = rangePart.split("-").map(value => Number.parseInt(value, 10));
      if (!Number.isInteger(bounds[0])) {
        throw new Error(`cron 字段 ${label} 非法：${part}`);
      }
      lo = bounds[0];
      hi = Number.isInteger(bounds[1]) ? bounds[1] : bounds[0];
    }
    if (lo < min || hi > max || lo > hi) {
      throw new Error(`cron 字段 ${label} 超出范围 ${min}-${max}：${part}`);
    }
    for (let value = lo; value <= hi; value += step) values.add(value);
  }
  if (values.size === 0) {
    throw new Error(`cron 字段 ${label} 为空：${expr}`);
  }
  return values;
}

function isWildcard(expr: string): boolean {
  return expr === "*" || expr.startsWith("*/");
}

export function parseCronExpression(expr: string): CronFields {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 6) {
    throw new Error(`cron 必须为 6 段（秒 分 时 日 月 周）：${expr}`);
  }
  const dow = parseField(fields[5], 0, 7, "周");
  if (dow.has(7)) {
    dow.delete(7);
    dow.add(0); // 0 与 7 都表示周日
  }
  return {
    sec: parseField(fields[0], 0, 59, "秒"),
    min: parseField(fields[1], 0, 59, "分"),
    hour: parseField(fields[2], 0, 23, "时"),
    dom: parseField(fields[3], 1, 31, "日"),
    mon: parseField(fields[4], 1, 12, "月"),
    dow,
    domWildcard: isWildcard(fields[3]),
    dowWildcard: isWildcard(fields[5]),
  };
}

function nextFireDate(cron: CronFields, from: Date): Date | null {
  const hours = [...cron.hour].sort((a, b) => a - b);
  const minutes = [...cron.min].sort((a, b) => a - b);
  const seconds = [...cron.sec].sort((a, b) => a - b);

  for (let dayOffset = 0; dayOffset <= 366; dayOffset++) {
    const day = new Date(from);
    day.setUTCDate(day.getUTCDate() + dayOffset);
    if (!cron.mon.has(day.getUTCMonth() + 1)) continue;

    const domMatch = cron.dom.has(day.getUTCDate());
    const dowMatch = cron.dow.has(day.getUTCDay());
    const dayOk =
      cron.domWildcard && cron.dowWildcard
        ? true
        : cron.domWildcard
          ? dowMatch
          : cron.dowWildcard
            ? domMatch
            : domMatch || dowMatch;
    if (!dayOk) continue;

    for (const h of hours) {
      for (const m of minutes) {
        for (const s of seconds) {
          const candidate = new Date(
            Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m, s)
          );
          if (candidate > from) return candidate;
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 本地调度执行：到点后携带本地签发的 cron 会话令牌回调本机 /api/scheduled/*。
// ---------------------------------------------------------------------------

async function fire(entry: RegistryEntry): Promise<void> {
  // 先排下一次，再执行本次，保证回调失败不影响后续调度。
  armTimer(entry);
  entry.lastExecutedAt = new Date();
  try {
    const token = await sdk.createCronSessionToken(entry.taskUid);
    const port = process.env.PORT || "3000";
    const url = `http://127.0.0.1:${port}${entry.job.path}`;
    const response = await fetch(url, {
      method: entry.job.method ?? "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(entry.job.payload ?? {}),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(`[Heartbeat] ${entry.job.name} 回调失败 (${response.status})${detail ? `: ${detail}` : ""}`);
    } else {
      console.log(`[Heartbeat] ${entry.job.name} 回调成功`);
    }
  } catch (error) {
    console.warn(`[Heartbeat] ${entry.job.name} 回调异常:`, error);
  }
}

function armTimer(entry: RegistryEntry): void {
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  if (!entry.enabled) {
    entry.nextExecutionAt = null;
    return;
  }
  try {
    const next = nextFireDate(parseCronExpression(entry.job.cron), new Date());
    if (!next) {
      entry.nextExecutionAt = null;
      return;
    }
    entry.nextExecutionAt = next;
    const delay = Math.min(Math.max(next.getTime() - Date.now(), 0), MAX_TIMEOUT_MS);
    const timer = setTimeout(() => void fire(entry), delay);
    timer.unref?.();
    entry.timer = timer;
  } catch (error) {
    console.warn(`[Heartbeat] ${entry.job.name} cron 解析失败:`, error);
    entry.nextExecutionAt = null;
  }
}

const validateCallbackPath = (path: string): void => {
  if (!path || !path.startsWith("/api/scheduled/")) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "callback path must start with /api/scheduled/",
    });
  }
};

const stringifyPayload = (payload: unknown): string => {
  if (payload === undefined || payload === null) return "{}";
  if (typeof payload === "string") return payload;
  return JSON.stringify(payload);
};

/**
 * Register a local scheduled job. Returns the assigned `taskUid` to persist
 * on your business row so callbacks can dereference it.
 */
export async function createHeartbeatJob(
  job: HeartbeatJob,
  _userSession?: string
): Promise<{ taskUid: string; nextExecutionAt?: string | null }> {
  validateCallbackPath(job.path);
  // 同名任务只保留最新注册，保证重复注册幂等。
  for (const [existingUid, existing] of registry) {
    if (existing.job.name === job.name) {
      deleteHeartbeatJob(existingUid);
    }
  }
  const taskUid = `local_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const entry: RegistryEntry = {
    taskUid,
    job,
    enabled: true,
    timer: null,
    nextExecutionAt: null,
    lastExecutedAt: null,
  };
  registry.set(taskUid, entry);
  armTimer(entry);
  return { taskUid, nextExecutionAt: entry.nextExecutionAt?.toISOString() ?? null };
}

/**
 * Update an existing local job located by `taskUid`. Only fields you pass in
 * `patch` are mutated. `enable` flips resume/pause; omit to leave alone.
 */
export async function updateHeartbeatJob(
  taskUid: string,
  patch: HeartbeatJobUpdate,
  _userSession?: string
): Promise<{ nextExecutionAt?: string | null }> {
  const entry = registry.get(taskUid);
  if (!entry) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Heartbeat job not found: ${taskUid}`,
    });
  }
  if (patch.path !== undefined) validateCallbackPath(patch.path);
  if (patch.cron !== undefined) entry.job.cron = patch.cron;
  if (patch.path !== undefined) entry.job.path = patch.path;
  if (patch.method !== undefined) entry.job.method = patch.method;
  if (patch.payload !== undefined) entry.job.payload = patch.payload;
  if (patch.description !== undefined) entry.job.description = patch.description;
  if (patch.enable !== undefined) entry.enabled = patch.enable;
  armTimer(entry);
  return { nextExecutionAt: entry.nextExecutionAt?.toISOString() ?? null };
}

/** Delete a local job located by `taskUid`. Idempotent on caller side. */
export async function deleteHeartbeatJob(
  taskUid: string,
  _userSession?: string
): Promise<void> {
  const entry = registry.get(taskUid);
  if (entry?.timer) clearTimeout(entry.timer);
  registry.delete(taskUid);
}

/**
 * List local jobs registered in this process.
 */
export async function listHeartbeatJobs(
  _userSession?: string,
  pagination?: { page?: number; pageSize?: number }
): Promise<{ total: number; jobs: HeartbeatJobInfo[] }> {
  const jobs = [...registry.values()].map(entry => ({
    taskUid: entry.taskUid,
    name: entry.job.name,
    description: entry.job.description ?? "",
    cronExpression: entry.job.cron,
    callbackPath: entry.job.path,
    callbackMethod: entry.job.method ?? "POST",
    callbackPayload: stringifyPayload(entry.job.payload),
    isEnable: entry.enabled,
    createdAt: null,
    lastExecutedAt: entry.lastExecutedAt?.toISOString() ?? null,
    nextExecutionAt: entry.nextExecutionAt?.toISOString() ?? null,
  }));
  const page = pagination?.page ?? 1;
  const pageSize = pagination?.pageSize ?? (jobs.length || 1);
  return {
    total: jobs.length,
    jobs: jobs.slice((page - 1) * pageSize, page * pageSize),
  };
}
