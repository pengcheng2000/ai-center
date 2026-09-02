// 回归契约：学习素材阅读器不得把父组件传入的 inline onProgress 回调身份当作 hook 依赖。
// 背景：CourseDetail 每次渲染都会创建新的 onProgress 闭包；若阅读器把它列入 useEffect/useCallback
// 依赖，会形成“进度上报 → mutation 状态更新 → 父重渲染 → effect 重建再上报”的更新风暴，
// 触发 Maximum update depth exceeded。修复契约是“经 ref 转发最新回调，hook 依赖保持稳定”。
// 说明：vitest 为 node 环境，无法挂载浏览器重度组件，因此以源码契约方式锁定该约定（与
// course-detail.contract.test.tsx 的静态契约风格一致）。
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const componentDir = import.meta.dirname;
const read = (name: string) => readFileSync(path.join(componentDir, name), "utf8");

// 依赖数组中出现 onProgress（直接依赖父级 inline 回调身份）即视为契约破坏。
const ON_PROGRESS_IN_DEPS = /\}, \[[^\]\n]*\bonProgress\b[^\]]*\]/;

describe("学习素材阅读器进度回调稳定性契约", () => {
  it("VideoPlayer 经 ref 转发 onProgress，report 身份稳定", () => {
    const source = read("VideoPlayer.tsx");
    expect(source).toMatch(/onProgressRef/);
    expect(source).not.toMatch(ON_PROGRESS_IN_DEPS);
    expect(source).toMatch(/const report = useCallback\([\s\S]*?\}, \[\]\);/);
  });

  it("DocReader 滚动测量 effect 不依赖 onProgress", () => {
    const source = read("DocReader.tsx");
    expect(source).toMatch(/onProgressRef/);
    expect(source).not.toMatch(ON_PROGRESS_IN_DEPS);
    expect(source).toMatch(/addEventListener\("scroll", measure, \{ passive: true \}\);\s*return \(\) => host\.removeEventListener\("scroll", measure\);\s*\}, \[\]\);/);
  });

  it("PdfReader 翻页上报 reportPage 身份稳定，observer 不随父渲染重建", () => {
    const source = read("PdfReader.tsx");
    expect(source).toMatch(/onProgressRef/);
    expect(source).not.toMatch(ON_PROGRESS_IN_DEPS);
    expect(source).toMatch(/const reportPage = useCallback\([\s\S]*?\}, \[\]\);/);
  });
});
