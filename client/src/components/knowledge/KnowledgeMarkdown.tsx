import {
  useEffect,
  useMemo,
  useState,
  useRef,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";
import { Streamdown, defaultRehypePlugins } from "streamdown";
import "./knowledge.css";
import { trpc } from "@/lib/trpc";
import ImageLightbox from "@/components/community/ImageLightbox";
import { prepareKnowledgeMarkdown } from "@shared/knowledgeReading";
const EMPTY_LINKS: Record<string, string> = {};

function OmittedImage({ onMissing }: { onMissing: () => void }) {
  useEffect(() => {
    onMissing();
  }, [onMissing]);
  return null;
}
function KnowledgeImage({
  src = "",
  alt = "",
  admin,
  onMissing,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & {
  admin: boolean;
  onMissing: () => void;
}) {
  const [url, setUrl] = useState(src),
    [failed, setFailed] = useState(false);
  const retried = useRef(false);
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  let parsed: URL | undefined;
  try {
    parsed = new URL(url, window.location.origin);
  } catch {
    /* Treat malformed source as unavailable. */
  }
  const id =
    parsed?.origin === window.location.origin
      ? parsed.pathname.match(/^\/api\/knowledge\/assets\/(\d+)$/)?.[1]
      : null;
  if (failed) return null;
  if (!id) return <OmittedImage onMissing={onMissing} />;
  return (
    <>
      <button
        type="button"
        className="my-5 block max-w-full cursor-zoom-in rounded-lg focus-visible:outline-2 focus-visible:outline-indigo-600"
        aria-label={`放大${alt || "图片"}`}
        onClick={() => setOpen(true)}
      >
        <img
          {...props}
          src={url}
          alt={alt || "正文图片"}
          loading="lazy"
          decoding="async"
          className="max-h-[720px] max-w-full rounded-lg object-contain"
          onError={async () => {
            if (!retried.current) {
              retried.current = true;
              try {
                const result = admin
                  ? await utils.knowledge.admin.assetUrl.fetch({
                      assetId: Number(id),
                    })
                  : await utils.knowledge.assetUrl.fetch({
                      assetId: Number(id),
                    });
                if (result.url !== url) {
                  setUrl(result.url);
                  return;
                }
              } catch {
                /* Collapse unavailable assets. */
              }
            }
            setFailed(true);
            onMissing();
          }}
        />
      </button>
      <ImageLightbox
        image={open ? { url, fileName: alt || "正文图片" } : null}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
export default function KnowledgeMarkdown({
  markdown,
  admin = false,
  links = EMPTY_LINKS,
  onMissing,
}: {
  markdown: string;
  admin?: boolean;
  links?: Record<string, string>;
  onMissing: () => void;
}) {
  const { body, headings } = useMemo(
    () => prepareKnowledgeMarkdown(markdown),
    [markdown]
  );
  const origin = window.location.origin;
  const plugins = useMemo(
    () =>
      [
        defaultRehypePlugins.raw,
        [
          Array.isArray(defaultRehypePlugins.harden)
            ? defaultRehypePlugins.harden[0]
            : defaultRehypePlugins.harden,
          {
            defaultOrigin: origin,
            allowedImagePrefixes: [`${origin}/api/knowledge/assets/`],
            allowedLinkPrefixes: ["*"],
            allowDataImages: false,
            blockedImageClass: "knowledge-image-omitted",
          },
        ],
        defaultRehypePlugins.katex,
      ] as Parameters<typeof Streamdown>[0]["rehypePlugins"],
    [origin]
  );
  const components = useMemo(
    () => ({
      span: ({
        className,
        children,
      }: {
        className?: string;
        children?: ReactNode;
      }) =>
        className === "knowledge-image-omitted" ? (
          <OmittedImage onMissing={onMissing} />
        ) : (
          <span className={className}>{children}</span>
        ),
      img: (props: ImgHTMLAttributes<HTMLImageElement>) => (
        <KnowledgeImage
          key={props.src}
          {...props}
          admin={admin}
          onMissing={onMissing}
        />
      ),
      a: ({ href, children }: { href?: string; children?: ReactNode }) => {
        let target = href;
        try {
          const u = new URL(href ?? "", origin);
          if (/(^|\.)feishu\.cn$/.test(u.hostname))
            target = links[u.pathname.split("/").at(-1) ?? ""] ?? href;
        } catch {
          /* Render plain text below. */
        }
        if (!target || /^(javascript|data):/i.test(target))
          return <span>{children}</span>;
        return (
          <a
            href={target}
            target={target.startsWith("http") ? "_blank" : undefined}
            rel="noopener noreferrer"
          >
            {children}
          </a>
        );
      },
    }),
    [admin, onMissing, origin, links]
  );
  const toc = (
    <nav aria-label="文章目录" className="space-y-2 text-sm">
      {headings.map(h => (
        <a
          key={h.id}
          href={`#${h.id}`}
          className="block rounded py-1 text-gray-600 hover:text-indigo-700"
          style={{ paddingLeft: Math.min(h.level - 2, 2) * 12 }}
        >
          {h.title}
        </a>
      ))}
    </nav>
  );
  return (
    <div
      className={
        headings.length >= 3 && !admin
          ? "grid min-w-0 gap-8 xl:grid-cols-[minmax(0,800px)_190px]"
          : "min-w-0"
      }
    >
      <div className="min-w-0">
        {headings.length >= 3 && (
          <details
            className={`mb-6 rounded-lg border bg-gray-50 p-4 ${admin ? "" : "xl:hidden"}`}
          >
            <summary className="cursor-pointer text-sm font-medium">
              文章目录
            </summary>
            {toc}
          </details>
        )}
        <div className="knowledge-prose prose max-w-[800px] text-base leading-[1.8] prose-headings:font-sans prose-headings:font-semibold prose-headings:text-gray-900 prose-headings:scroll-mt-28 prose-h2:mt-9 prose-h2:text-2xl prose-h3:text-xl prose-a:text-indigo-700 prose-p:my-4 prose-blockquote:border-indigo-200 prose-blockquote:text-gray-600 prose-pre:max-w-full prose-pre:overflow-auto prose-table:text-sm [&_p:empty]:hidden [&_table]:block [&_table]:overflow-x-auto">
          <Streamdown
            parseIncompleteMarkdown={false}
            rehypePlugins={plugins}
            components={components}
            controls={false}
            disallowedElements={[
              "script",
              "iframe",
              "object",
              "embed",
              "style",
              "form",
              "textarea",
              "select",
            ]}
          >
            {body}
          </Streamdown>
        </div>
      </div>
      {headings.length >= 3 && !admin && (
        <aside className="hidden xl:block">
          <div className="sticky top-28 max-h-[calc(100vh-9rem)] overflow-auto border-l pl-5">
            <p className="mb-4 text-sm font-semibold">本页目录</p>
            {toc}
          </div>
        </aside>
      )}
    </div>
  );
}
