import { randomInt } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { resolveStoragePath, storageDelete } from "../storage";
import {
  discardStaged,
  finalizeStaged,
  RunStorageBudget,
  stageBytes,
  stageResponse,
  stagedFilesReady,
  StorageLimitError,
} from "./storage";

const runId = randomInt(1_000_000_000, 2_000_000_000);
const externalId = "storage-test";
const finalKeys: string[] = [];

afterEach(async () => {
  await discardStaged(runId, externalId);
  await Promise.all(finalKeys.splice(0).map(key => storageDelete(key)));
});

describe("Knowledge staged storage", () => {
  it("finalizes a staged snapshot under a stable key and preserves its bytes", async () => {
    const staged = await stageBytes(
      runId,
      externalId,
      "raw",
      "中文 snapshot",
      "application/json",
      new RunStorageBudget()
    );
    finalKeys.push(staged.finalKey);
    expect(await stagedFilesReady([staged])).toBe(false);
    await finalizeStaged([staged]);
    expect(await stagedFilesReady([staged])).toBe(true);
    expect(await readFile(resolveStoragePath(staged.finalKey), "utf8")).toBe(
      "中文 snapshot"
    );
  });

  it("streams binary data and records the actual size and hash", async () => {
    const staged = await stageResponse(
      runId,
      externalId,
      "attachment",
      new Response(Uint8Array.from([0, 1, 2, 3])),
      "application/octet-stream",
      new RunStorageBudget()
    );
    finalKeys.push(staged.finalKey);
    expect(staged.sizeBytes).toBe(4);
    expect(staged.sha256).toMatch(/^[a-f0-9]{64}$/);
    await finalizeStaged([staged]);
    expect([...(await readFile(resolveStoragePath(staged.finalKey)))]).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it("stops before writing when a file or run exceeds its byte budget", async () => {
    const budget = new RunStorageBudget(4, 6);
    await expect(
      stageBytes(runId, externalId, "oversize", "12345", "text/plain", budget)
    ).rejects.toMatchObject({
      reason: "single",
    } satisfies Partial<StorageLimitError>);
    const first = await stageBytes(
      runId,
      externalId,
      "small",
      "1234",
      "text/plain",
      budget
    );
    expect(first.sizeBytes).toBe(4);
    await expect(
      stageBytes(runId, externalId, "run-overflow", "123", "text/plain", budget)
    ).rejects.toMatchObject({
      reason: "run",
    } satisfies Partial<StorageLimitError>);
    expect(budget.usedBytes).toBe(4);
  });
});
