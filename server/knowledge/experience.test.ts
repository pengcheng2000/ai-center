import { describe, expect, it } from "vitest";
import {
  cellParts,
  cellText,
  normalizeTable,
  safeKnowledgeLink,
} from "../../shared/knowledge";
import { prepareKnowledgeMarkdown } from "../../shared/knowledgeReading";
import { normalizeDocx, normalizeStructured } from "./feishu/normalizer";
import { initialEditorial } from "./curation";
import { catalogInput, editorialInput } from "./catalog";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const { harden } = await import(
  /* @vite-ignore */ pathToFileURL(
    createRequire(require.resolve("streamdown")).resolve("rehype-harden")
  ).href
);

function doc(payload: Record<string, unknown>, type = 2, name = "text") {
  return [
    { block_id: "root", block_type: 1, page: {}, children: ["text"] },
    { block_id: "text", block_type: type, parent_id: "root", [name]: payload },
  ];
}
describe("knowledge reading regressions", () => {
  it("reads Feishu rich text without exposing formatting JSON", () => {
    expect(
      cellText([
        { text: "", segmentStyle: { fontSize: 10 } },
        { text: "模型名称", segmentStyle: { bold: true } },
      ])
    ).toBe("模型名称");
    expect(cellText({ segmentStyle: { bold: true } })).toBe("");
    expect(cellText(true)).toBe("是");
    expect(cellText(0)).toBe("0");
    expect(cellParts({ text: "资料", link: "javascript:alert(1)" })).toEqual([
      { text: "资料", href: undefined },
    ]);
  });
  it("keeps columns aligned when records have missing or differently ordered fields", () => {
    const t = normalizeTable({
      fields: [{ field_name: "名称" }, { field_name: "数量" }],
      records: [{ fields: { 数量: 2 } }, { fields: { 数量: 3, 名称: "设备" } }],
    });
    expect(t.rows[0]).toEqual([[], [{ text: "2" }]]);
    expect(t.rows[1]).toEqual([[{ text: "设备" }], [{ text: "3" }]]);
  });
  it("recognizes a sheet header and trims trailing empty cells without dropping internal gaps", () => {
    const t = normalizeTable({
      title: "模型",
      rows: [
        [[{ text: "名称" }], [{ text: "来源" }], null],
        ["A", "本地", null],
        [],
        ["B", "", null],
        [],
        [],
      ],
    });
    expect(t.columns).toEqual(["名称", "来源"]);
    expect(t.total).toBe(3);
    expect(t.rows[1]).toEqual([[], []]);
    expect(t.rows[2][0]).toEqual([{ text: "B" }]);
  });
  it("keeps a numeric or ambiguous first row as data", () => {
    expect(
      normalizeTable({
        rows: [
          [1, 2],
          [3, 4],
        ],
      })
    ).toMatchObject({ columns: ["A", "B"], total: 2 });
    expect(
      normalizeTable({
        rows: [
          ["重复", "重复"],
          ["甲", "乙"],
        ],
      }).total
    ).toBe(2);
  });
  it("stores normalized structures but retains the original raw snapshot", () => {
    const raw = {
      sheets: [
        {
          title: "样本",
          rows: [[[{ text: "名称" }]], ["内容"]],
          rowCount: 200,
          columnCount: 20,
        },
      ],
    };
    const result = normalizeStructured("样本", raw, "sheet");
    expect(result.rowCount).toBe(1);
    expect(result.columnCount).toBe(1);
    expect(result.structuredData).toHaveProperty("displayTables");
    expect(JSON.parse(String(result.rawSnapshot))).toEqual(raw);
  });
  it("decodes encoded Feishu links before protocol validation", () => {
    const normalized = normalizeDocx(
      "教程",
      doc({
        elements: [
          {
            text_run: {
              content: "开发后台",
              text_element_style: {
                link: { url: "https%3A%2F%2Fexample.com%2Fguide" },
              },
            },
          },
        ],
      })
    );
    expect(normalized.bodyMarkdown).toContain(
      "[开发后台](https://example.com/guide)"
    );
    expect(safeKnowledgeLink("javascript%3Aalert(1)")).toBeUndefined();
    expect(
      safeKnowledgeLink("https://user:password@example.com")
    ).toBeUndefined();
  });
  it("preserves emphasis adjacent to Chinese punctuation and escapes raw HTML", () => {
    const result = normalizeDocx(
      "教程",
      doc({
        elements: [
          {
            text_run: { content: "准备。", text_element_style: { bold: true } },
          },
          { text_run: { content: "接着操作" } },
        ],
      })
    );
    expect(result.bodyMarkdown).toBe("<strong>准备。</strong>接着操作");
    const unsafe = normalizeDocx(
      "教程",
      doc({
        elements: [
          {
            text_run: {
              content: "<script>alert(1)</script>",
              text_element_style: { bold: true },
            },
          },
        ],
      })
    );
    expect(unsafe.bodyMarkdown).not.toContain("<script>");
  });
  it("preserves code indentation, underscores and punctuation", () => {
    const value = "if ready:\n    client.create_collection(name='x')";
    const result = normalizeDocx(
      "代码",
      doc({ elements: [{ text_run: { content: value } }] }, 14, "code")
    );
    expect(result.bodyMarkdown).toContain(value);
  });
  it("does not make a long layout cell a table header", () => {
    const result = normalizeDocx("案例", [
      { block_id: "root", block_type: 1, page: {}, children: ["table"] },
      {
        block_id: "table",
        block_type: 31,
        table: { property: { column_size: 1 }, cells: ["cell"] },
      },
      { block_id: "cell", block_type: 32, table_cell: {}, children: ["p"] },
      {
        block_id: "p",
        block_type: 2,
        text: {
          elements: [
            {
              text_run: {
                content: "这是一段用于说明业务价值的案例内容。".repeat(5),
              },
            },
          ],
        },
      },
    ]);
    expect(result.bodyMarkdown).not.toContain("| --- |");
    expect(result.bodyMarkdown).toContain("业务价值");
  });
  it("removes implementation placeholders and gives repeated headings unique anchors", () => {
    const result = prepareKnowledgeMarkdown(
      "# 步骤\n\n[暂不完整支持：file]\n\n## 步骤\n\n```\n# code\n```"
    );
    expect(result.headings.map(h => h.id)).toEqual(["section-1", "section-2"]);
    expect(result.body).not.toContain("暂不完整支持");
    expect(result.body).toContain("# code");
    expect(result.body).toContain('<h2 id="section-1">');
  });
  it("allows signed same-origin images with an origin configured but blocks other hosts", () => {
    const plugin = harden;
    const tree = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "img",
          properties: { src: "/api/knowledge/assets/1?sig=test", alt: "本地" },
          children: [],
        },
        {
          type: "element",
          tagName: "img",
          properties: { src: "https://elsewhere.example/a.png", alt: "外部" },
          children: [],
        },
      ],
    };
    plugin({
      defaultOrigin: "http://localhost:3000",
      allowedImagePrefixes: ["http://localhost:3000/api/knowledge/assets/"],
      allowedLinkPrefixes: ["*"],
      allowDataImages: false,
    })(tree);
    expect(tree.children[0].tagName).toBe("img");
    expect(tree.children[1].tagName).not.toBe("img");
  });
  it("initial classification never approves or features content", () => {
    const result = initialEditorial({
      title: "第11篇：跟着做搭一个制度助手",
      body: "操作步骤",
      kind: "docx",
      ancestors: ["AI 视界订阅号推文合集"],
      hasChildren: false,
    });
    expect(result).toMatchObject({
      category: "tutorials",
      topicOrder: 11,
      included: true,
      featured: false,
      reviewedContentId: null,
    });
    expect(
      initialEditorial({
        title: "开发者测试入口",
        body: "内容",
        kind: "docx",
        ancestors: [],
        hasChildren: false,
      }).included
    ).toBe(false);
    expect(
      initialEditorial({
        title: "开发编码",
        body: "[暂不完整支持：sub_page_list]",
        kind: "docx",
        ancestors: [],
        hasChildren: true,
      }).included
    ).toBe(false);
  });
  it("enforces short editorial summaries and sensible pagination", () => {
    expect(catalogInput.parse(undefined)).toMatchObject({
      page: 1,
      sort: "recommended",
    });
    expect(catalogInput.safeParse({ page: -1 }).success).toBe(false);
    expect(
      editorialInput.safeParse({
        category: "basics",
        summary: "x".repeat(121),
        topic: "",
        topicOrder: 0,
        included: true,
        featured: false,
        reviewedContentId: null,
        reason: "",
      }).success
    ).toBe(false);
  });
  it("retains actionable links inside headings and demotes quoted headings", () => {
    const result = prepareKnowledgeMarkdown(
      "> # 概览\n\n## [官方教程](https://example.com/guide?a=1&b=2)"
    );
    expect(result.body).not.toContain("<h1");
    expect(result.body).toContain(
      'href="https://example.com/guide?a=1&amp;b=2"'
    );
    expect(result.headings.map(h => h.title)).toEqual(["概览", "官方教程"]);
    expect(
      prepareKnowledgeMarkdown("# [坏链接](javascript:alert)").body
    ).not.toContain("href=");
  });
  it("preserves nested bullet content instead of silently losing examples", () => {
    const result = normalizeDocx("嵌套列表", [
      { block_id: "root", block_type: 1, page: {}, children: ["parent"] },
      {
        block_id: "parent",
        block_type: 12,
        bullet: { elements: [{ text_run: { content: "拆分" } }] },
        children: ["child"],
      },
      {
        block_id: "child",
        block_type: 12,
        bullet: { elements: [{ text_run: { content: "同时检查多个维度" } }] },
      },
    ]);
    expect(result.bodyMarkdown).toContain("- 拆分\n\n    - 同时检查多个维度");
  });
});
