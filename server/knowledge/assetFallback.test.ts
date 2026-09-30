import { randomInt } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { FeishuClient, FeishuError } from "./feishu/client";
import { discardStaged, RunStorageBudget, StorageLimitError } from "./storage";
import { stageAssets } from "./sync/syncKnowledgeSource";

const runId = randomInt(1_000_000_000, 2_000_000_000);
const request = (token: string) => ({
  token,
  assetRef: token,
  kind: "inline_image" as const,
  fileName: token + ".png",
  mimeType: "image/png",
});
afterEach(() => discardStaged(runId, "fallback-test"));
describe("optional knowledge asset failures", () => {
  it("retains successful assets when another image is forbidden", async () => {
    const client = {
      binary: async (path: string) => {
        if (path.includes("blocked"))
          throw new FeishuError("image_download", 403);
        return new Response(new Uint8Array([1, 2]), {
          headers: { "content-type": "image/png", "content-length": "2" },
        });
      },
    } as unknown as FeishuClient;
    const result = await stageAssets(
      client,
      [request("available"), request("blocked")],
      runId,
      "fallback-test",
      new RunStorageBudget()
    );
    expect(result.assets.map(a => a.request.token)).toEqual(["available"]);
    expect(result.missing).toEqual({ missing_image: 1 });
  });
  it("rejects oversized optional files before streaming their body", async () => {
    const client = {
      binary: async () =>
        new Response("data", {
          headers: { "content-length": String(100 * 1024 * 1024) },
        }),
    } as unknown as FeishuClient;
    const budget = new RunStorageBudget();
    const result = await stageAssets(
      client,
      [request("large")],
      runId,
      "fallback-test",
      budget
    );
    expect(result.assets).toHaveLength(0);
    expect(result.missing).toEqual({ missing_image: 1, asset_budget: 1 });
    expect(budget.usedBytes).toBe(0);
  });
  it("does not hide a genuine disk failure as a missing image", async () => {
    const client = {
      binary: async () => {
        throw new StorageLimitError("free_space");
      },
    } as unknown as FeishuClient;
    await expect(
      stageAssets(
        client,
        [request("disk")],
        runId,
        "fallback-test",
        new RunStorageBudget()
      )
    ).rejects.toMatchObject({ reason: "free_space" });
  });
});
