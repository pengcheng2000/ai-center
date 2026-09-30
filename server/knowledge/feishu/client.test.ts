import { describe, expect, it, vi } from "vitest";
import { FeishuClient, FeishuError } from "./client";

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("Feishu Knowledge client", () => {
  it("reuses a tenant token and only sends read requests to OpenAPI", async () => {
    const replies = [
      response({
        code: 0,
        tenant_access_token: "tenant-test-token",
        expire: 7200,
      }),
      response({ code: 0, data: { one: 1 } }),
      response({ code: 0, data: { two: 2 } }),
    ];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => replies.shift()!);
    const client = new FeishuClient("cli_test", "private-secret", fetcher);
    expect(
      await client.json("/open-apis/wiki/v2/spaces/space/nodes", "directory")
    ).toEqual({ one: 1 });
    expect(
      await client.json(
        "/open-apis/wiki/v2/spaces/space/nodes?page_token=next",
        "directory"
      )
    ).toEqual({ two: 2 });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(
      fetcher.mock.calls
        .slice(1)
        .every(([, options]) => options?.method === "GET")
    ).toBe(true);
    expect(fetcher.mock.calls[2][1]?.headers).toMatchObject({
      Authorization: "Bearer tenant-test-token",
    });
  });

  it("reports upstream errors without including credentials or response messages", async () => {
    const secret = "do-not-log-this-secret";
    const replies = [
      response({ code: 0, tenant_access_token: "tenant-test-token" }),
      response({ code: 131006, msg: secret }, 403),
    ];
    const client = new FeishuClient(
      "cli_test",
      secret,
      vi.fn<typeof fetch>().mockImplementation(async () => replies.shift()!)
    );
    const error = await client
      .json("/open-apis/wiki/v2/spaces/space/nodes", "directory")
      .catch(value => value as FeishuError);
    expect(error).toMatchObject({
      stage: "directory",
      httpStatus: 403,
      apiCode: 131006,
    });
    expect(String(error)).not.toContain(secret);
    expect(String(error)).not.toContain("tenant-test-token");
  });
});
