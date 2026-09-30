import { createHash } from "node:crypto";
import { FeishuClient, FeishuError } from "./feishu/client";

export const DEFAULT_WIKI_NODE = "IDAtwKn8TiaaGLkucKycZAOgn1e";
type Stage = "config" | "auth" | "node" | "content";
type JsonObject = Record<string, unknown>;

export class FeishuPocError extends Error {
  constructor(
    public readonly stage: Stage,
    message: string,
    public readonly httpStatus?: number,
    public readonly apiCode?: number,
  ) {
    // 不携带服务端 msg、响应体、网络异常或凭证，避免日志泄露。
    super(message);
    this.name = "FeishuPocError";
  }
}

function object(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const stageErrors: Record<Exclude<Stage, "config">, string> = {
  auth: "飞书鉴权失败；请检查新应用凭证与应用状态。",
  node: "Wiki 节点读取失败；请检查已发布权限和目标节点的应用阅读授权。",
  content: "文档正文读取失败；请检查已发布文档权限与实际文档阅读授权。",
};

export type FeishuPocConfig = {
  appId: string;
  appSecret: string;
  nodeToken?: string;
};

export type FeishuPocResult = {
  spaceId: string;
  nodeToken: string;
  parentNodeToken: string | null;
  objType: "docx";
  objToken: string;
  title: string;
  contentFormat: "plain";
  content: string;
  contentHash: string;
};

/** 单篇后端验证，不写数据库、不遍历空间、不发布内容。 */
export async function runFeishuWikiPoc(
  config: FeishuPocConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<FeishuPocResult> {
  const nodeToken = config.nodeToken ?? DEFAULT_WIKI_NODE;
  if (!/^cli_[A-Za-z0-9]+$/.test(config.appId) || !nonEmpty(config.appSecret)) {
    throw new FeishuPocError("config", "请设置 FEISHU_KNOWLEDGE_APP_ID 与 FEISHU_KNOWLEDGE_APP_SECRET。不会回退使用其他应用凭证。");
  }
  if (!/^[A-Za-z0-9]{1,128}$/.test(nodeToken)) {
    throw new FeishuPocError("config", "Wiki 节点 token 格式无效，请传入节点 token 而非完整 URL。");
  }

  const client = new FeishuClient(config.appId, config.appSecret, fetchImpl);
  async function request(stage: Exclude<Stage, "config">, path: string) {
    try { return await client.json(path, stage); }
    catch (error) {
      if (error instanceof FeishuError) {
        const actualStage = error.stage === "auth" ? "auth" : stage;
        throw new FeishuPocError(actualStage, stageErrors[actualStage], error.httpStatus, error.apiCode);
      }
      throw new FeishuPocError(stage, `${stageErrors[stage]}请求异常。`);
    }
  }
  const query = new URLSearchParams({ token: nodeToken, obj_type: "wiki" });
  const nodeData = await request("node", `/open-apis/wiki/v2/spaces/get_node?${query}`);
  const node = object(nodeData.node);
  if (!nonEmpty(node.space_id) || !nonEmpty(node.node_token) || !nonEmpty(node.obj_token) || !nonEmpty(node.obj_type) || !nonEmpty(node.title)) {
    throw new FeishuPocError("node", "Wiki 节点响应缺少空间、节点、文档类型、文档 token 或标题；未宣称读取成功。");
  }
  if (node.obj_type !== "docx") {
    throw new FeishuPocError("content", "节点已解析，但单篇 POC 暂只支持 Docx 正文；需按实际类型补充 Reader，不能按 Docx 猜测读取。");
  }
  const contentData = await request("content", `/open-apis/docx/v1/documents/${encodeURIComponent(node.obj_token)}/raw_content`);
  if (!nonEmpty(contentData.content)) {
    throw new FeishuPocError("content", "文档返回空正文；未宣称 POC 成功。");
  }
  return {
    spaceId: node.space_id,
    nodeToken: node.node_token,
    parentNodeToken: nonEmpty(node.parent_node_token) ? node.parent_node_token : null,
    objType: "docx",
    objToken: node.obj_token,
    title: node.title,
    contentFormat: "plain",
    content: contentData.content,
    contentHash: createHash("sha256").update(contentData.content, "utf8").digest("hex"),
  };
}
