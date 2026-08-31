import { describe, expect, it } from "vitest";
import { canShowTimestampComment, resolveDocumentDisplay, supportsPracticeHistory, VIDEO_PLAYBACK_SPEEDS } from "../client/src/lib/courseExperience";

describe("课程资源员工端呈现契约", () => {
  it("按内联正文、图片、PDF、链接与缺失资源选择文档呈现方式", () => {
    expect(resolveDocumentDisplay({ content: "# Markdown" })).toBe("markdown");
    expect(resolveDocumentDisplay({ mimeType: "image/png", url: "/asset.png" })).toBe("image");
    expect(resolveDocumentDisplay({ mimeType: "application/pdf", url: "/guide.pdf" })).toBe("pdf");
    expect(resolveDocumentDisplay({ mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", url: "/guide.docx" })).toBe("link");
    expect(resolveDocumentDisplay({})).toBe("missing");
  });
  it("仅视频显示时间戳互动，实操资源显示个人运行历史并提供受限倍速", () => {
    expect(canShowTimestampComment("video")).toBe(true); expect(canShowTimestampComment("document")).toBe(false); expect(supportsPracticeHistory("practice")).toBe(true); expect(supportsPracticeHistory("video")).toBe(false); expect(VIDEO_PLAYBACK_SPEEDS).toEqual([0.75, 1, 1.25, 1.5, 2]);
  });
});
