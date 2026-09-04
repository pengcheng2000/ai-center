# 全员 AI 能力提升平台：部署清单

> **工程基线**：学习内容台账、三类课程资源、资讯时间线与聚合阅读信号、受管模型连接测试、企业应用中心、含互动和个人资产视图的 Skills 广场、外部 Agent 内容草稿导入，以及管理员批量直接导入 Skills 版本。  
> **技术栈**：React 19、Vite 7、Express 4、tRPC 11、Drizzle ORM、MySQL/TiDB、Manus OAuth、对象存储与内置 AI 网关。  
> **验证基线**：29 个测试文件、159 项测试、TypeScript 类型检查与生产构建通过。
> **数据库迁移**：`0000` 至 `0026_kind_professor_monster`。

本工程包不包含 `node_modules/`、运行日志、构建产物、数据库数据或 `.env` 文件。原始模型密钥不写入业务表；供应商配置只保留受管密钥别名。

## 1. 发布前清单

| 检查项 | 操作 | 通过标准 |
|---|---|---|
| 依赖 | `pnpm install --frozen-lockfile` | 依赖锁定并安装成功。 |
| 数据库 | `pnpm drizzle-kit migrate` | 所有已提交迁移应用成功。 |
| 回归 | `pnpm test && pnpm check` | 159 项测试和类型检查通过。 |
| 构建 | `pnpm build` | 生成 `dist/`，且无构建错误。 |
| 密钥 | 在部署平台配置全部必需变量 | 不提交 `.env`，不在日志打印密钥。 |
| 管理员 | 核对 `OWNER_OPEN_ID` 或首位管理员角色 | 可进入运营管理页面。 |
| 学习资源 | 核对 `courseMaterials` 与课程 ID 关联记录 | 课程页能看到结构化素材；无素材课程显示“暂无可学习资源”，不应误报复审状态。 |

## 2. 环境变量

项目通过 `server/_core/env.ts` 读取服务端变量。不同环境必须使用独立数据库、OAuth 回调地址与密钥。

| 变量 | 是否必需 | 用途 |
|---|---:|---|
| `DATABASE_URL` | 是 | MySQL/TiDB 连接串。 |
| `VITE_APP_ID` | 是 | OAuth 应用标识。 |
| `JWT_SECRET` | 是 | 会话 Cookie 签名密钥。 |
| `OAUTH_SERVER_URL` | 是 | OAuth 服务地址。 |
| `VITE_OAUTH_PORTAL_URL` | 使用 Manus OAuth 时必需 | 前端登录门户。 |
| `OWNER_OPEN_ID` | 是 | 首位运营管理员的 Open ID。 |
| `OWNER_NAME` | 建议 | 管理员初始化显示名称。 |
| `BUILT_IN_FORGE_API_URL` | AI 审核/对象存储时必需 | Manus 内置网关地址。 |
| `BUILT_IN_FORGE_API_KEY` | AI 审核/对象存储时必需 | 内置网关服务端凭据。 |
| `VITE_FRONTEND_FORGE_API_URL`、`VITE_FRONTEND_FORGE_API_KEY` | 由前端受控网关能力决定 | 前端网关配置。 |
| `VITE_ANALYTICS_ENDPOINT`、`VITE_ANALYTICS_WEBSITE_ID` | 可选 | 聚合访问分析。 |

> 不要把外部 LLM 的原始 API Key 填入供应商业务记录。应将密钥放入部署平台 Secret 或企业密钥管理系统，并在供应商配置中仅填写引用别名。

## 3. 数据库迁移

在新环境中，请先创建空数据库并配置 `DATABASE_URL`，再运行：

```bash
pnpm drizzle-kit migrate
```

当前迁移包括学习内容生命周期、模型治理、审核责任链、社区主题/收藏、资源复审、资讯源周期同步与员工端摘要、人工软删除、学习内容台账、`newsReadEvents` 去重阅读表、`courseMaterials`、`courseMaterialComments`、`coursePracticeRuns` 三类学习资源表、`courseMaterials.contentHtml/contentFormat` 安全 HTML 快照字段、`llmProviders` 的受管网关状态字段、`enterpriseApps` 应用中心目录表、`skillPackages` 的员工投稿/审核责任/受控安装包元数据表、`skillReviews`、`skillDownloads` 的评分评论和个人下载资产表、`agentImportKeys`、`agentImportAssets`、`agentImportJobs` 的外部 Agent 令牌/受控媒体/草稿批次审计表，以及 `skillPackages.submissionSource/importBatchKey` 的管理员直接导入来源和批次追溯字段。对于已经运行旧版本的数据库，务必先备份，再执行迁移并确认 `__drizzle_migrations` 记录正常。

修改 schema 的标准流程如下：

```bash
pnpm drizzle-kit generate
# 人工审阅 drizzle/ 下新增 SQL，确认无意外 DROP 或截断
pnpm drizzle-kit migrate
```

## 4. 推荐部署：Manus 托管环境

本工程已集成 Manus OAuth、对象存储和内置 LLM 网关，推荐继续使用托管发布。保存检查点后，在项目管理界面点击 **Publish**，并在发布前于 **Settings → Secrets** 核对生产变量，在 **Settings → Domains** 绑定企业域名。

