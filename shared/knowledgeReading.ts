import { cleanExcerpt, safeKnowledgeLink } from "./knowledge";
const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
function headingContent(value: string) {
  const result: string[] = [];
  let offset = 0;
  for (const match of value.matchAll(/\[([^\]]+)\]\(([^\s)]+)\)/g)) {
    result.push(
      escapeHtml(cleanExcerpt(value.slice(offset, match.index), 1000))
    );
    const label = escapeHtml(cleanExcerpt(match[1], 1000));
    const href = safeKnowledgeLink(match[2]);
    result.push(href ? `<a href="${escapeHtml(href)}">${label}</a>` : label);
    offset = match.index + match[0].length;
  }
  result.push(escapeHtml(cleanExcerpt(value.slice(offset), 1000)));
  return result.join(" ").trim();
}
export function prepareKnowledgeMarkdown(markdown: string) {
  const headings: { id: string; title: string; level: number }[] = [];
  let scanFence: string | null = null;
  const levels: number[] = [];
  for (const line of markdown.split("\n")) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!scanFence) scanFence = marker[1];
      else if (
        marker[1][0] === scanFence[0] &&
        marker[1].length >= scanFence.length
      )
        scanFence = null;
      continue;
    }
    const heading = !scanFence && line.match(/^((?:>\s*)*)(#{1,6})\s+/);
    if (heading) levels.push(heading[2].length);
  }
  const base = Math.min(6, ...levels);
  let fence: string | null = null;
  const body = markdown
    .split("\n")
    .map(line => {
      const marker = line.match(/^\s*(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length)
          fence = null;
        return line;
      }
      if (fence) return line;
      const heading = line.match(/^((?:>\s*)*)(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = Math.min(6, heading[2].length - base + 2);
        const title = cleanExcerpt(heading[3], 300),
          id = `section-${headings.length + 1}`;
        headings.push({ id, title, level });
        return `${heading[1]}<h${level} id="${id}">${headingContent(heading[3])}</h${level}>`;
      }
      return line
        .replace(
          /\[(?:暂不完整支持|Image blocked|图片未能读取|外部图片未复制)[^\]]*\]/gi,
          ""
        )
        .replace(/!\[[^\]]*\]\(\s*\)/g, "");
    })
    .join("\n");
  return { body, headings };
}
