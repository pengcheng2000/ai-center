import "dotenv/config";
import { FeishuPocError, runFeishuWikiPoc } from "./feishuPoc";

async function main() {
  const result = await runFeishuWikiPoc({
    appId: process.env.FEISHU_KNOWLEDGE_APP_ID ?? "",
    appSecret: process.env.FEISHU_KNOWLEDGE_APP_SECRET ?? "",
    nodeToken: process.argv[2],
  });
  const { content, ...metadata } = result;
  // 默认只输出验证结果；不打印 Secret、token 或企业正文。
  console.log(JSON.stringify({ success: true, ...metadata, contentCharacters: content.length }, null, 2));
}

void main().catch(error => {
  const safeError = error instanceof FeishuPocError
    ? { stage: error.stage, message: error.message, httpStatus: error.httpStatus, apiCode: error.apiCode }
    : { stage: "unknown", message: "POC 执行异常；未输出原始异常或凭证。" };
  console.error(JSON.stringify({ success: false, ...safeError }, null, 2));
  process.exitCode = 1;
});
