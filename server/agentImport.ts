import { createHash, randomBytes } from "crypto";
import { lookup } from "dns/promises";
import type { Express, Request } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { agentImportAssets, agentImportJobs, agentImportKeys, courseMaterials, courses, newsItems, newsSources, skillPackages } from "../drizzle/schema";
import { getDb } from "./db";
import { storagePut } from "./storage";

export const AGENT_IMPORT_TARGETS = ["news", "course_material", "skill"] as const;
export type AgentImportTarget = (typeof AGENT_IMPORT_TARGETS)[number];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 8 * 1024 * 1024;
const REMOTE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
const UPLOAD_TYPES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/markdown", "text/plain", "application/zip", "application/x-zip-compressed", ...REMOTE_IMAGE_TYPES] as const;

export const agentNewsPayloadSchema = z.object({
  title: z.string().trim().min(2).max(240), summary: z.string().trim().min(8).max(1_200), contentMarkdown: z.string().trim().min(40).max(50_000), category: z.string().trim().min(2).max(80), tags: z.array(z.string().trim().min(1).max(48)).max(12).default([]), publishedAt: z.string().datetime().optional(),
}).strict();
export const agentCoursePayloadSchema = z.object({
  courseId: z.number().int().positive(), title: z.string().trim().min(2).max(180), description: z.string().trim().max(2_000).optional(), materialType: z.enum(["document", "video", "practice"]).default("document"), contentMarkdown: z.string().trim().max(20_000).optional(), sourceUrl: z.string().url().max(600).optional(), assetId: z.number().int().positive().optional(), orderIndex: z.number().int().min(0).max(999).default(0), config: z.record(z.string(), z.unknown()).default({}),
}).strict();
export const agentSkillPayloadSchema = z.object({
  skillKey: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/), name: z.string().trim().min(2).max(120), summary: z.string().trim().min(8).max(360), description: z.string().trim().min(20).max(12_000), category: z.string().trim().min(2).max(80), tags: z.array(z.string().trim().min(1).max(48)).max(12), version: z.string().trim().min(1).max(40), skillMd: z.string().trim().min(20).max(60_000), usageGuide: z.string().trim().min(20).max(12_000), packageAssetId: z.number().int().positive(),
}).strict();

