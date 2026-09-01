import { describe, expect, it } from "vitest";
import { assignDanmakuLanes, canShowTimestampComment, clampPercent, formatClock, materialKindOf, pdfPercent, progressState, resolveDocumentDisplay, supportsPracticeHistory, videoPercent, VIDEO_PLAYBACK_SPEEDS, visibleDanmaku } from "../client/src/lib/learnExperience";

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
  it("视频文件误标为文档时按 mime 兜底为视频，避免只渲染下载链接", () => {
    expect(materialKindOf({ materialType: "document", mimeType: "video/mp4" })).toBe("video");
    expect(materialKindOf({ materialType: "document", mimeType: "video/webm" })).toBe("video");
    expect(materialKindOf({ materialType: "video", mimeType: null })).toBe("video");
    expect(materialKindOf({ materialType: "document", mimeType: "application/pdf" })).toBe("pdf");
    expect(materialKindOf({ materialType: "document", mimeType: "text/markdown" })).toBe("document");
    expect(materialKindOf({ materialType: "practice", mimeType: "video/mp4" })).toBe("practice");
  });
});

describe("学习进度换算", () => {
  it("视频观看 92% 即视为完成，页码按总页数换算百分比", () => {
    expect(videoPercent(0, 100)).toBe(0);
    expect(videoPercent(50, 100)).toBe(50);
    expect(videoPercent(92, 100)).toBe(100);
    expect(videoPercent(150, 100)).toBe(100);
    expect(videoPercent(30, 0)).toBe(0);
    expect(pdfPercent(1, 10)).toBe(10);
    expect(pdfPercent(10, 10)).toBe(100);
    expect(pdfPercent(3, 0)).toBe(0);
  });
  it("百分比夹取到 0-100 并给出三态徽标文案", () => {
    expect(clampPercent(-5)).toBe(0); expect(clampPercent(120)).toBe(100);
    expect(progressState(100).tone).toBe("done");
    expect(progressState(45).tone).toBe("active");
    expect(progressState(0).tone).toBe("idle");
    expect(progressState(0).label).toBe("未开始");
  });
  it("格式化播放时间为 mm:ss / h:mm:ss", () => {
    expect(formatClock(0)).toBe("0:00"); expect(formatClock(65)).toBe("1:05"); expect(formatClock(3671)).toBe("1:01:11");
  });
});

describe("弹幕调度", () => {
  const items = [
    { id: 1, content: "第一条", second: 10, authorName: "A" },
    { id: 2, content: "第二条", second: 11, authorName: "B" },
    { id: 3, content: "第三条", second: 11.5, authorName: "C" },
  ];
  it("时间相近的弹幕分到不同轨道", () => {
    const lanes = assignDanmakuLanes(items);
    const closeLanes = lanes.filter(lane => Math.abs(lane.item.second - 11) < 2).map(lane => lane.track);
    expect(new Set(closeLanes).size).toBe(closeLanes.length);
  });
  it("只显示时间轴窗口内的弹幕", () => {
    const lanes = assignDanmakuLanes(items);
    expect(visibleDanmaku(lanes, 5)).toHaveLength(0);
    expect(visibleDanmaku(lanes, 11).map(lane => lane.item.id)).toEqual([1, 2]);
    expect(visibleDanmaku(lanes, 11.5).map(lane => lane.item.id)).toEqual([1, 2, 3]);
    expect(visibleDanmaku(lanes, 25)).toHaveLength(0);
  });
  it("空弹幕与极端时间不崩溃", () => {
    expect(assignDanmakuLanes([])).toEqual([]);
    expect(visibleDanmaku([], 10)).toEqual([]);
  });
});
