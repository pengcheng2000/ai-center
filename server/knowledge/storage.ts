import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  open,
  readdir,
  rename,
  rm,
  stat,
  statfs,
} from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";
import { resolveStoragePath, writeStorageMeta } from "../storage";

const MIB = 1024 * 1024;
const reserveBytes = 1024 * MIB;
function positiveInteger(name: string, fallback: number) {
  const value =
    process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`Invalid ${name}`);
  if (name !== "KNOWLEDGE_ASSET_CONCURRENCY" && value > 2_147_483_647)
    throw new Error(`${name} exceeds the current MySQL INT byte counter`);
  return value;
}
const maxSingle = positiveInteger("KNOWLEDGE_MAX_SINGLE_ASSET_BYTES", 64 * MIB);
const maxRun = positiveInteger("KNOWLEDGE_MAX_ASSET_BYTES_PER_RUN", 512 * MIB);
export const assetConcurrency = positiveInteger(
  "KNOWLEDGE_ASSET_CONCURRENCY",
  2
);
if (assetConcurrency > 8)
  throw new Error("KNOWLEDGE_ASSET_CONCURRENCY must be at most 8");

export class StorageLimitError extends Error {
  constructor(
    public readonly reason: "single" | "run" | "free_space" | "not_writable"
  ) {
    super(`Knowledge storage limit: ${reason}`);
  }
}

export type StagedFile = {
  tempKey: string;
  finalKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};

export class RunStorageBudget {
  usedBytes = 0;
  constructor(
    readonly maxSingleBytes = maxSingle,
    readonly maxRunBytes = maxRun
  ) {
    if (
      !Number.isSafeInteger(maxSingleBytes) ||
      maxSingleBytes <= 0 ||
      !Number.isSafeInteger(maxRunBytes) ||
      maxRunBytes <= 0 ||
      maxSingleBytes > 2_147_483_647 ||
      maxRunBytes > 2_147_483_647
    )
      throw new Error("Invalid Knowledge storage budget");
  }

  async preflight() {
    const root = resolveStoragePath("knowledge/tmp");
    await mkdir(root, { recursive: true });
    const probe = resolveStoragePath(`knowledge/tmp/.probe-${randomUUID()}`);
    try {
      const handle = await open(probe, "wx");
      await handle.close();
      await rm(probe);
    } catch {
      throw new StorageLimitError("not_writable");
    }
    const info = await statfs(root);
    if (info.bavail * info.bsize < this.maxRunBytes + reserveBytes)
      throw new StorageLimitError("free_space");
  }

  add(bytes: number, currentFileBytes: number) {
    if (currentFileBytes + bytes > this.maxSingleBytes)
      throw new StorageLimitError("single");
    if (this.usedBytes + bytes > this.maxRunBytes)
      throw new StorageLimitError("run");
    this.usedBytes += bytes;
  }
}

function safeSegment(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function keys(runId: number, externalId: string, ref: string) {
  const dir = `${runId}/${safeSegment(externalId)}`;
  const name = safeSegment(ref);
  return {
    tempKey: `knowledge/tmp/${dir}/${name}`,
    finalKey: `knowledge/objects/${dir}/${name}`,
  };
}

export async function stageBytes(
  runId: number,
  externalId: string,
  ref: string,
  input: Uint8Array | string,
  mimeType: string,
  budget: RunStorageBudget
): Promise<StagedFile> {
  const bytes =
    typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  budget.add(bytes.byteLength, 0);
  const fileKeys = keys(runId, externalId, ref);
  const target = resolveStoragePath(fileKeys.tempKey);
  await mkdir(path.dirname(target), { recursive: true });
  const handle = await open(target, "w");
  try {
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
  return {
    ...fileKeys,
    mimeType,
    sizeBytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function stageResponse(
  runId: number,
  externalId: string,
  ref: string,
  response: Response,
  mimeType: string,
  budget: RunStorageBudget
): Promise<StagedFile> {
  const fileKeys = keys(runId, externalId, ref);
  const target = resolveStoragePath(fileKeys.tempKey);
  await mkdir(path.dirname(target), { recursive: true });
  const stream = createWriteStream(target, { flags: "w" });
  const digest = createHash("sha256");
  let sizeBytes = 0;
  try {
    if (!response.body) throw new Error("Empty file response");
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        budget.add(value.byteLength, sizeBytes);
        sizeBytes += value.byteLength;
        digest.update(value);
        if (!stream.write(value))
          await new Promise<void>((resolve, reject) => {
            const onDrain = () => {
              stream.off("error", onError);
              resolve();
            };
            const onError = (error: Error) => {
              stream.off("drain", onDrain);
              reject(error);
            };
            stream.once("drain", onDrain);
            stream.once("error", onError);
          });
        if (sizeBytes % (16 * MIB) < value.byteLength) {
          const info = await statfs(path.dirname(target));
          if (info.bavail * info.bsize < reserveBytes)
            throw new StorageLimitError("free_space");
        }
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error;
    } finally {
      reader.releaseLock();
    }
    stream.end();
    await finished(stream);
    return { ...fileKeys, mimeType, sizeBytes, sha256: digest.digest("hex") };
  } catch (error) {
    stream.destroy();
    await rm(target, { force: true });
    throw error;
  }
}

export async function finalizeStaged(files: StagedFile[]) {
  for (const file of files) {
    const source = resolveStoragePath(file.tempKey);
    const target = resolveStoragePath(file.finalKey);
    await mkdir(path.dirname(target), { recursive: true });
    try {
      await rename(source, target);
    } catch {
      const existing = await stat(target).catch(() => null);
      if (
        !existing ||
        existing.size !== file.sizeBytes ||
        (await hashFile(target)) !== file.sha256
      )
        throw new Error("Knowledge staged file missing");
    }
    await writeStorageMeta(file.finalKey, file.mimeType);
  }
}

export async function stagedFilesReady(files: StagedFile[]) {
  for (const file of files) {
    const existing = await stat(resolveStoragePath(file.finalKey)).catch(
      () => null
    );
    if (
      !existing ||
      existing.size !== file.sizeBytes ||
      (await hashFile(resolveStoragePath(file.finalKey))) !== file.sha256
    )
      return false;
  }
  return true;
}

export async function hashFile(filePath: string) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  return digest.digest("hex");
}

/** Only removes a known run/item tmp subtree under the storage root. */
export async function discardStaged(runId: number, externalId: string) {
  const root = resolveStoragePath("knowledge/tmp");
  const target = resolveStoragePath(
    `knowledge/tmp/${runId}/${safeSegment(externalId)}`
  );
  if (!target.startsWith(root + path.sep))
    throw new Error("Invalid knowledge temporary path");
  await rm(target, { recursive: true, force: true });
}

export async function cleanupStaleTmp(
  isActiveRun: (runId: number) => Promise<boolean>
) {
  const root = resolveStoragePath("knowledge/tmp");
  await mkdir(root, { recursive: true });
  for (const name of await readdir(root)) {
    if (!/^\d+$/.test(name)) continue;
    const target = resolveStoragePath(`knowledge/tmp/${name}`);
    if (!target.startsWith(root + path.sep)) continue;
    const info = await stat(target).catch(() => null);
    if (
      !info ||
      Date.now() - info.mtimeMs < 24 * 60 * 60 * 1000 ||
      (await isActiveRun(Number(name)))
    )
      continue;
    await rm(target, { recursive: true, force: true });
  }
}

export function knowledgeFilePath(key: string) {
  if (!key.startsWith("knowledge/objects/"))
    throw new Error("Invalid knowledge file key");
  return resolveStoragePath(key);
}
