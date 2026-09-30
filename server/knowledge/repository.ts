import { and, eq } from "drizzle-orm";
import { knowledgeSources } from "../../drizzle/schema";
import { getDb } from "../db";

export const DEFAULT_KNOWLEDGE_SPACE_ID = "7504978450990710788";

export async function knowledgeDb() {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用");
  return db;
}

/** Idempotent seed; it never starts a sync or grants employee access. */
export async function ensureDefaultKnowledgeSource() {
  const db = await knowledgeDb();
  const [existing] = await db
    .select()
    .from(knowledgeSources)
    .where(
      and(
        eq(knowledgeSources.connectorKey, "feishu_wiki"),
        eq(knowledgeSources.externalId, DEFAULT_KNOWLEDGE_SPACE_ID)
      )
    )
    .limit(1);
  if (existing) return existing;
  await db
    .insert(knowledgeSources)
    .values({
      connectorKey: "feishu_wiki",
      externalId: DEFAULT_KNOWLEDGE_SPACE_ID,
      name: "AI应用知识库",
      config: { spaceId: DEFAULT_KNOWLEDGE_SPACE_ID },
      credentialRef: "FEISHU_KNOWLEDGE_APP_ID",
    })
    .onDuplicateKeyUpdate({ set: { name: "AI应用知识库" } });
  const [created] = await db
    .select()
    .from(knowledgeSources)
    .where(
      and(
        eq(knowledgeSources.connectorKey, "feishu_wiki"),
        eq(knowledgeSources.externalId, DEFAULT_KNOWLEDGE_SPACE_ID)
      )
    )
    .limit(1);
  if (!created) throw new Error("Knowledge Source 初始化失败");
  return created;
}
