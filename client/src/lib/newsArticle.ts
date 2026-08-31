import { extractOriginalSourceUrl, stripAggregatorFootnotes } from "@shared/news";

export type NewsArticlePresentationInput = {
  content: string | null | undefined;
  summary: string;
  sourceUrl: string | null | undefined;
};

/**
 * 阅读页呈现规则：
 * - 正文剥离聚合源样板行（AIHOT 聚合整理声明、“阅读原文 via AIHOT”、原文入口行），
 *   避免正文里出现重复的原文链接；
 * - 原文链接去重合一：若正文带有“原文入口”真实原文地址则优先使用，
 *   否则回退到 RSS 条目自带的聚合页链接。
 */
export function resolveNewsArticlePresentation(input: NewsArticlePresentationInput) {
  const content = input.content?.trim() ?? "";
  const body = content ? stripAggregatorFootnotes(content) || input.summary : input.summary;
  const sourceUrl = (content ? extractOriginalSourceUrl(content) : null) ?? (input.sourceUrl?.trim() || null);
  return { body, sourceUrl };
}
