import { FeishuClient } from "./client";

export function fileMime(name: string): string {
  const ext = name.split(".").at(-1)?.toLowerCase();
  return ext === "md"
    ? "text/markdown"
    : ext === "html" || ext === "htm"
      ? "text/html"
      : ext === "pdf"
        ? "application/pdf"
        : "application/octet-stream";
}

export function readFeishuFile(client: FeishuClient, token: string) {
  return client.binary(
    `/open-apis/drive/v1/files/${encodeURIComponent(token)}/download`,
    "file_download"
  );
}

export function readFeishuImage(client: FeishuClient, token: string) {
  return client.binary(
    `/open-apis/drive/v1/medias/${encodeURIComponent(token)}/download`,
    "image_download"
  );
}

export function readFeishuAttachment(client: FeishuClient, token: string) {
  return client.binary(
    `/open-apis/drive/v1/medias/${encodeURIComponent(token)}/download`,
    "attachment_download"
  );
}
