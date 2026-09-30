import { eq } from "drizzle-orm";
import { knowledgeAssets } from "../../drizzle/schema";
import { signedKnowledgeAssetUrl } from "./assetRoute";
import { knowledgeDb } from "./repository";

export async function renderKnowledgeVersion<
  T extends { id: number; bodyMarkdown: string | null },
>(content: T, userId: number, publicationId = -1) {
  const db = await knowledgeDb();
  const assets = await db
    .select()
    .from(knowledgeAssets)
    .where(eq(knowledgeAssets.contentId, content.id));
  const byRef = new Map(
    assets.map(asset => [
      asset.assetRef,
      signedKnowledgeAssetUrl(asset.id, userId, publicationId),
    ])
  );
  const markdown =
    content.bodyMarkdown?.replace(
      /knowledge-asset:([a-zA-Z0-9_-]+)/g,
      (_, ref: string) => byRef.get(ref) ?? ""
    ) ?? null;
  return {
    ...content,
    bodyMarkdown: markdown,
    assets: assets.map(asset => ({
      id: asset.id,
      assetRef: asset.assetRef,
      kind: asset.kind,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      url: signedKnowledgeAssetUrl(asset.id, userId, publicationId),
    })),
  };
}
