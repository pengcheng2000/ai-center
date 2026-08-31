export const VIDEO_PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
export type DocumentDisplayMode = "markdown" | "image" | "pdf" | "link" | "missing";
export function resolveDocumentDisplay(input: { content?: string | null; mimeType?: string | null; url?: string | null }): DocumentDisplayMode {
  if (input.content?.trim()) return "markdown";
  if (input.mimeType?.startsWith("image/") && input.url) return "image";
  if (input.mimeType === "application/pdf" && input.url) return "pdf";
  return input.url ? "link" : "missing";
}
export function canShowTimestampComment(materialType: "document" | "video" | "practice") { return materialType === "video"; }
export function supportsPracticeHistory(materialType: "document" | "video" | "practice") { return materialType === "practice"; }
