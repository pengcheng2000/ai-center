import { describe, expect, it, vi } from "vitest";
import { DEFAULT_WIKI_NODE, FeishuPocError, runFeishuWikiPoc } from "./feishuPoc";

const config = { appId: "cli_poctest", appSecret: "test-secret-must-not-leak" };
const token = "test-access-token-must-not-leak";
const node = { space_id: "space-1", node_token: DEFAULT_WIKI_NODE, obj_type: "docx", obj_token: "document-1", title: "企业案例", parent_node_token: "parent-1" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function reader(...responses: Response[]) {
  return vi.fn<typeof fetch>().mockImplementation(async () => {
    const response = responses.shift();
    if (!response) throw new Error("unexpected request");
    return response;
  });
}

describe("Feishu single-document POC", () => {
  it("uses new app credentials, resolves the wiki node, then reads its actual Docx token", async () => {
    const request = reader(json({ code: 0, tenant_access_token: token }), json({ code: 0, data: { node } }), json({ code: 0, data: { content: "标题\n真实案例正文" } }));
    const result = await runFeishuWikiPoc(config, request);
    expect(result).toMatchObject({ spaceId: "space-1", objToken: "document-1", title: "企业案例", content: "标题\n真实案例正文", contentFormat: "plain" });
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(request.mock.calls[0][1]?.body as string)).toEqual({ app_id: config.appId, app_secret: config.appSecret });
    expect(request.mock.calls[1][0]).toContain(`token=${DEFAULT_WIKI_NODE}&obj_type=wiki`);
    expect(request.mock.calls[2][0]).toBe("https://open.feishu.cn/open-apis/docx/v1/documents/document-1/raw_content");
    expect(request.mock.calls[2][1]).toMatchObject({ headers: { Authorization: `Bearer ${token}` }, redirect: "error" });
  });

  it("does not issue requests when dedicated credentials or node token are invalid", async () => {
    const request = reader();
    await expect(runFeishuWikiPoc({ appId: "", appSecret: "" }, request)).rejects.toMatchObject({ stage: "config" });
    await expect(runFeishuWikiPoc({ ...config, nodeToken: "https://example.com/wiki" }, request)).rejects.toMatchObject({ stage: "config" });
    expect(request).not.toHaveBeenCalled();
  });

  it("stops on a nonzero API code even when HTTP succeeds and omits upstream secrets", async () => {
    const request = reader(json({ code: 0, tenant_access_token: token }), json({ code: 99991672, msg: `${config.appSecret} ${token}` }));
    const error = await runFeishuWikiPoc(config, request).catch(error => error as FeishuPocError);
    expect(error).toMatchObject({ stage: "node", httpStatus: 200, apiCode: 99991672 });
    expect(String(error)).not.toContain(config.appSecret);
    expect(String(error)).not.toContain(token);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("distinguishes document resource authorization failures", async () => {
    const request = reader(json({ code: 0, tenant_access_token: token }), json({ code: 0, data: { node } }), json({ code: 1770032, msg: "forbidden" }, 403));
    await expect(runFeishuWikiPoc(config, request)).rejects.toMatchObject({ stage: "content", httpStatus: 403, apiCode: 1770032 });
  });

  it("does not guess a Docx reader for a Sheet or incomplete node", async () => {
    for (const nodeValue of [{ ...node, obj_type: "sheet" }, { ...node, obj_token: undefined }]) {
      const request = reader(json({ code: 0, tenant_access_token: token }), json({ code: 0, data: { node: nodeValue } }));
      await expect(runFeishuWikiPoc(config, request)).rejects.toBeInstanceOf(FeishuPocError);
      expect(request).toHaveBeenCalledTimes(2);
    }
  });

  it("does not report success for an empty body or malformed authentication response", async () => {
    const empty = reader(json({ code: 0, tenant_access_token: token }), json({ code: 0, data: { node } }), json({ code: 0, data: { content: " " } }));
    await expect(runFeishuWikiPoc(config, empty)).rejects.toMatchObject({ stage: "content" });
    const malformed = reader(new Response("not JSON"));
    await expect(runFeishuWikiPoc(config, malformed)).rejects.toMatchObject({ stage: "auth" });
  });

  it("redacts network exceptions and applies a timeout signal", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      throw new Error(`network details ${config.appSecret}`);
    });
    const error = await runFeishuWikiPoc(config, request).catch(error => error as FeishuPocError);
    expect(error).toMatchObject({ stage: "auth" });
    expect(String(error)).not.toContain(config.appSecret);
  });
});
