// 本地文件存储：上传写入 DATA_DIR/storage 目录，读取通过 /api/files/{key}
// 短时签名 URL 提供，签名使用 JWT_SECRET 的 HMAC，不暴露原始文件路径之外
// 的任何后端凭据。

import { createHmac, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ENV } from "./_core/env";

const STORAGE_ROOT = path.join(ENV.dataDir, "storage");

export const SIGNED_URL_TTL_MS = 10 * 60 * 1000;

function normalizeKey(relKey: string): string {
  const cleaned = relKey
    .replace(/^\/+/, "")
    .split("/")
    .filter(segment => segment && segment !== "." && segment !== "..")
    .join("/");
  if (!cleaned) {
    throw new Error("Invalid storage key");
  }
  return cleaned;
}

export function resolveStoragePath(key: string): string {
  const normalized = normalizeKey(key);
  const target = path.join(STORAGE_ROOT, normalized);
  if (!target.startsWith(STORAGE_ROOT + path.sep) && target !== STORAGE_ROOT) {
    throw new Error("Invalid storage key");
  }
  return target;
}

function appendHashSuffix(relKey: string): string {
  const hash = randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const target = resolveStoragePath(key);

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
  await writeFile(`${target}.meta.json`, JSON.stringify({ contentType }), "utf8");

  return { key, url: `/api/files/${key}` };
}

// 流式上传场景：先取带随机后缀的落盘 key，由调用方自行 pipe 写入后补写 meta。
export async function storageKeyFor(relKey: string): Promise<string> {
  return appendHashSuffix(normalizeKey(relKey));
}

export async function writeStorageMeta(key: string, contentType: string): Promise<void> {
  await writeFile(`${resolveStoragePath(key)}.meta.json`, JSON.stringify({ contentType }), "utf8");
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/api/files/${key}` };
}

export function createFileAccessToken(key: string, ttlMs = SIGNED_URL_TTL_MS): string {
  const expires = Date.now() + ttlMs;
  const signature = createHmac("sha256", ENV.cookieSecret)
    .update(`${key}:${expires}`)
    .digest("hex");
  return `expires=${expires}&sig=${signature}`;
}

export function verifyFileAccessToken(key: string, expires: string | undefined, signature: string | undefined): boolean {
  if (!expires || !signature) return false;
  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = createHmac("sha256", ENV.cookieSecret)
    .update(`${key}:${expiresAt}`)
    .digest("hex");
  return signature.length === expected.length && timingSafeEqualHex(signature, expected);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  return bufferA.length === bufferB.length && bufferA.equals(bufferB);
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  return `/api/files/${key}?${createFileAccessToken(key)}`;
}
