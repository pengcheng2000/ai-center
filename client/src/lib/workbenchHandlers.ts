import { workbenchRoutes } from "./routes";

export type Navigate = (to: string) => void;

export const workbenchHandlers = {
  openLearningPath(navigate: Navigate, pathId: number) {
    navigate(workbenchRoutes.learningPath(pathId));
  },
  openNewsArticle(navigate: Navigate, newsId: number) {
    navigate(workbenchRoutes.newsArticle(newsId));
  },
  openCommunityComposer(navigate: Navigate) {
    navigate(workbenchRoutes.communityComposer);
  },
} as const;
