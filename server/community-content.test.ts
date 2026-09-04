import { describe, expect, it } from "vitest";
import { htmlToMarkdown, markdownToPlainText, referencedAttachmentIds, resolveAttachmentRefs, safeImageTarget, sanitizeMarkdown, stripAttachmentRef, toRenderableMarkdown } from "./communityContent";

describe("社区正文清洗", () => {
  it("剥离裸 HTML 标签，只保留可读文本与 Markdown 结构", () => {
    const result = sanitizeMarkdown("## 背景\n\n<div>大家 <b>Happy</b> 学习！</div>\n\n<script>alert(1)</script>");
    expect(result).toContain("## 背景");
    expect(result).toContain("大家 Happy 学习！");
    expect(result).not.toMatch(/[<>]/);
    expect(result).not.toContain("alert(1)");
  });

  it("丢弃危险链接协议，保留 http(s)、站内路径与附件引用", () => {
    const result = sanitizeMarkdown("[点我](javascript:alert(1)) [文档](https://example.com/a) [站内](/learn) ![图](attachment:12) ![坏图](data:image/png;base64,AAAA)");
    expect(result).toContain("[文档](https://example.com/a)");
    expect(result).toContain("[站内](/learn)");
    expect(result).toContain("![图](attachment:12)");
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("data:image");
    expect(result).toContain("点我");
  });

  it("图片仅允许 HTTPS、站内路径和附件引用", () => {
    const result = sanitizeMarkdown("![安全](https://images.example.com/a.png) ![混合内容](http://images.example.com/a.png) ![带凭据](https://user:pass@example.com/a.png) ![站内](/api/files/a.png)");
    expect(result).toContain("![安全](https://images.example.com/a.png)");
    expect(result).toContain("![站内](/api/files/a.png)");
    expect(result).not.toContain("http://images.example.com");
    expect(result).not.toContain("user:pass");
    expect(safeImageTarget("attachment:9")).toBe("attachment:9");
  });

  it("限制正文长度并折叠多余空行", () => {
    expect(sanitizeMarkdown(`第一段\n\n\n\n第二段`)).toBe("第一段\n\n第二段");
    expect(sanitizeMarkdown("字".repeat(40_000)).length).toBe(30_000);
  });
});

describe("历史 HTML 帖转 Markdown", () => {
  it("保留标题、强调、列表、引用、链接与图片", () => {
    const markdown = htmlToMarkdown('<h2>方法</h2><p>先<strong>拆解</strong>再<em>验证</em></p><ul><li>准备数据</li><li>跑一次</li></ul><blockquote>注意边界</blockquote><a href="https://example.com">原文</a><img src="/api/files/demo.png" alt="截图">');
    expect(markdown).toContain("## 方法");
    expect(markdown).toContain("**拆解**");
    expect(markdown).toContain("*验证*");
    expect(markdown).toContain("- 准备数据");
    expect(markdown).toContain("> 注意边界");
    expect(markdown).toContain("[原文](https://example.com)");
    expect(markdown).toContain("![截图](/api/files/demo.png)");
  });

  it("解码实体并丢弃转义后的标签文本，修复正文外泄的 <div>", () => {
    const markdown = htmlToMarkdown("<p>【已添加图片附件】 &lt;div&gt;大家 Happy 学习！&lt;/div&gt;</p>");
    expect(markdown).toContain("大家 Happy 学习！");
    expect(markdown).not.toContain("<div>");
    expect(markdown).not.toContain("&lt;");
    // 旧清洗器留下的图片占位文字不再出现在正文里，真实图片走附件展示。
    expect(markdown).not.toContain("【已添加图片附件】");
  });

  it("按存储格式选择渲染来源", () => {
    expect(toRenderableMarkdown({ content: "派生纯文本", contentMarkdown: "## Markdown 正文", contentHtml: null, contentFormat: "markdown" })).toBe("## Markdown 正文");
    expect(toRenderableMarkdown({ content: "派生纯文本", contentMarkdown: null, contentHtml: "<h2>旧标题</h2>", contentFormat: "html" })).toContain("## 旧标题");
    expect(toRenderableMarkdown({ content: "只有纯文本", contentMarkdown: null, contentHtml: null, contentFormat: "html" })).toBe("只有纯文本");
    // markdown 列缺失（历史迁移中的行）时回退到 HTML，不返回派生纯文本。
    expect(toRenderableMarkdown({ content: "派生纯文本", contentMarkdown: null, contentHtml: "<p>正文 <b>要点</b></p>", contentFormat: "markdown" })).toContain("**要点**");
  });
});

describe("内联附件占位", () => {
  it("把附件引用替换为本次请求的签名 URL，并移除已失效引用", () => {
    const markdown = "开头\n\n![封面](attachment:7)\n\n![丢失](attachment:9)\n\n结尾";
    const resolved = resolveAttachmentRefs(markdown, new Map([[7, "/api/files/a.png?sig=x"]]));
    expect(resolved).toContain("![封面](/api/files/a.png?sig=x)");
    expect(resolved).not.toContain("attachment:9");
    expect(resolved).toContain("结尾");
  });

  it("删除某张图片时同步清掉正文内联引用", () => {
    expect(stripAttachmentRef("说明\n\n![图](attachment:5)\n\n后续", 5)).toBe("说明\n\n后续");
    expect(referencedAttachmentIds("![a](attachment:1) ![b](attachment:2)")).toEqual([1, 2]);
  });
});

describe("正文纯文本派生", () => {
  it("去掉 Markdown 标记、图片与代码块，用于摘要与搜索", () => {
    const plain = markdownToPlainText("## 标题\n\n**加粗**与`代码`\n\n- 项目一\n\n![图](attachment:3)\n\n```js\nconst a = 1;\n```\n\n> 引用\n\n[链接](https://example.com)");
    expect(plain).toBe("标题 加粗与代码 项目一 引用 链接");
  });
});
