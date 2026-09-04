import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { workbenchRoutes } from "../client/src/lib/routes";
import { workbenchHandlers } from "../client/src/lib/workbenchHandlers";

describe("workbench navigation contracts", () => {
  it("maps the primary workbench learning entry to the path detail route", () => {
    expect(workbenchRoutes.learningPath(12)).toBe("/learn/12");
  });

  it("maps a learning task to its nested course detail route", () => {
    expect(workbenchRoutes.course(12, 38)).toBe("/learn/12/course/38");
  });

  it("maps trusted news and the practice call-to-action to their dedicated routes", () => {
    expect(workbenchRoutes.newsArticle(7)).toBe("/news/7");
    expect(workbenchRoutes.communityComposer).toBe("/community/new");
  });

  it("executes actual workbench click handlers against the navigation target", () => {
    const navigate = vi.fn();
    workbenchHandlers.openLearningPath(navigate, 12);
    workbenchHandlers.openNewsArticle(navigate, 7);
    workbenchHandlers.openCommunityComposer(navigate);
    expect(navigate).toHaveBeenNthCalledWith(1, "/learn/12");
    expect(navigate).toHaveBeenNthCalledWith(2, "/news/7");
    expect(navigate).toHaveBeenNthCalledWith(3, "/community/new");
  });

  it("binds the real home and learning-task entrypoints to the tested navigation layer", () => {
    const home = readFileSync(
      resolve(process.cwd(), "client/src/pages/Home.tsx"),
      "utf8"
    );
    const pathDetail = readFileSync(
      resolve(process.cwd(), "client/src/pages/LearningPathDetail.tsx"),
      "utf8"
    );
    expect(home).toMatch(
      /workbenchHandlers\.openLearningPath\(\s*setLocation,\s*item\.path\.id\s*\)/
    );
    expect(home).toContain(
      "workbenchHandlers.openNewsArticle(setLocation, item.id)"
    );
    expect(home).toContain(
      "workbenchHandlers.openCommunityComposer(setLocation)"
    );
    expect(pathDetail).toContain("workbenchRoutes.course(path.id, course.id)");
  });
});
