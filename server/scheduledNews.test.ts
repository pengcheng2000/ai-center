import type { Express, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), syncRssSourceById: vi.fn(), authenticateRequest: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./newsSync", () => ({ syncRssSourceById: mocks.syncRssSourceById }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mocks.authenticateRequest } }));

import { registerScheduledNewsRoutes, runScheduledRssSync } from "./scheduledNews";

describe("daily RSS scheduled sync", () => {
  it("syncs only an enabled source identified by the trusted schedule task id and writes its run status", async () => {
    const updates: unknown[] = [];
    mocks.getDb.mockResolvedValue({
      select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 30001, scheduleEnabled: 1, scheduleCronTaskUid: "task_aihot" }] }) }) })),
      update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: async () => { updates.push(value); } })) })),
    });
    mocks.syncRssSourceById.mockResolvedValue({ success: true, sourceId: 30001, sourceName: "AIHOT 全文", fetched: 37, created: 1, updated: 0, skipped: 36 });
    await expect(runScheduledRssSync("task_aihot")).resolves.toMatchObject({ ok: true, sourceId: 30001, created: 1 });
    expect(mocks.syncRssSourceById).toHaveBeenCalledWith(30001, 50);
    expect(updates).toEqual([expect.objectContaining({ scheduleLastRunAt: expect.any(Date), scheduleLastError: null })]);
  });

  it("skips paused or missing jobs without pulling RSS content", async () => {
    mocks.syncRssSourceById.mockClear();
    mocks.getDb.mockResolvedValue({ select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 30001, scheduleEnabled: 0, scheduleCronTaskUid: "task_paused" }] }) }) })) });
    await expect(runScheduledRssSync("task_paused")).resolves.toEqual({ ok: true, skipped: "orphan-or-paused" });
    expect(mocks.syncRssSourceById).not.toHaveBeenCalled();
  });

  it("rejects non-cron HTTP calls before any scheduled source lookup", async () => {
    let handler: ((req: Request, res: Response) => Promise<unknown>) | undefined;
    registerScheduledNewsRoutes({ post: vi.fn((_path: string, callback: (req: Request, res: Response) => Promise<unknown>) => { handler = callback; }) } as unknown as Express);
    mocks.authenticateRequest.mockResolvedValue({ isCron: false });
    const response = { status: vi.fn(() => response), json: vi.fn() } as unknown as Response;
    await handler!({} as Request, response);
    expect((response.status as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(403);
    expect((response.json as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ error: "cron-only" });
  });
});
