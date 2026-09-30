import { createHash } from "node:crypto";

export type AssetRequest = {
  assetRef: string;
  token: string;
  kind: "inline_image" | "attachment";
  fileName: string;
  mimeType: string;
};

export type NormalizedContent = {
  format: "markdown" | "html" | "structured" | "binary";
  title: string;
  summary: string;
  bodyMarkdown?: string;
  bodyHtml?: string;
  structuredData?: Record<string, unknown>;
  structuredStorageData?: string;
  structuredSchema?: Record<string, unknown>;
  structuredPreview?: Record<string, unknown>;
  rowCount?: number;
  columnCount?: number;
  rawSnapshot: string | Uint8Array;
  renderStatus: "complete" | "incomplete" | "preview_only";
  unsupportedSummary: Record<string, number>;
  locatorMap: Record<string, unknown>;
  locatorTruncated: boolean;
  assets: AssetRequest[];
};

export const sha256 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
export const NORMALIZER_VERSION = "knowledge-v1.1.2";

export function packStructured(value: Record<string, unknown>) {
  const json = JSON.stringify(value);
  return Buffer.byteLength(json, "utf8") <= 256 * 1024
    ? { structuredData: value, structuredStorageData: undefined }
    : { structuredData: undefined, structuredStorageData: json };
}

export function packLocators(locators: Record<string, unknown>) {
  const json = JSON.stringify(locators);
  if (Buffer.byteLength(json, "utf8") <= 64 * 1024)
    return { locatorMap: locators, locatorTruncated: false };
  const entries = Object.entries(locators);
  const compact: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    compact[key] = value;
    if (Buffer.byteLength(JSON.stringify(compact), "utf8") > 60 * 1024) {
      delete compact[key];
      break;
    }
  }
  return { locatorMap: compact, locatorTruncated: true };
}
