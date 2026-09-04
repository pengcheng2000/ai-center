import {
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  username: varchar("username", { length: 64 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const learningPaths = mysqlTable("learningPaths", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 160 }).notNull(),
  description: text("description").notNull(),
  level: mysqlEnum("level", ["beginner", "intermediate", "advanced"]).notNull().default("beginner"),
  category: varchar("category", { length: 80 }).notNull(),
  duration: varchar("duration", { length: 40 }).notNull(),
  lessonCount: int("lessonCount").notNull().default(0),
  accent: varchar("accent", { length: 24 }).notNull().default("violet"),
  tags: json("tags").$type<string[]>().notNull(),
  prerequisitePathIds: json("prerequisitePathIds").$type<number[]>().notNull(),
  lifecycleStatus: mysqlEnum("lifecycleStatus", ["draft", "published", "archived"]).notNull().default("published"),
  contentOwner: varchar("contentOwner", { length: 120 }).notNull().default("待指定"),
  businessOwner: varchar("businessOwner", { length: 120 }).notNull().default("待指定"),
  reviewStatus: mysqlEnum("reviewStatus", ["current", "due", "overdue"]).notNull().default("current"),
  reviewDueAt: timestamp("reviewDueAt"),
  version: varchar("version", { length: 40 }).notNull().default("v1.0"),
  changeNote: text("changeNote"),
  isFeatured: int("isFeatured").notNull().default(0),
  isPublished: int("isPublished").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("learning_paths_category_idx").on(table.category), index("learning_paths_review_idx").on(table.reviewStatus, table.reviewDueAt)]);

