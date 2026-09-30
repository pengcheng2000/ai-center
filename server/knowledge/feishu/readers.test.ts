import { describe, expect, it, vi } from "vitest";
import { FeishuClient } from "./client";
import { readDocxBlocks } from "./docxReader";
import { normalizeDocx, normalizeFile } from "./normalizer";
import { readWikiDirectory } from "./wikiReader";
import { packLocators, packStructured } from "../types";
import { activeSlotKey } from "../publication";
import { sanitizeHtmlSnapshot } from "../../safeHtml";

function fakeClient(responses: Array<Record<string, unknown>>) {
  const json = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("Unexpected page");
    return next;
  });
  return { client: { json } as unknown as FeishuClient, json };
}

describe("Feishu Knowledge readers and normalization", () => {
  it("completes every directory page and child branch without following shortcuts", async () => {
    const root = (token: string, type: string, hasChild: boolean) => ({
      node_token: token,
      obj_token: `obj-${token}`,
      obj_type: "docx",
      node_type: type,
      title: token,
      has_child: hasChild,
    });
    const { client, json } = fakeClient([
      {
        items: [
          root("doc", "origin", true),
          root("shortcut", "shortcut", true),
        ],
        has_more: true,
        page_token: "page-2",
      },
      { items: [], has_more: false },
      {
        items: [
          { ...root("child", "origin", false), parent_node_token: "doc" },
        ],
        has_more: false,
      },
    ]);
    const result = await readWikiDirectory(client, "space");
    expect(result).toMatchObject({ pages: 3 });
    expect(result.nodes.map(node => node.nodeToken)).toEqual([
      "doc",
      "shortcut",
      "child",
    ]);
    expect(json.mock.calls).toHaveLength(3);
    expect(json.mock.calls[2][0]).toContain("parent_node_token=doc");
  });

  it("rejects an incomplete pagination token instead of treating it as a complete traversal", async () => {
    const { client } = fakeClient([{ items: [], has_more: true }]);
    await expect(readWikiDirectory(client, "space")).rejects.toMatchObject({
      stage: "wiki_pagination",
    });
  });

  it("reads all Docx block pages", async () => {
    const { client } = fakeClient([
      { items: [{ block_id: "one" }], has_more: true, page_token: "two" },
      { items: [{ block_id: "two" }], has_more: false },
    ]);
    expect(await readDocxBlocks(client, "doc")).toMatchObject({
      pages: 2,
      blocks: [{ block_id: "one" }, { block_id: "two" }],
    });
  });

  it("keeps headings, links, tables and image references, while marking unknown blocks", () => {
    const blocks = [
      {
        block_id: "root",
        block_type: 1,
        children: ["heading", "table", "image", "board"],
        page: {},
      },
      {
        block_id: "heading",
        block_type: 3,
        parent_id: "root",
        heading1: {
          elements: [{ text_run: { content: "案例", text_element_style: {} } }],
        },
      },
      {
        block_id: "table",
        block_type: 31,
        parent_id: "root",
        table: { cells: ["cell"], property: { column_size: 1 } },
      },
      {
        block_id: "cell",
        block_type: 32,
        parent_id: "table",
        children: ["text"],
        table_cell: {},
      },
      {
        block_id: "text",
        block_type: 2,
        parent_id: "cell",
        text: {
          elements: [
            {
              text_run: {
                content: "原文",
                text_element_style: { link: { url: "https://example.com" } },
              },
            },
          ],
        },
      },
      {
        block_id: "image",
        block_type: 27,
        parent_id: "root",
        image: { token: "image-token" },
      },
      { block_id: "board", block_type: 43, parent_id: "root", board: {} },
    ];
    const result = normalizeDocx("样本", blocks);
    expect(result.bodyMarkdown).toContain("# 案例");
    expect(result.bodyMarkdown).toContain("[原文](https://example.com/)");
    expect(result.bodyMarkdown).toContain("knowledge-asset:image-");
    expect(result.assets).toHaveLength(1);
    expect(result.renderStatus).toBe("incomplete");
    expect(result.unsupportedSummary).toMatchObject({ board: 1 });
    expect(result.rawSnapshot).toContain('"block_type":43');
  });

  it("preserves readable descendants of grid, view and unknown containers", () => {
    const blocks = [
      {
        block_id: "root",
        block_type: 1,
        children: ["grid", "unknown"],
        page: {},
      },
      {
        block_id: "grid",
        block_type: 24,
        children: ["view"],
        parent_id: "root",
        grid: {},
      },
      {
        block_id: "view",
        block_type: 25,
        children: ["nested"],
        parent_id: "grid",
        view: {},
      },
      {
        block_id: "nested",
        block_type: 2,
        parent_id: "view",
        text: { elements: [{ text_run: { content: "格子中的正文" } }] },
      },
      {
        block_id: "unknown",
        block_type: 999,
        children: ["nested-two"],
        parent_id: "root",
        custom: {},
      },
      {
        block_id: "nested-two",
        block_type: 2,
        parent_id: "unknown",
        text: { elements: [{ text_run: { content: "未知容器中的正文" } }] },
      },
    ];
    const result = normalizeDocx("样本", blocks);
    expect(result.bodyMarkdown).toContain("格子中的正文");
    expect(result.bodyMarkdown).toContain("未知容器中的正文");
    expect(result.unsupportedSummary).toMatchObject({
      grid_linearized: 1,
      view_linearized: 1,
      custom: 1,
    });
  });

  it("moves large structured content out of JSON columns and limits compact locators", () => {
    expect(
      packStructured({ payload: "x".repeat(270_000) }).structuredStorageData
    ).toHaveLength(270_014);
    expect(packStructured({ payload: "small" }).structuredData).toEqual({
      payload: "small",
    });
    expect(
      packLocators(
        Object.fromEntries(
          Array.from({ length: 5000 }, (_, index) => [
            `block-${index}`,
            { title: "x".repeat(40) },
          ])
        )
      ).locatorTruncated
    ).toBe(true);
  });

  it("uses a fixed-length publication slot and blocks remote images in Knowledge HTML", () => {
    expect(activeSlotKey(1, "knowledge_cases", "default")).toMatch(
      /^[a-f0-9]{64}$/
    );
    expect(activeSlotKey(1, "knowledge_cases", "default")).not.toBe(
      activeSlotKey(1, "knowledge_cases", "other")
    );
    const html = sanitizeHtmlSnapshot(
      '<p>内容</p><img src="https://remote.example/image.png">',
      { allowRemoteImages: false }
    );
    expect(html).not.toContain("https://remote.example");
  });

  it("does not truncate long Knowledge Markdown and reports stripped remote HTML images", () => {
    const markdown = `# 标题\n\n${"长正文".repeat(120_000)}`;
    expect(
      normalizeFile("guide.md", Buffer.from(markdown)).bodyMarkdown?.length
    ).toBe(markdown.length);
    const html = normalizeFile(
      "guide.html",
      Buffer.from('<p>正文</p><img src="https://remote.example/image.png">')
    );
    expect(html.bodyHtml).not.toContain("remote.example");
    expect(html.renderStatus).toBe("incomplete");
  });
});
