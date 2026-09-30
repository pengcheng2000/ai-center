import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { Express } from "express";
import { ENV } from "../_core/env";
import { sdk } from "../_core/sdk";
import { canAccessAsset } from "./permissions";
import { knowledgeFilePath } from "./storage";

// PDF readers may request later ranges during a long session; every request still rechecks identity and publication.
const TTL_MS = 60 * 60 * 1000;
const signature = (
  assetId: number,
  userId: number,
  publicationId: number,
  expires: number
) =>
  createHmac("sha256", ENV.cookieSecret)
    .update(`${assetId}:${userId}:${publicationId}:${expires}`)
    .digest("hex");

export function signedKnowledgeAssetUrl(
  assetId: number,
  userId: number,
  publicationId = 0
) {
  const expires = Date.now() + TTL_MS;
  return `/api/knowledge/assets/${assetId}?user=${userId}&publication=${publicationId}&expires=${expires}&sig=${signature(assetId, userId, publicationId, expires)}`;
}

function validSignature(
  assetId: number,
  userId: number,
  publicationId: number,
  expires: number,
  actual: string
) {
  if (
    !Number.isSafeInteger(publicationId) ||
    publicationId < -1 ||
    !Number.isSafeInteger(expires) ||
    expires < Date.now() ||
    expires > Date.now() + TTL_MS + 10_000 ||
    !/^[a-f0-9]{64}$/.test(actual)
  )
    return false;
  const expected = Buffer.from(
    signature(assetId, userId, publicationId, expires),
    "hex"
  );
  const received = Buffer.from(actual, "hex");
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

function parseRange(value: string | undefined, size: number) {
  if (!value) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d+)-(\d*)$/.exec(value);
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  return Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start <= end &&
    end < size
    ? { start, end, partial: true }
    : null;
}

export function registerKnowledgeAssetRoute(app: Express) {
  app.get("/api/knowledge/assets/:assetId", async (req, res) => {
    try {
      const assetId = Number(req.params.assetId);
      const user = await sdk.authenticateRequest(req);
      const signedUser = Number(req.query.user);
      const signedPublication = Number(req.query.publication);
      const expires = Number(req.query.expires);
      const sig = typeof req.query.sig === "string" ? req.query.sig : "";
      if (
        !Number.isSafeInteger(assetId) ||
        assetId <= 0 ||
        signedUser !== user.id ||
        !validSignature(assetId, user.id, signedPublication, expires, sig)
      ) {
        res.status(404).end();
        return;
      }
      const asset = await canAccessAsset(
        {
          userId: user.id,
          role: user.role,
          remoteAddress: req.socket.remoteAddress,
        },
        assetId,
        signedPublication === -1 ? "admin_preview" : "viewer"
      );
      if (!asset || asset.publicationId !== signedPublication) {
        res.status(404).end();
        return;
      }
      const file = knowledgeFilePath(asset.storageKey);
      const info = await stat(file);
      if (!info.isFile()) {
        res.status(404).end();
        return;
      }
      const range = parseRange(
        typeof req.headers.range === "string" ? req.headers.range : undefined,
        info.size
      );
      if (!range) {
        res.status(416).set("Content-Range", `bytes */${info.size}`).end();
        return;
      }
      res.status(range.partial ? 206 : 200);
      res.set("Content-Type", asset.mimeType);
      res.set("X-Content-Type-Options", "nosniff");
      if (
        !/^(image\/(png|jpeg|gif|webp)|application\/pdf)$/.test(asset.mimeType)
      )
        res.set(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(asset.fileName)}`
        );
      res.set("Content-Security-Policy", "sandbox");
      res.set("Cache-Control", "private, no-store");
      res.set("Accept-Ranges", "bytes");
      res.set("Content-Length", String(range.end - range.start + 1));
      if (range.partial)
        res.set(
          "Content-Range",
          `bytes ${range.start}-${range.end}/${info.size}`
        );
      createReadStream(file, { start: range.start, end: range.end })
        .on("error", () => res.destroy())
        .pipe(res);
    } catch {
      res.status(404).end();
    }
  });
}