export function issueAgentImportToken() {
  const token = `aeh_imp_${randomBytes(32).toString("base64url")}`;
  return { token, tokenPrefix: token.slice(0, 20), tokenHash: hashAgentImportToken(token) };
}
export function hashAgentImportToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function sanitizeImportedMarkdown(value: string) { return value.replace(/<[^>]*>/g, "").replace(/\]\(\s*(?:javascript|data):[^)]*\)/gi, "](链接已移除)").replace(/\u0000/g, "").trim(); }
export function safeFileName(value: string) { return value.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_").slice(0, 160) || "imported-asset"; }
export function isSafeExternalLink(value: string) { try { const url = new URL(value); const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, ""); return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password && hostname !== "localhost" && !hostname.endsWith(".localhost") && !hostname.endsWith(".local") && !isPrivateAddress(hostname); } catch { return false; } }
const externalLink = z.string().url().max(800).refine(isSafeExternalLink, "来源链接仅支持不含凭据的公网 HTTP(S) 地址");

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase(); if (normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  const ipv4 = normalized.startsWith("::ffff:") ? normalized.slice(7) : normalized; const parts = ipv4.split(".").map(Number);
  return parts.length === 4 && !parts.some(Number.isNaN) && (parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)));
}
async function assertPublicHttpUrl(value: string) {
  let url: URL; try { url = new URL(value); } catch { throw new Error("资源地址无效"); }
  if (!(url.protocol === "https:" || url.protocol === "http:") || url.username || url.password) throw new Error("仅支持不含凭据的 HTTP(S) 资源地址");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, ""); if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || isPrivateAddress(hostname)) throw new Error("资源地址不能指向本地或内网");
  const addresses = await lookup(hostname, { all: true, verbatim: true }).catch(() => { throw new Error("资源域名无法解析"); });
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) throw new Error("资源地址不能解析到本地或内网"); return url;
}
function imageMimeFromBytes(buffer: Buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a") return "image/gif";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}
export async function fetchPublicImage(sourceUrl: string) {
  let current = await assertPublicHttpUrl(sourceUrl); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const response = await fetch(current, { redirect: "manual", signal: controller.signal, headers: { accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" } });
      if (response.status >= 300 && response.status < 400) { const location = response.headers.get("location"); if (!location) throw new Error("图片重定向缺少目标地址"); current = await assertPublicHttpUrl(new URL(location, current).toString()); continue; }
      if (!response.ok) throw new Error(`图片服务返回 ${response.status}`);
      const declared = Number(response.headers.get("content-length") ?? 0); if (declared > MAX_IMAGE_BYTES) throw new Error("图片超过 5MB 上限");
      const buffer = Buffer.from(await response.arrayBuffer()); if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error("图片为空或超过 5MB 上限");
      const mimeType = imageMimeFromBytes(buffer); if (!mimeType) throw new Error("远程资源不是支持的 PNG、JPEG、WebP 或 GIF 图片");
      return { buffer, mimeType, finalUrl: current.toString() };
    }
    throw new Error("图片重定向次数超过上限");
  } catch (error) { if (error instanceof Error && error.name === "AbortError") throw new Error("图片下载超时，请稍后重试"); throw error; } finally { clearTimeout(timeout); }
}

function extractBearer(req: Request) { const value = req.header("authorization") ?? ""; return value.startsWith("Bearer ") ? value.slice(7).trim() : ""; }
async function authenticate(req: Request) {
  const token = extractBearer(req); if (!token.startsWith("aeh_imp_") || token.length < 30) return null;
  const db = await getDb(); if (!db) return null;
  const [key] = await db.select().from(agentImportKeys).where(eq(agentImportKeys.tokenHash, hashAgentImportToken(token))).limit(1);
  if (!key || !key.isEnabled || key.revokedAt || (key.expiresAt && key.expiresAt.getTime() <= Date.now())) return null;
  await db.update(agentImportKeys).set({ lastUsedAt: new Date() }).where(eq(agentImportKeys.id, key.id)); return { db, key };
}
function decodeUpload(dataUrl: string, mimeType: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/); if (!match || match[1] !== mimeType) throw new Error("上传数据格式或 MIME 类型不匹配");
  const buffer = Buffer.from(match[2], "base64"); const max = mimeType.includes("zip") ? MAX_PACKAGE_BYTES : MAX_FILE_BYTES;
  if (!buffer.length || buffer.length > max) throw new Error(`上传文件为空或超过 ${max / 1024 / 1024}MB 上限`);
  if (mimeType.includes("zip") && buffer.subarray(0, 2).toString("ascii") !== "PK") throw new Error("上传文件不是有效的 ZIP 安装包");
  if (mimeType.startsWith("image/") && imageMimeFromBytes(buffer) !== mimeType) throw new Error("图片 MIME 类型与文件内容不匹配"); return buffer;
}
function asObject(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
async function assertOwnedAssets(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, keyId: number, assetIds: number[]) {
  if (!assetIds.length) return [];
  const assets = await db.select().from(agentImportAssets).where(and(eq(agentImportAssets.importKeyId, keyId), inArray(agentImportAssets.id, assetIds)));
  if (assets.length !== new Set(assetIds).size) throw new Error("存在不属于当前导入令牌的媒体或附件"); return assets;
}
export function replaceAssetTokens(markdown: string, assets: Array<{ id: number; storageUrl: string; assetType: string }>) {
  const assetMap = new Map(assets.map(asset => [asset.id, asset])); const referenced = new Set<number>();
  const content = markdown.replace(/\{\{asset:(\d+)\}\}/g, (_, id: string) => { const asset = assetMap.get(Number(id)); if (!asset || asset.assetType !== "image") throw new Error("正文引用了不存在或非图片类型的媒体资产"); referenced.add(asset.id); return asset.storageUrl; });
  if (/!\[[^\]]*\]\(\s*https?:\/\//i.test(content)) throw new Error("正文图片必须先通过平台代理下载并使用 {{asset:ID}} 占位符引用"); return { content, referencedAssetIds: Array.from(referenced) };
}
export async function applyAgentImportJob(jobId: number, reviewerId: number, reviewNote: string) {
  const db = await getDb(); if (!db) throw new Error("数据库暂不可用");
  const [job] = await db.select().from(agentImportJobs).where(eq(agentImportJobs.id, jobId)).limit(1); if (!job) throw new Error("导入批次不存在"); if (job.status !== "pending_review") throw new Error("该导入批次已处理，不能重复应用");
  const [key] = await db.select().from(agentImportKeys).where(eq(agentImportKeys.id, job.importKeyId)).limit(1); if (!key) throw new Error("导入服务账号不存在"); const assetIds = Array.isArray(job.assetIds) ? job.assetIds : []; const assets = await assertOwnedAssets(db, key.id, assetIds);
  let resultType = ""; let resultId = 0;
  if (job.targetType === "news") {
    const payload = agentNewsPayloadSchema.parse(job.payload); const article = replaceAssetTokens(payload.contentMarkdown, assets); const [source] = await db.select({ id: newsSources.id }).from(newsSources).where(eq(newsSources.name, "Agent 导入草稿")).limit(1); let sourceId = source?.id;
    if (!sourceId) { const [created] = await db.insert(newsSources).values({ name: "Agent 导入草稿", url: "https://platform.local/agent-import", sourceType: "manual", category: "Agent 导入", description: "外部 Agent 受控草稿来源", isEnabled: 1 }).$returningId(); sourceId = created.id; }
    const [created] = await db.insert(newsItems).values({ sourceId, title: payload.title, summary: payload.summary, content: article.content, sourceUrl: job.sourceUrl, category: payload.category, tags: payload.tags, reviewStatus: "pending", riskLevel: "low", publishedAt: payload.publishedAt ? new Date(payload.publishedAt) : null }).$returningId(); resultType = "news"; resultId = created.id;
  } else if (job.targetType === "course_material") {
    const payload = agentCoursePayloadSchema.parse(job.payload); const [course] = await db.select({ lifecycleStatus: courses.lifecycleStatus }).from(courses).where(eq(courses.id, payload.courseId)).limit(1); if (!course) throw new Error("目标课程不存在"); if (course.lifecycleStatus === "published") throw new Error("Agent 导入资源只能应用到草稿课程，避免未审核内容直接对员工可见"); const asset = payload.assetId ? assets.find(item => item.id === payload.assetId) : undefined; if (payload.assetId && !asset) throw new Error("课程资源附件不属于该导入批次"); if (payload.materialType === "practice" && (payload.sourceUrl || asset)) throw new Error("实操型资源仅可包含受控内联说明与配置");
    const [created] = await db.insert(courseMaterials).values({ courseId: payload.courseId, materialType: payload.materialType, sourceType: asset ? "file" : payload.contentMarkdown ? "inline" : "url", title: payload.title, description: payload.description ?? null, sourceUrl: payload.sourceUrl ?? null, storageKey: asset?.storageKey ?? null, mimeType: asset?.mimeType ?? null, content: payload.contentMarkdown ? sanitizeImportedMarkdown(payload.contentMarkdown) : null, config: { ...payload.config, agentImportJobId: job.id, originalSourceUrl: job.sourceUrl }, orderIndex: payload.orderIndex }).$returningId(); resultType = "course_material"; resultId = created.id;
  } else {
    const payload = agentSkillPayloadSchema.parse(job.payload); const packageAsset = assets.find(item => item.id === payload.packageAssetId && item.assetType === "package"); if (!packageAsset) throw new Error("Skills 安装包不属于该导入批次"); const [existing] = await db.select({ id: skillPackages.id }).from(skillPackages).where(eq(skillPackages.skillKey, payload.skillKey)).limit(1); if (existing) throw new Error("该 Skills 标识已存在，请调整标识后重新提交"); const [created] = await db.insert(skillPackages).values({ ...payload, packageStorageKey: packageAsset.storageKey, packageFileName: packageAsset.fileName, packageSizeBytes: packageAsset.sizeBytes, authorId: key.createdBy, reviewStatus: "pending" }).$returningId(); resultType = "skill"; resultId = created.id;
  }
  await db.update(agentImportJobs).set({ status: "applied", reviewNote, reviewedBy: reviewerId, reviewedAt: new Date(), resultType, resultId }).where(eq(agentImportJobs.id, job.id)); return { resultType, resultId };
}

export function registerAgentImportRoutes(app: Express) {
  app.get("/api/agent-import/v1/capabilities", async (req, res) => {
    const auth = await authenticate(req); if (!auth) return res.status(401).json({ error: "invalid_import_token" });
    return res.json({ version: "v1", allowedTargets: auth.key.allowedTargets, limits: { remoteImageMb: 5, fileMb: 12, packageMb: 8, maxAssetsPerDraft: 16 }, publishPolicy: "draft_only" });
  });
  app.post("/api/agent-import/v1/assets/fetch-image", async (req, res) => {
    const auth = await authenticate(req); if (!auth) return res.status(401).json({ error: "invalid_import_token" });
    const input = z.object({ sourceUrl: externalLink, fileName: z.string().trim().min(1).max(180).optional() }).safeParse(req.body); if (!input.success) return res.status(400).json({ error: "invalid_request", message: "图片地址或文件名无效" });
    try { const image = await fetchPublicImage(input.data.sourceUrl); const fileName = safeFileName(input.data.fileName || new URL(image.finalUrl).pathname.split("/").pop() || "imported-image"); const { key, url } = await storagePut(`agent-imports/${auth.key.id}/images/${Date.now()}-${fileName}`, image.buffer, image.mimeType); const checksum = createHash("sha256").update(image.buffer).digest("hex"); const [asset] = await auth.db.insert(agentImportAssets).values({ importKeyId: auth.key.id, assetType: "image", sourceUrl: image.finalUrl, storageKey: key, storageUrl: url, fileName, mimeType: image.mimeType, sizeBytes: image.buffer.length, checksum }).$returningId(); return res.status(201).json({ assetId: asset.id, url, mimeType: image.mimeType, sizeBytes: image.buffer.length, sourceUrl: image.finalUrl }); } catch (error) { return res.status(400).json({ error: "image_fetch_failed", message: error instanceof Error ? error.message : "图片获取失败" }); }
  });
  app.post("/api/agent-import/v1/assets/upload", async (req, res) => {
    const auth = await authenticate(req); if (!auth) return res.status(401).json({ error: "invalid_import_token" });
    const input = z.object({ assetType: z.enum(["document", "package", "image"]), fileName: z.string().trim().min(1).max(180), mimeType: z.enum(UPLOAD_TYPES), dataUrl: z.string().min(20).max(18_000_000) }).safeParse(req.body); if (!input.success) return res.status(400).json({ error: "invalid_request", message: "附件参数无效" });
    if (input.data.assetType === "package" && !input.data.mimeType.includes("zip")) return res.status(400).json({ error: "invalid_request", message: "Skills 安装包仅支持 ZIP" });
    if (input.data.assetType === "image" && !input.data.mimeType.startsWith("image/")) return res.status(400).json({ error: "invalid_request", message: "图片附件仅支持图片 MIME 类型" });
    try { const buffer = decodeUpload(input.data.dataUrl, input.data.mimeType); const fileName = safeFileName(input.data.fileName); const { key, url } = await storagePut(`agent-imports/${auth.key.id}/${input.data.assetType}s/${Date.now()}-${fileName}`, buffer, input.data.mimeType); const checksum = createHash("sha256").update(buffer).digest("hex"); const [asset] = await auth.db.insert(agentImportAssets).values({ importKeyId: auth.key.id, assetType: input.data.assetType, sourceUrl: null, storageKey: key, storageUrl: url, fileName, mimeType: input.data.mimeType, sizeBytes: buffer.length, checksum }).$returningId(); return res.status(201).json({ assetId: asset.id, url, mimeType: input.data.mimeType, sizeBytes: buffer.length }); } catch (error) { return res.status(400).json({ error: "asset_upload_failed", message: error instanceof Error ? error.message : "附件上传失败" }); }
  });
  app.post("/api/agent-import/v1/drafts", async (req, res) => {
    const auth = await authenticate(req); if (!auth) return res.status(401).json({ error: "invalid_import_token" });
    const input = z.object({ targetType: z.enum(AGENT_IMPORT_TARGETS), idempotencyKey: z.string().trim().min(8).max(128), sourceUrl: externalLink, sourceTitle: z.string().trim().max(300).optional(), assetIds: z.array(z.number().int().positive()).max(16).default([]), payload: z.unknown() }).safeParse(req.body); if (!input.success) return res.status(400).json({ error: "invalid_request", message: "草稿参数无效" });
    if (!auth.key.allowedTargets.includes(input.data.targetType)) return res.status(403).json({ error: "target_not_allowed", message: "当前导入令牌无此内容类型权限" });
    try { await assertPublicHttpUrl(input.data.sourceUrl); } catch (error) { return res.status(400).json({ error: "unsafe_source_url", message: error instanceof Error ? error.message : "来源地址不可用" }); }
    let normalizedPayload: Record<string, unknown>; let packageAssetId: number | undefined; let courseAssetId: number | undefined;
    if (input.data.targetType === "news") { const payload = agentNewsPayloadSchema.safeParse(input.data.payload); if (!payload.success) return res.status(400).json({ error: "invalid_payload", message: "资讯草稿字段未通过平台内容契约" }); normalizedPayload = { ...payload.data, contentMarkdown: sanitizeImportedMarkdown(payload.data.contentMarkdown) }; }
    else if (input.data.targetType === "course_material") { const payload = agentCoursePayloadSchema.safeParse(input.data.payload); if (!payload.success) return res.status(400).json({ error: "invalid_payload", message: "课程资源草稿字段未通过平台内容契约" }); courseAssetId = payload.data.assetId; normalizedPayload = { ...payload.data, ...(payload.data.contentMarkdown ? { contentMarkdown: sanitizeImportedMarkdown(payload.data.contentMarkdown) } : {}) }; }
    else { const payload = agentSkillPayloadSchema.safeParse(input.data.payload); if (!payload.success) return res.status(400).json({ error: "invalid_payload", message: "Skills 草稿字段未通过平台内容契约" }); packageAssetId = payload.data.packageAssetId; normalizedPayload = payload.data; }
    try { const assets = await assertOwnedAssets(auth.db, auth.key.id, input.data.assetIds); if (input.data.targetType === "skill" && !assets.some(asset => asset.id === packageAssetId && asset.assetType === "package")) throw new Error("Skills 草稿必须引用当前令牌上传的 ZIP 安装包"); if (input.data.targetType === "course_material" && courseAssetId && !assets.some(asset => asset.id === courseAssetId)) throw new Error("课程资源引用的附件不属于当前令牌");
      const [existing] = await auth.db.select({ id: agentImportJobs.id, status: agentImportJobs.status }).from(agentImportJobs).where(and(eq(agentImportJobs.importKeyId, auth.key.id), eq(agentImportJobs.idempotencyKey, input.data.idempotencyKey))).limit(1); if (existing) return res.json({ jobId: existing.id, status: existing.status, duplicate: true });
      const [job] = await auth.db.insert(agentImportJobs).values({ importKeyId: auth.key.id, targetType: input.data.targetType, idempotencyKey: input.data.idempotencyKey, sourceUrl: input.data.sourceUrl, sourceTitle: input.data.sourceTitle ?? null, payload: normalizedPayload, assetIds: input.data.assetIds }).$returningId(); return res.status(201).json({ jobId: job.id, status: "pending_review", draftOnly: true });
    } catch (error) { return res.status(400).json({ error: "draft_create_failed", message: error instanceof Error ? error.message : "草稿提交失败" }); }
  });
}
