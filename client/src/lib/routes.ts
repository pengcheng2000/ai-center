export const workbenchRoutes = {
  learningPath: (pathId: number) => `/learn/${pathId}`,
  course: (pathId: number, courseId: number) => `/learn/${pathId}/course/${courseId}`,
  newsArticle: (newsId: number) => `/news/${newsId}`,
  communityComposer: "/community/new",
} as const;
