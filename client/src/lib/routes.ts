export const workbenchRoutes = {
  learningPath: (pathId: number) => `/learn/${pathId}`,
  course: (pathId: number, courseId: number) => `/learn/${pathId}/course/${courseId}`,
  knowledge: "/learn/knowledge",
  knowledgeDetail: (itemId: number) => `/learn/knowledge/${itemId}`,
  newsArticle: (newsId: number) => `/news/${newsId}`,
  communityComposer: "/community/new",
} as const;