发布后请使用两类账号完成验收：员工账号验证学习、资讯、收藏、社区、Workspace、应用中心和 Skills 广场；管理员账号验证运营管理、内容台账、资讯同步、审核队列、删除恢复、模型治理、审核员测试连接、应用入口维护与 Skills 投稿审核。

如需让外部 Agent 自动整理文章图文并提交草稿，请在工程内置目录 `agent-skills/ai-empowerment-content-import/` 获取 Skill。发布完成后，管理员在 **运营管理 → Agent 内容导入** 为每个 Agent 签发最小范围令牌，并在 Agent 的私密配置中填写正式 HTTPS 域名与令牌。不可把令牌写入项目源码、文章、Skill 包、日志或聊天记录；导入产物仍必须在运营端人工应用并经过既有审核，不能自动发布。

## 5. 自托管说明

工程可作为标准 Node.js 服务构建：

```bash
pnpm install --frozen-lockfile
pnpm drizzle-kit migrate
pnpm test && pnpm check && pnpm build
NODE_ENV=production pnpm start
```

自托管需要自行提供 HTTPS、反向代理、MySQL/TiDB、OAuth、Cookie 安全策略、对象存储和 LLM 网关。当前 `server/_core/llm.ts` 与 `server/storage.ts` 依赖 Manus 适配层；迁移至非 Manus 环境前，应替换为企业的 LLM Gateway 与 S3/OSS/COS 适配实现，并完成同等权限审计。

## 6. 发布后：启用资讯自动同步与员工端摘要

资讯调度能力已经在代码中实现，但任务必须在已发布环境创建。发布成功后，由管理员执行：

1. 进入 **运营管理 → 资讯源管理**，找到 AIHOT 精选全文来源。
2. 确认来源地址为 `https://aihot.virxact.com/feed/full.xml?...`，保持来源启用。
3. 将来源同步频率设置为每 1/2/4/6/12/24 小时之一，再打开“自动同步”开关；所有周期以北京时间 09:00 为锚点。
4. 在首次运行后检查同步状态、成功/新增/升级计数、失败原因、待审核条目和精选全文筛选。
5. 在审核队列对新增条目运行“批量 AI 预审”；高置信低质量内容会被过滤，其余交由人工复核。
6. 在“员工端定时摘要”中选择每 4/8/12/24 小时生成一次并启用；可先点击“立即生成”验证员工端 AI 资讯首页的摘要卡片。

> 计划回调受认证保护。暂停来源或关闭自动同步后，计划执行会安全跳过拉取并保留可观察的运行状态。开发预览环境允许保存频率和手动生成摘要，但不会启用或恢复定时任务。

## 7. 安全与运营核对

| 领域 | 最低要求 |
|---|---|
| 认证与权限 | HTTPS、强 Cookie 策略；员工与管理员接口隔离。 |
| 数据库 | 应用账号仅授予目标 schema 的必要读写权限；定期备份。 |
| AI 审核 | 低/中风险且达到阈值可直决；高风险与低置信度必须人工复核。 |
| 模型连接 | 实际审核前仅允许 `gatewayStatus=verified` 的模型；外部供应商必须先完成企业受管网关适配与最小调用测试。 |
| 应用中心 | 仅维护无凭据的 HTTP(S) 入口；员工端只读取已启用且非管理员专属的应用。 |
| Skills 广场 | 仅允许登录员工提交、查看已上架目录或本人投稿；ZIP 包最大 8MB，服务端校验 MIME、Base64 格式与 ZIP 文件头，通过受控短期 URL 下载。每位员工对同一 Skills 仅保留一条可修改的评分评论，下载资产严格按当前账号隔离。平台不解析或执行 ZIP 内容，管理员需人工核验 `SKILL.md`、安装包和外部依赖。 |
| Agent 内容导入 | 外部 Agent 仅可持最小权限、可撤销的导入令牌调用正式 HTTPS API；平台仅接受待审核草稿，所有图片/附件经平台代理校验和存储，不向 Agent 暴露对象存储凭据或数据库访问。 |
| 管理员直接导入 Skills | 仅管理员可访问；单次最多 10 项、每个 ZIP 最大 8MB，必须提供对应 `SKILL.md` 与审计依据。默认待审核；直接上架会记录操作人、说明和批次，但平台不解压或执行安装包。 |
| 资讯删除 | 采用软删除，必须记录原因和责任人；恢复后进入人工复核。 |
| 阅读行为 | 仅保存员工与资讯的唯一关系；前端仅展示聚合阅读人数。 |
| 富媒体附件 | 已发布附件通过登录保护的短时签名 URL 访问。 |
| 日志 | 不记录密钥、完整 Cookie、员工敏感画像或对象存储原始文件。 |

## 8. 交付物核验

工程包根目录应包含 `README.md`、本文件、`NEXT_STEPS.md`、`drizzle/` 迁移、`client/`、`server/`、`shared/`、`package.json` 和锁文件；不应包含 `.env`、`node_modules/`、`dist/`、`.manus-logs/` 或本地下载文件。
