import type { Express } from "express";
import { createReadStream } from "node:fs";
import { stat, readFile } from "node:fs/promises";
import path from "node:path";
import { resolveStoragePath, verifyFileAccessToken } from "../storage";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".zip": "application/zip",
};

export function registerStorageProxy(app: Express) {
  app.get("/api/files/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    const query = req.query as Record<string, string | undefined>;
    if (!verifyFileAccessToken(key, query.expires, query.sig)) {
      res.status(403).send("链接无效或已过期，请重新获取");
      return;
    }

    let target: string;
    try {
      target = resolveStoragePath(key);
    } catch {
      res.status(400).send("Invalid storage key");
      return;
    }

    try {
      const info = await stat(target);
      if (!info.isFile()) {
        res.status(404).send("File not found");
        return;
      }

      let contentType = MIME_BY_EXTENSION[path.extname(target).toLowerCase()];
      if (!contentType) {
        try {
          const meta = JSON.parse(await readFile(`${target}.meta.json`, "utf8")) as { contentType?: string };
          contentType = meta.contentType ?? "application/octet-stream";
        } catch {
          contentType = "application/octet-stream";
        }
      }

      res.set("Content-Type", contentType);
      res.set("Content-Length", String(info.size));
      res.set("Cache-Control", "private, max-age=300");
      const download = query.download;
      if (download) {
        res.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(download)}`);
      }
      createReadStream(target).pipe(res);
    } catch {
      res.status(404).send("File not found");
    }
  });
}
