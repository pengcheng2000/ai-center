import HtmlReader from "@/components/learn/HtmlReader";
import PdfReader from "@/components/learn/PdfReader";
import KnowledgeMarkdown from "./KnowledgeMarkdown";
import { useCallback, useState } from "react";
import StructuredDataView from "./StructuredDataView";

export type KnowledgeViewContent = {
  id: number;
  structuredSchema?: Record<string, unknown> | null;
  format: "markdown" | "html" | "structured" | "binary";
  titleSnapshot: string;
  bodyMarkdown?: string | null;
  bodyHtml?: string | null;
  structuredData?: Record<string, unknown> | null;
  structuredPreview?: Record<string, unknown> | null;
  rowCount?: number | null;
  columnCount?: number | null;
  renderStatus: "complete" | "incomplete" | "preview_only";
  assets: Array<{
    id: number;
    kind: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    url: string;
  }>;
};

export default function KnowledgeRenderer({
  content,
  itemId,
  admin = false,
  links,
}: {
  content: KnowledgeViewContent;
  itemId?: number;
  admin?: boolean;
  links?: Record<string, string>;
}) {
  const [missing, setMissing] = useState(false);
  const onMissing = useCallback(() => setMissing(true), []);
  const pdf = content.assets.find(
    asset =>
      asset.kind === "primary_file" && asset.mimeType === "application/pdf"
  );
  return (
    <div className="space-y-5" data-knowledge-admin={admin}>
      {(content.renderStatus !== "complete" || missing) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {missing
            ? "部分图片未展示，可通过文章顶部的飞书原文入口查看。"
            : "部分图片、附件或特殊版式未展示，可通过文章顶部的飞书原文入口核对。"}
        </div>
      )}
      {content.format === "markdown" && (
        <div className="min-w-0">
          <KnowledgeMarkdown
            markdown={content.bodyMarkdown ?? ""}
            admin={admin}
            links={links}
            onMissing={onMissing}
          />
        </div>
      )}
      {content.format === "html" && (
        <HtmlReader
          html={content.bodyHtml ?? ""}
          title={content.titleSnapshot}
        />
      )}
      {content.format === "structured" && (
        <StructuredDataView
          key={content.id}
          content={content}
          itemId={itemId}
          admin={admin}
        />
      )}
      {content.format === "binary" && pdf && (
        <PdfReader
          materialId={0}
          src={pdf.url}
          annotations={[]}
          resumePage={null}
          onProgress={() => undefined}
          readOnly
        />
      )}
      {content.assets.filter(asset => asset.kind !== "inline_image").length >
        0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold">附件与原始文件</h2>
          <div className="mt-3 space-y-2">
            {content.assets
              .filter(asset => asset.kind !== "inline_image")
              .map(asset => (
                <a
                  key={asset.id}
                  href={asset.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={asset.fileName}
                  className="block rounded-lg border border-gray-100 px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-50"
                >
                  下载 {asset.fileName} · {asset.mimeType.split("/").at(-1)?.toUpperCase()} ·{" "}
                  {asset.sizeBytes < 1024 * 1024 ? `${Math.max(1, Math.round(asset.sizeBytes / 1024))} KB` : `${(asset.sizeBytes / 1024 / 1024).toFixed(1)} MB`}
                </a>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
