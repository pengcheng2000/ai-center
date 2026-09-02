import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "article", "aside", "b", "blockquote", "br", "code", "del", "details", "em", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "main", "ol", "p", "pre", "section", "small", "span", "strong", "sub", "summary", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul", "a",
];
const COMMON_ATTRIBUTES = ["alt", "class", "colspan", "height", "id", "lang", "loading", "name", "rowspan", "scope", "title", "width"];

function safeUrl(value: string, image = false) {
  const candidate = value.trim();
  if (!candidate || /[\u0000-\u001f\u007f]/.test(candidate)) return null;
  try {
    const parsed = new URL(candidate, "https://snapshot.invalid");
    const isRelative = parsed.origin === "https://snapshot.invalid";
    if (image && isRelative && !candidate.startsWith("/api/files/")) return null;
    if (!isRelative && !["http:", "https:"].includes(parsed.protocol)) return null;
    if (isRelative && !candidate.startsWith("/")) return null;
    return candidate;
  } catch { return null; }
}

/** Sanitizes untrusted HTML with sanitize-html; the exported API is intentionally stable. */
export function sanitizeHtmlSnapshot(input: string) {
  return sanitizeHtml(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      "*": COMMON_ATTRIBUTES,
      a: ["href", "rel", "target"],
      img: ["src"],
    },
    allowedSchemes: ["http", "https"],
    allowedSchemesByTag: { a: ["http", "https"], img: ["http", "https"] },
    allowProtocolRelative: false,
    disallowedTagsMode: "completelyDiscard",
    parser: { recognizeSelfClosing: true },
    transformTags: {
      a: (_tagName, attribs) => {
        if (attribs.href && !safeUrl(attribs.href)) delete attribs.href;
        return { tagName: "a", attribs: { ...attribs, target: "_blank", rel: "noreferrer noopener" } };
      },
      img: (_tagName, attribs) => {
        if (attribs.src && !safeUrl(attribs.src, true)) delete attribs.src;
        return { tagName: "img", attribs };
      },
    },
  }).trim();
}
