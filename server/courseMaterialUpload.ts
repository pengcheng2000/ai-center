// 课程资源流式上传：请求体不经内存缓冲，直接 pipe 到本地存储，支持最大 1GB 的视频文件。
// 认证与 tRPC 共用同一会话 Cookie；仅管理员可上传。
import type { Express, Request, Response } from "express";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { sdk } from "./_core/sdk";
import { resolveStoragePath, storageKeyFor, writeStorageMeta } from "./storage";
import { sanitizeHtmlSnapshot } from "./safeHtml";

const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024; // 1GB
const MAX_HTML_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/markdown",
  "text/plain",
  "text/html",
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
  "video/webm",
]);

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_").slice(0, 180);
  return cleaned || "upload.bin";
}

export function registerCourseMaterialUpload(app: Express) {
  app.post("/api/upload/course-material", async (req: Request, res: Response) => {
    const user = await sdk.authenticateRequest(req).catch(() => null);
    if (!user || user.role !== "admin") {
      res.status(403).json({ error: "仅管理员可上传课程资源" });
      return;
    }

    const rawName = String(req.headers["x-file-name"] ?? "");
    let fileName = "";
    try { fileName = decodeURIComponent(rawName); } catch { fileName = rawName; }
    const mimeType = String(req.headers["x-file-type"] ?? "").trim();
    if (!fileName || !ALLOWED_MIME.has(mimeType)) {
      res.status(400).json({ error: "仅支持 PDF、Word、Markdown、文本、HTML、图片、MP4 或 WebM 文件" });
      return;
    }

    const declaredLength = Number(req.headers["content-length"] ?? 0);
    if (!Number.isFinite(declaredLength) || declaredLength <= 0) {
      res.status(400).json({ error: "请求缺少文件内容" });
      return;
    }
    const isHtml = mimeType === "text/html";
    const maxBytes = isHtml ? MAX_HTML_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
    if (declaredLength > maxBytes) {
      res.status(413).json({ error: isHtml ? "HTML 文件不能超过 20MB" : "单个资源文件不能超过 1GB" });
      return;
    }

    const safeName = sanitizeFileName(fileName);
    const key = await storageKeyFor(`course-materials/${Date.now()}-${safeName}`);
    const target = resolveStoragePath(key);
    await mkdir(path.dirname(target), { recursive: true });

    let received = 0;
    if (isHtml) {
      const chunks: Buffer[] = [];
      let oversized = false;
      for await (const chunk of req) {
        received += chunk.length;
        if (received <= MAX_HTML_UPLOAD_BYTES) {
          chunks.push(Buffer.from(chunk));
        } else {
          oversized = true;
        }
      }
      if (oversized) {
        res.status(413).json({ error: "HTML 文件不能超过 20MB" });
        return;
      }
      if (received === 0) {
        res.status(400).json({ error: "请求缺少文件内容" });
        return;
      }

      const contentHtml = sanitizeHtmlSnapshot(Buffer.concat(chunks).toString("utf8"));
      if (!contentHtml) {
        res.status(400).json({ error: "HTML 文件中没有可阅读的正文" });
        return;
      }
      await writeFile(target, contentHtml, "utf8");
      await writeStorageMeta(key, mimeType);
      res.json({ storageKey: key, url: `/api/files/${key}`, mimeType, fileName: safeName, sizeBytes: received, contentHtml, contentFormat: "html" });
      return;
    }

    let aborted = false;
    req.on("data", chunk => {
      received += chunk.length;
      if (received > MAX_UPLOAD_BYTES && !aborted) {
        aborted = true;
        req.destroy(new Error("FILE_TOO_LARGE"));
      }
    });

    try {
      await pipeline(req, createWriteStream(target));
    } catch {
      res.status(aborted ? 413 : 500).json({ error: aborted ? "单个资源文件不能超过 1GB" : "上传写入失败，请重试" });
      return;
    }
    if (received === 0) {
      res.status(400).json({ error: "请求缺少文件内容" });
      return;
    }

    await writeStorageMeta(key, mimeType);
    res.json({ storageKey: key, url: `/api/files/${key}`, mimeType, fileName: safeName, sizeBytes: received });
  });
}