export const courses = mysqlTable("courses", {
  id: int("id").autoincrement().primaryKey(),
  pathId: int("pathId").notNull().references(() => learningPaths.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 180 }).notNull(),
  summary: text("summary").notNull(),
  duration: varchar("duration", { length: 32 }).notNull(),
  orderIndex: int("orderIndex").notNull().default(0),
  resourceType: mysqlEnum("resourceType", ["video", "article", "exercise", "template"]).notNull().default("article"),
  resourceUrl: varchar("resourceUrl", { length: 600 }),
  tags: json("tags").$type<string[]>().notNull(),
  prerequisiteCourseIds: json("prerequisiteCourseIds").$type<number[]>().notNull(),
  lifecycleStatus: mysqlEnum("lifecycleStatus", ["draft", "published", "archived"]).notNull().default("published"),
  contentOwner: varchar("contentOwner", { length: 120 }).notNull().default("待指定"),
  businessOwner: varchar("businessOwner", { length: 120 }).notNull().default("待指定"),
  reviewStatus: mysqlEnum("reviewStatus", ["current", "due", "overdue"]).notNull().default("current"),
  reviewDueAt: timestamp("reviewDueAt"),
  version: varchar("version", { length: 40 }).notNull().default("v1.0"),
  changeNote: text("changeNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("courses_path_idx").on(table.pathId, table.orderIndex), index("courses_review_idx").on(table.reviewStatus, table.reviewDueAt)]);

export const courseProgress = mysqlTable("courseProgress", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  courseId: int("courseId").notNull().references(() => courses.id, { onDelete: "cascade" }),
  progress: int("progress").notNull().default(0),
  lastMaterialId: int("lastMaterialId").references(() => courseMaterials.id, { onDelete: "set null" }),
  completedAt: timestamp("completedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("course_progress_user_course_unique").on(table.userId, table.courseId)]);

// 每个学习素材的阅读进度：视频记录秒数、PDF 记录页码、文档记录滚动百分比。
export const courseMaterialProgress = mysqlTable("courseMaterialProgress", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  materialId: int("materialId").notNull().references(() => courseMaterials.id, { onDelete: "cascade" }),
  position: int("position").notNull().default(0),
  percent: int("percent").notNull().default(0),
  minutes: int("minutes").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("course_material_progress_user_material_unique").on(table.userId, table.materialId)]);

// PDF 阅读标注：矩形区域以页面宽高的 0-1 归一化坐标存储，跨设备可还原。
export const courseMaterialAnnotations = mysqlTable("courseMaterialAnnotations", {
  id: int("id").autoincrement().primaryKey(),
  materialId: int("materialId").notNull().references(() => courseMaterials.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  page: int("page").notNull().default(1),
  rects: json("rects").$type<Array<{ x: number; y: number; w: number; h: number }>>().notNull(),
  note: text("note").notNull(),
  color: varchar("color", { length: 16 }).notNull().default("amber"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("course_material_annotations_material_idx").on(table.materialId, table.userId, table.page)]);

export const courseMaterials = mysqlTable("courseMaterials", {
  id: int("id").autoincrement().primaryKey(),
  courseId: int("courseId").notNull().references(() => courses.id, { onDelete: "cascade" }),
  materialType: mysqlEnum("materialType", ["document", "video", "practice"]).notNull(),
  sourceType: mysqlEnum("sourceType", ["url", "file", "inline"]).notNull().default("url"),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description"),
  sourceUrl: varchar("sourceUrl", { length: 600 }),
  storageKey: varchar("storageKey", { length: 600 }),
  mimeType: varchar("mimeType", { length: 120 }),
  content: text("content"),
  contentHtml: text("contentHtml"),
  contentFormat: mysqlEnum("contentFormat", ["html", "markdown", "plain"]).notNull().default("markdown"),
  config: json("config").$type<Record<string, unknown>>().notNull(),
  orderIndex: int("orderIndex").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("course_materials_course_idx").on(table.courseId, table.orderIndex)]);

export const courseMaterialComments = mysqlTable("courseMaterialComments", {
  id: int("id").autoincrement().primaryKey(),
  materialId: int("materialId").notNull().references(() => courseMaterials.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  videoSecond: int("videoSecond"),
  isDanmaku: int("isDanmaku").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("course_material_comments_material_idx").on(table.materialId, table.createdAt)]);

export const coursePracticeRuns = mysqlTable("coursePracticeRuns", {
  id: int("id").autoincrement().primaryKey(),
  materialId: int("materialId").notNull().references(() => courseMaterials.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  modelId: varchar("modelId", { length: 120 }).notNull(),
  prompt: text("prompt").notNull(),
  output: text("output").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("course_practice_runs_user_material_idx").on(table.userId, table.materialId, table.createdAt)]);

// 平台 AI 助手问答记录：含提问时的页面上下文，仅本人与授权运营可见。
export const assistantChats = mysqlTable("assistantChats", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  pageRoute: varchar("pageRoute", { length: 200 }),
  pageKind: varchar("pageKind", { length: 40 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("assistant_chats_user_idx").on(table.userId, table.createdAt)]);

export const newsSources = mysqlTable("newsSources", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 140 }).notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  sourceType: mysqlEnum("sourceType", ["rss", "website", "api", "manual"]).notNull().default("manual"),
  category: varchar("category", { length: 80 }).notNull(),
  description: text("description"),
  isEnabled: int("isEnabled").notNull().default(1),
  reviewStatus: mysqlEnum("reviewStatus", ["current", "due", "overdue"]).notNull().default("current"),
  lastProcessedAt: timestamp("lastProcessedAt"),
  totalProcessed: int("totalProcessed").notNull().default(0),
  scheduleEnabled: int("scheduleEnabled").notNull().default(0),
  syncIntervalHours: int("syncIntervalHours").notNull().default(24),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  scheduleLastRunAt: timestamp("scheduleLastRunAt"),
  scheduleLastError: text("scheduleLastError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("news_sources_category_idx").on(table.category), index("news_sources_schedule_task_idx").on(table.scheduleCronTaskUid)]);

// 员工端 AI 资讯首页的全局定时摘要配置。当前仅使用 id=1 的单例记录。
export const newsDigestSettings = mysqlTable("newsDigestSettings", {
  id: int("id").primaryKey(),
  isEnabled: int("isEnabled").notNull().default(0),
  intervalHours: int("intervalHours").notNull().default(24),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  lastRunAt: timestamp("lastRunAt"),
  lastGeneratedAt: timestamp("lastGeneratedAt"),
  lastError: text("lastError"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("news_digest_settings_task_idx").on(table.scheduleCronTaskUid)]);

export const newsDigests = mysqlTable("newsDigests", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 180 }).notNull(),
  summary: text("summary").notNull(),
  itemCount: int("itemCount").notNull().default(0),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
}, table => [index("news_digests_generated_idx").on(table.generatedAt)]);

export const newsItems = mysqlTable("newsItems", {
  id: int("id").autoincrement().primaryKey(),
  sourceId: int("sourceId").references(() => newsSources.id, { onDelete: "set null" }),
  digestId: int("digestId").references(() => newsDigests.id, { onDelete: "set null" }),
  title: varchar("title", { length: 240 }).notNull(),
  summary: text("summary").notNull(),
  content: text("content"),
  sourceUrl: varchar("sourceUrl", { length: 500 }),
  category: varchar("category", { length: 80 }).notNull(),
  tags: json("tags").$type<string[]>().notNull(),
  reviewStatus: mysqlEnum("reviewStatus", ["draft", "pending", "approved", "needs_review", "rejected"]).notNull().default("pending"),
  riskLevel: mysqlEnum("riskLevel", ["low", "medium", "high", "critical"]).default("low").notNull(),
  isFeatured: int("isFeatured").notNull().default(0),
  isDeleted: int("isDeleted").notNull().default(0),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy").references(() => users.id, { onDelete: "set null" }),
  deletionReason: text("deletionReason"),
  publishedAt: timestamp("publishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("news_items_status_idx").on(table.reviewStatus, table.category), index("news_items_deleted_idx").on(table.isDeleted, table.updatedAt), index("news_items_digest_idx").on(table.digestId)]);

export const newsFavorites = mysqlTable("newsFavorites", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  newsId: int("newsId").notNull().references(() => newsItems.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("news_favorites_user_news_unique").on(table.userId, table.newsId)]);

export const newsReadEvents = mysqlTable("newsReadEvents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  newsId: int("newsId").notNull().references(() => newsItems.id, { onDelete: "cascade" }),
  firstReadAt: timestamp("firstReadAt").defaultNow().notNull(),
  lastReadAt: timestamp("lastReadAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("news_read_user_news_unique").on(table.userId, table.newsId), index("news_read_news_idx").on(table.newsId)]);

export const communityPosts = mysqlTable("communityPosts", {
  id: int("id").autoincrement().primaryKey(),
  authorId: int("authorId").notNull().references(() => users.id, { onDelete: "cascade" }),
  postType: mysqlEnum("postType", ["experience", "question", "resource", "discussion"]).notNull().default("discussion"),
  title: varchar("title", { length: 180 }).notNull(),
  content: text("content").notNull(),
  contentHtml: text("contentHtml"),
  contentMarkdown: text("contentMarkdown"),
  // 历史帖子存 HTML（读取时转 Markdown 展示），新帖统一存 Markdown。
  contentFormat: mysqlEnum("contentFormat", ["html", "markdown"]).notNull().default("html"),
  tags: json("tags").$type<string[]>().notNull(),
  quotePostId: int("quotePostId"),
  replyPolicy: mysqlEnum("replyPolicy", ["all", "mentioned", "experts", "operations"]).notNull().default("all"),
  isPinned: int("isPinned").notNull().default(0),
  isFeatured: int("isFeatured").notNull().default(0),
  likeCount: int("likeCount").notNull().default(0),
  commentCount: int("commentCount").notNull().default(0),
  isDeleted: int("isDeleted").notNull().default(0),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy").references(() => users.id, { onDelete: "set null" }),
  deletionReason: text("deletionReason"),
  editedAt: timestamp("editedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("community_posts_recent_idx").on(table.createdAt), index("community_posts_type_idx").on(table.postType), index("community_posts_deleted_idx").on(table.isDeleted, table.createdAt)]);

export const postLikes = mysqlTable("postLikes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  postId: int("postId").notNull().references(() => communityPosts.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("post_likes_user_post_unique").on(table.userId, table.postId)]);

export const postFavorites = mysqlTable("postFavorites", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  postId: int("postId").notNull().references(() => communityPosts.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("post_favorites_user_post_unique").on(table.userId, table.postId)]);

export const postComments = mysqlTable("postComments", {
  id: int("id").autoincrement().primaryKey(),
  authorId: int("authorId").notNull().references(() => users.id, { onDelete: "cascade" }),
  postId: int("postId").notNull().references(() => communityPosts.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("post_comments_post_idx").on(table.postId, table.createdAt)]);

export const postAttachments = mysqlTable("postAttachments", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  postId: int("postId").references(() => communityPosts.id, { onDelete: "set null" }),
  fileKey: varchar("fileKey", { length: 560 }).notNull(),
  url: varchar("url", { length: 600 }).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("post_attachments_post_idx").on(table.postId), index("post_attachments_owner_idx").on(table.ownerId, table.postId)]);

export const userProfiles = mysqlTable("userProfiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  headline: varchar("headline", { length: 180 }).notNull().default("正在构建自己的 AI 工作方式"),
  department: varchar("department", { length: 120 }),
  roleTitle: varchar("roleTitle", { length: 120 }),
  abilityTags: json("abilityTags").$type<string[]>().notNull(),
  interestTags: json("interestTags").$type<string[]>().notNull(),
  growthGoals: json("growthGoals").$type<string[]>().notNull(),
  weeklyLearningMinutes: int("weeklyLearningMinutes").notNull().default(0),
  learningStreak: int("learningStreak").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("user_profiles_user_unique").on(table.userId)]);

export const workspaceItems = mysqlTable("workspaceItems", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 100 }).notNull(),
  description: varchar("description", { length: 240 }).notNull(),
  destination: varchar("destination", { length: 320 }).notNull(),
  icon: varchar("icon", { length: 48 }).notNull().default("sparkles"),
  color: varchar("color", { length: 24 }).notNull().default("violet"),
  orderIndex: int("orderIndex").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("workspace_items_user_idx").on(table.userId, table.orderIndex)]);

export const featureModules = mysqlTable("featureModules", {
  id: int("id").autoincrement().primaryKey(),
  moduleKey: varchar("moduleKey", { length: 64 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: varchar("description", { length: 240 }).notNull(),
  destination: varchar("destination", { length: 320 }).notNull(),
  icon: varchar("icon", { length: 48 }).notNull().default("grid"),
  audience: mysqlEnum("audience", ["all", "employee", "admin"]).notNull().default("employee"),
  isEnabled: int("isEnabled").notNull().default(1),
  orderIndex: int("orderIndex").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("feature_modules_key_unique").on(table.moduleKey), index("feature_modules_visible_idx").on(table.isEnabled, table.orderIndex)]);

export const enterpriseApps = mysqlTable("enterpriseApps", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  appUrl: varchar("appUrl", { length: 600 }).notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  icon: varchar("icon", { length: 48 }).notNull().default("blocks"),
  audience: mysqlEnum("audience", ["all", "employee", "admin"]).notNull().default("employee"),
  isEnabled: int("isEnabled").notNull().default(1),
  orderIndex: int("orderIndex").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("enterprise_apps_visible_idx").on(table.isEnabled, table.audience, table.orderIndex)]);

export const skillPackages = mysqlTable("skillPackages", {
  id: int("id").autoincrement().primaryKey(),
  skillKey: varchar("skillKey", { length: 64 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  summary: varchar("summary", { length: 360 }).notNull(),
  description: text("description").notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  tags: json("tags").$type<string[]>().notNull(),
  version: varchar("version", { length: 40 }).notNull().default("v1.0"),
  skillMd: text("skillMd").notNull(),
  usageGuide: text("usageGuide").notNull(),
  packageStorageKey: varchar("packageStorageKey", { length: 600 }).notNull(),
  packageFileName: varchar("packageFileName", { length: 180 }).notNull(),
  packageSizeBytes: int("packageSizeBytes").notNull(),
  authorId: int("authorId").notNull().references(() => users.id, { onDelete: "restrict" }),
  submissionSource: mysqlEnum("submissionSource", ["employee", "admin_direct", "agent"]).notNull().default("employee"),
  importBatchKey: varchar("importBatchKey", { length: 80 }),
  reviewStatus: mysqlEnum("reviewStatus", ["pending", "approved", "rejected", "archived"]).notNull().default("pending"),
  reviewNote: text("reviewNote"),
  reviewedBy: int("reviewedBy").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewedAt"),
  publishedAt: timestamp("publishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("skill_packages_key_unique").on(table.skillKey), index("skill_packages_catalog_idx").on(table.reviewStatus, table.category, table.publishedAt), index("skill_packages_author_idx").on(table.authorId, table.createdAt), index("skill_packages_import_batch_idx").on(table.submissionSource, table.importBatchKey, table.createdAt)]);

export const skillReviews = mysqlTable("skillReviews", {
  id: int("id").autoincrement().primaryKey(),
  skillId: int("skillId").notNull().references(() => skillPackages.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  rating: int("rating").notNull(),
  comment: text("comment").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("skill_reviews_user_skill_unique").on(table.userId, table.skillId), index("skill_reviews_skill_idx").on(table.skillId, table.updatedAt)]);

export const skillDownloads = mysqlTable("skillDownloads", {
  id: int("id").autoincrement().primaryKey(),
  skillId: int("skillId").notNull().references(() => skillPackages.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  downloadCount: int("downloadCount").notNull().default(1),
  firstDownloadedAt: timestamp("firstDownloadedAt").defaultNow().notNull(),
  lastDownloadedAt: timestamp("lastDownloadedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("skill_downloads_user_skill_unique").on(table.userId, table.skillId), index("skill_downloads_user_idx").on(table.userId, table.lastDownloadedAt)]);

export const agentImportKeys = mysqlTable("agentImportKeys", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  tokenPrefix: varchar("tokenPrefix", { length: 28 }).notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull(),
  allowedTargets: json("allowedTargets").$type<Array<"news" | "course_material" | "skill">>().notNull(),
  createdBy: int("createdBy").notNull().references(() => users.id, { onDelete: "restrict" }),
  isEnabled: int("isEnabled").notNull().default(1),
  lastUsedAt: timestamp("lastUsedAt"),
  expiresAt: timestamp("expiresAt"),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("agent_import_keys_token_hash_unique").on(table.tokenHash), index("agent_import_keys_active_idx").on(table.isEnabled, table.expiresAt)]);

export const agentImportAssets = mysqlTable("agentImportAssets", {
  id: int("id").autoincrement().primaryKey(),
  importKeyId: int("importKeyId").notNull().references(() => agentImportKeys.id, { onDelete: "cascade" }),
  assetType: mysqlEnum("assetType", ["image", "document", "package"]).notNull(),
  sourceUrl: varchar("sourceUrl", { length: 800 }),
  storageKey: varchar("storageKey", { length: 600 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 600 }).notNull(),
  fileName: varchar("fileName", { length: 180 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
  checksum: varchar("checksum", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("agent_import_assets_key_idx").on(table.importKeyId, table.createdAt), index("agent_import_assets_checksum_idx").on(table.checksum)]);

export const agentImportJobs = mysqlTable("agentImportJobs", {
  id: int("id").autoincrement().primaryKey(),
  importKeyId: int("importKeyId").notNull().references(() => agentImportKeys.id, { onDelete: "restrict" }),
  targetType: mysqlEnum("targetType", ["news", "course_material", "skill"]).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  sourceUrl: varchar("sourceUrl", { length: 800 }).notNull(),
  sourceTitle: varchar("sourceTitle", { length: 300 }),
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  assetIds: json("assetIds").$type<number[]>().notNull(),
  status: mysqlEnum("status", ["pending_review", "applied", "rejected", "failed"]).notNull().default("pending_review"),
  reviewNote: text("reviewNote"),
  reviewedBy: int("reviewedBy").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewedAt"),
  resultType: varchar("resultType", { length: 80 }),
  resultId: int("resultId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("agent_import_jobs_key_idempotency_unique").on(table.importKeyId, table.idempotencyKey), index("agent_import_jobs_status_idx").on(table.status, table.createdAt)]);

export const auditAgents = mysqlTable("auditAgents", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description").notNull(),
  modelPreference: varchar("modelPreference", { length: 120 }).notNull().default("gpt-5-mini"),
  selectedModelId: int("selectedModelId").references(() => llmModels.id, { onDelete: "set null" }),
  confidenceThreshold: int("confidenceThreshold").notNull().default(72),
  isEnabled: int("isEnabled").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("audit_agents_selected_model_idx").on(table.selectedModelId)]);

export const auditRules = mysqlTable("auditRules", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").references(() => auditAgents.id, { onDelete: "set null" }),
  name: varchar("name", { length: 140 }).notNull(),
  description: text("description").notNull(),
  riskLevel: mysqlEnum("riskLevel", ["low", "medium", "high", "critical"]).notNull().default("medium"),
  keywords: json("keywords").$type<string[]>().notNull(),
  isEnabled: int("isEnabled").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("audit_rules_agent_idx").on(table.agentId, table.isEnabled)]);

export const auditRecords = mysqlTable("auditRecords", {
  id: int("id").autoincrement().primaryKey(),
  newsId: int("newsId").notNull().references(() => newsItems.id, { onDelete: "cascade" }),
  agentId: int("agentId").references(() => auditAgents.id, { onDelete: "set null" }),
  decision: mysqlEnum("decision", ["approved", "needs_review", "rejected"]).notNull(),
  riskLevel: mysqlEnum("riskLevel", ["low", "medium", "high", "critical"]).notNull(),
  confidence: int("confidence").notNull(),
  reason: text("reason").notNull(),
  matchedRules: json("matchedRules").$type<string[]>().notNull(),
  reviewerId: int("reviewerId").references(() => users.id, { onDelete: "set null" }),
  reviewAssigneeId: int("reviewAssigneeId").references(() => users.id, { onDelete: "set null" }),
  manualDecision: mysqlEnum("manualDecision", ["approved", "needs_review", "rejected"]),
  reviewNote: text("reviewNote"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("audit_records_news_idx").on(table.newsId, table.createdAt), index("audit_records_decision_idx").on(table.decision, table.riskLevel)]);

export const llmProviders = mysqlTable("llmProviders", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  providerType: mysqlEnum("providerType", ["openai", "anthropic", "azure_openai", "custom"]).notNull().default("custom"),
  baseUrl: varchar("baseUrl", { length: 600 }).notNull(),
  keyAlias: varchar("keyAlias", { length: 120 }).notNull(),
  healthStatus: mysqlEnum("healthStatus", ["unknown", "healthy", "degraded", "disabled"]).notNull().default("unknown"),
  gatewayStatus: mysqlEnum("gatewayStatus", ["not_connected", "verified", "failed"]).notNull().default("not_connected"),
  gatewayCheckedAt: timestamp("gatewayCheckedAt"),
  gatewayLastError: varchar("gatewayLastError", { length: 600 }),
  isEnabled: int("isEnabled").notNull().default(1),
  reviewStatus: mysqlEnum("reviewStatus", ["current", "due", "overdue"]).notNull().default("current"),
  orderIndex: int("orderIndex").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("llm_providers_name_unique").on(table.name), index("llm_providers_enabled_idx").on(table.isEnabled, table.orderIndex)]);

export const llmModels = mysqlTable("llmModels", {
  id: int("id").autoincrement().primaryKey(),
  providerId: int("providerId").notNull().references(() => llmProviders.id, { onDelete: "cascade" }),
  modelId: varchar("modelId", { length: 160 }).notNull(),
  displayName: varchar("displayName", { length: 160 }).notNull(),
  capabilityTags: json("capabilityTags").$type<string[]>().notNull(),
  scenarioTags: json("scenarioTags").$type<string[]>().notNull(),
  contextWindow: int("contextWindow").notNull().default(0),
  isDefault: int("isDefault").notNull().default(0),
  isEnabled: int("isEnabled").notNull().default(1),
  orderIndex: int("orderIndex").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("llm_models_provider_model_unique").on(table.providerId, table.modelId), index("llm_models_enabled_idx").on(table.isEnabled, table.orderIndex)]);

export const modelRoutingPolicies = mysqlTable("modelRoutingPolicies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  scenario: mysqlEnum("scenario", ["default", "audit", "learning", "content"]).notNull().default("default"),
  primaryModelId: int("primaryModelId").references(() => llmModels.id, { onDelete: "set null" }),
  fallbackModelIds: json("fallbackModelIds").$type<number[]>().notNull(),
  isEnabled: int("isEnabled").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("model_policy_scenario_unique").on(table.scenario)]);

export const communityTopics = mysqlTable("communityTopics", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  description: varchar("description", { length: 280 }).notNull(),
  color: varchar("color", { length: 24 }).notNull().default("violet"),
  isEnabled: int("isEnabled").notNull().default(1),
  reviewStatus: mysqlEnum("reviewStatus", ["current", "due", "overdue"]).notNull().default("current"),
  isFeatured: int("isFeatured").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("community_topics_name_unique").on(table.name), index("community_topics_visible_idx").on(table.isEnabled, table.isFeatured)]);

export const communityTopicFollows = mysqlTable("communityTopicFollows", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  topicId: int("topicId").notNull().references(() => communityTopics.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("community_topic_follow_unique").on(table.userId, table.topicId)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
