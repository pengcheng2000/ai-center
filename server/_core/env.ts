import path from "node:path";

export const ENV = {
  appId: process.env.APP_ID ?? "ai-empowerment-hub",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  llmBaseUrl: process.env.LLM_BASE_URL ?? "",
  llmApiKey: process.env.LLM_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL ?? "",
  localAdminUsername: process.env.LOCAL_ADMIN_USERNAME ?? "admin",
  localAdminPassword: process.env.LOCAL_ADMIN_PASSWORD ?? "admin123456",
  localAdminName: process.env.OWNER_NAME ?? "平台管理员",
  dataDir: process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(process.cwd(), ".data"),
};
