// 播放体验回归契约：评论成功不能让课程查询失效，避免 signed URL 变化导致视频重载；
// 弹幕位置使用合成层 transform，减少 timeupdate 带来的布局抖动。
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const videoSource = readFileSync(path.join(import.meta.dirname, "VideoPlayer.tsx"), "utf8");
const courseSource = readFileSync(path.join(import.meta.dirname, "../../pages/CourseDetail.tsx"), "utf8");

describe("视频弹幕播放稳定性契约", () => {
  it("评论提交不触发整课 experience invalidate", () => {
    expect(videoSource).toContain("onCommentAdded?.(result)");
    expect(videoSource).not.toContain("courseExperience.invalidate");
    expect(courseSource).toContain("onCommentAdded={appendComment}");
  });

  it("弹幕使用 transform 合成层移动，不使用 right 布局移动", () => {
    expect(videoSource).toContain("translate3d");
    expect(videoSource).toContain("willChange: \"transform, opacity\"");
    expect(videoSource).not.toContain("right: `${-30 + progress * 130}%`");
  });

  it("发送按钮不通过播放控制暂停视频", () => {
    const composer = videoSource.slice(videoSource.indexOf("弹幕输入"));
    expect(composer).not.toContain("pause()");
    expect(composer).toContain("addComment.mutate");
  });
});
