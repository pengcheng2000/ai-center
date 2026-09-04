# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

「全员 AI 能力提升平台」——企业内部 AI 学习、资讯、实践沉淀与运营治理中台。全栈 TypeScript 单仓：React 19 前端 + Express 4/tRPC 11 后端 + MySQL/TiDB (Drizzle ORM)。依赖 Manus 托管环境（OAuth 认证、内置 LLM 网关、对象存储），代码注释、UI 文案与提交信息均使用中文。

## 常用命令

```bash
pnpm install --frozen-lockfile   # 安装依赖（Node 22+，pnpm 10+）
pnpm dev                         # 开发模式启动（默认端口 3000，被占用时自动递增）
pnpm test                        # Vitest 全量测试
pnpm vitest run server/rss.test.ts   # 运行单个测试文件
pnpm check                       # TypeScript 类型检查 (tsc --noEmit)
pnpm build                       # 构建：前端 → dist/public，服务端 esbuild 打包 → dist/
pnpm start                       # 生产模式运行构建产物
pnpm format                      # Prettier 格式化
```

数据库迁移（需要 `DATABASE_URL` 指向 MySQL/TiDB）：

```bash
pnpm drizzle-kit generate        # 依据 drizzle/schema.ts 生成迁移 SQL
pnpm drizzle-kit migrate         # 应用迁移
```

**禁止**用 `pnpm db:push`（即 generate + migrate 直连）作为生产库的迁移方式——缺少人工审阅环节。schema 变更必须先人工审阅 `drizzle/` 下新增 SQL（确认无意外 DROP/截断）再 migrate。

## 变更流程约定

任何涉及数据的变更按此顺序：修改 `drizzle/schema.ts` → `generate` 并审阅迁移 → `migrate` → 改服务端/前端 → 补充 Vitest 测试 → `pnpm test && pnpm check` 全绿。涉及发布内容、审核、权限、删除、员工个人数据或外部来源时，优先选择**可恢复、可审计、最小权限**的设计。

## 架构

### 三层目录

- `client/src/` — React 19 SPA。Wouter 路由（`App.tsx` 集中声明所有路由），TanStack Query + tRPC client（`lib/trpc.ts`），shadcn/ui 组件在 `components/ui/`。页面按员工端（`/learn`、`/news`、`/community`、`/skills`、`/apps`、`/me`）与管理运营端（`/operations/*`）划分。
- `server/` — Express + tRPC。业务逻辑几乎全部集中在 `routers/platform.ts`（单一 platform router，按个人画像/学习/资讯/社区/运营治理/Skills 等划分子 router）。
- `shared/` — 前后端共享类型与常量（经 `@shared` alias 引用）。
- `drizzle/` — schema 定义 + 编号 SQL 迁移（`0000_*` ~ `0018_*`）。

### server/_core 是平台层，业务层是 server/ 根目录

`server/_core/`（入口 `index.ts`）属于 Manus 托管平台适配层：OAuth 登录（`authRoutes.ts`）、会话 Cookie（`cookies.ts`）、tRPC context（`context.ts`/`trpc.ts`）、LLM 网关（`llm.ts`）、对象存储代理（`storageProxy.ts`）、开发期 Vite 中间件（`vite.ts`）。业务代码（`routers/`、`newsSync.ts`、`rss.ts`、`courseCapture.ts`、`agentImport.ts`、`db.ts`）不应绕过这层直接持有密钥或直连存储。若迁移到非 Manus 环境，需替换 `llm.ts` 与 `storage.ts` 为企业自建网关/S3 适配。

### 除 tRPC 外的 Express 路由

`server/_core/index.ts` 中挂载了四组非 tRPC 路由，修改时注意与 tRPC 边界保持一致：认证回调（authRoutes）、附件签名访问代理（storageProxy）、RSS 每日同步计划回调（scheduledNews，受认证保护）、外部 Agent 内容导入 API（agentImport）。

### 权限模型（tRPC procedure 三级）

- `publicProcedure` — 公开
- `protectedProcedure` — 需登录（中间件注入 `ctx.user`）
- `adminProcedure` — 需 `role === 'admin'`，运营配置、审核记录、删除/恢复、内容维护全部走这一级

员工私有数据（画像、Workspace、收藏、阅读、学习进度、下载资产）所有查询/写入必须以 `userId` 为作用域；前端不展示阅读者身份等个体行为。

## 安全与治理不变量（改动时必须维持）

- **密钥别名**：LLM 供应商记录只保存 Secret 别名（`secretAlias`），原始 API Key 绝不写入业务数据库；测试连接仅对 `gatewayStatus=verified` 的模型放行。
- **审核责任链**：AI 审核只在低/中风险且达到置信阈值时直决；高风险/关键/低置信一律人工复核。管理员删除为软删除且必须记录原因，恢复后回到人工复核，不绕过审核。
- **内容导入**：外部 Agent 只能凭最小权限、可撤销令牌提交**待审核草稿**（`agentImportJobs`），图片/附件经平台代理存储，导入产物必须人工审核后才可发布；Skills ZIP 包从不解压/执行（服务端只校验 MIME、大小 8MB、ZIP 头）。
- **资源生命周期**：课程资源过期走归档而非物理删除，保留学习与运营历史。

## 测试

- 仅服务端测试：`vitest.config.ts` 的 include 为 `server/**/*.test.ts` / `**/*.spec.ts`，node 环境。
- 回归基线：16 个测试文件、87 项测试 + `pnpm check` 全部通过；改动治理/权限/审核相关逻辑后必须跑全量。
- 测试多为契约式：直接 import `server/routers/platform.ts` 导出的 schema/纯函数（如 `sanitizeRichText`、`parseAuditResult`、`ownedFavoriteValues`）和权限中间件行为进行断言。新增业务校验逻辑时优先做成可导出的纯函数以便测试。

## 其他注意

- `wouter@3.7.1` 使用了 `patches/` 下的 pnpm patch，升级路由库时注意补丁是否仍适用。
- 路径别名：`@/` → `client/src`，`@shared/` → `shared`（vite/vitest/tsconfig 三处均已配置）。
- 必需环境变量见 `DEPLOYMENT.md` 第 2 节（`DATABASE_URL`、`JWT_SECRET`、`OAUTH_SERVER_URL`、`OWNER_OPEN_ID` 等），由 `server/_core/env.ts` 统一读取，不提交 `.env`。
- 首次启动会执行 `ensurePlatformBootstrap` / `ensureGovernanceBootstrap` / `ensureLocalAdmin`（`server/db.ts`）初始化种子数据与首位管理员（`OWNER_OPEN_ID`）。
