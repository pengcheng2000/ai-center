# PROJECT_STATE.md

## 当前开发阶段

已完成 Demo 深度测试、全站 UI 收敛和企业知识阅读与运营管理改造。统一 Knowledge Source、Feishu Wiki 同步、版本与附件、受控审批发布均已实现；远程生产库已应用 `0027`～`0030` 并完成六张知识表数据迁移与校验。当前 `.env` 只有本地 Docker MySQL `127.0.0.1:3307` 的 `DATABASE_URL` 生效，远程连接行已注释；本地开发服务运行在 `http://localhost:3000/`。目标空间 369 节点完整入库，334 个原始节点有 v1.1.2 ready 内容版本，35 个快捷方式保留引用。六个学习栏目已初分 264 篇可读内容，5 篇已完成阅读与编目复核并设为精选。3 条 `published`、1 条 `approved` 发布记录已原样迁移至远程库（受众 `authenticated_users`）。继续开发前检查 git status，保留用户已有修改。

## 项目定位

面向企业员工的 AI 能力提升与运营治理平台，围绕学习路径、可信资讯、实践社区、企业应用、Skills、个人 Workspace、AI 助手和运营审核形成闭环。

## 当前架构与技术栈

- 前端：React 19、Vite 7、TypeScript、Wouter、TanStack Query、tRPC Client、Tailwind CSS 4、Radix/shadcn。
- 后端：Express 4、tRPC 11、TypeScript。
- 数据：MySQL/TiDB、Drizzle ORM，Schema 与迁移位于 `drizzle/`。本地 Docker MySQL 仅供开发；生产库为远程 MySQL 内网地址（`lower_case_table_names=1`，表名小写，schema 已同步到 `0030`），通过 DATABASE_URL 配置连接。知识表数据本地与远程已一致。
- AI 与文件：配置式服务端 LLM 网关；文件当前存放 DATA_DIR/storage（默认 .data/storage），通过短期签名 URL 访问；已有课程资源流式上传与受控 Agent 内容导入，尚无 MinIO/OSS/S3 实现。
- 鉴权：本地账号、scrypt 密码散列、JWT Cookie 会话；运营能力由管理员 procedure 保护。企业知识 V1 不做人工逐人核验：本机开发已登录账号可看 ready 副本，其他访问只看 `authenticated_users` 已发布内容，自注册账号也包含在正式发布受众内。`users.enterpriseAccessStatus` 等字段保留作未来 SSO 扩展，当前不参与知识读取。飞书 SSO 与文档 ACL 映射尚未实现。
- Git 远端：`origin` 仍是公司 GitLab；`github` 指向公开仓库 `pengcheng2000/ai-center`，默认分支为 `main`。本地工作分支为 `feature/feishu-wiki-integration`；向 GitHub 同步时须显式指定 `github` 和 `main`，并保持 `.env`、`.data` 等敏感运行数据不入库。

## 已交付的主要能力

- 员工工作台、学习路径/课程/素材、学习进度与沉浸式 PDF/文档/视频阅读。
- 学习中心“知识与案例”按六栏目、专题、搜索和分页组织；详情正文优先，支持章节目录、专题连续阅读、图片降级及结构化表格分页。运营端以内容队列、独立审核详情和来源同步页签工作。
- AI 资讯、RSS 手动同步和按来源配置的周期同步、审核与生命周期治理；员工端可展示由已审核资讯聚合生成的定时摘要。
- 实践社区、图片附件、点赞/收藏/评论、软删除与恢复。
- 企业应用中心、Skills 投稿/审核/下载、Agent 草稿导入。
- 个人画像与 Workspace、页面感知 AI 助手及历史会话。
- 全站现代干净设计系统：纯白 `#FFFFFF` 基底、冷灰 `#F9FAFB` 次级表面、四种中等鲜明度领域色（学习 Indigo `#6366F1`、工作 Orange `#F97316`、社区 Emerald `#10B981`、资讯 Blue `#3B82F6`）；Skills 使用 Violet `#8B5CF6`；紧凑页头取代深色大色块 Hero，各页面 CTA 跟随领域色；`rounded-xl`（12px）卡片 + `rounded-lg`（8px）按钮统一圆角规范；卡片默认无阴影，hover 时使用微弱阴影。
- 品牌展示采用纯文字 `ChintAI` 字标，浏览器标签页使用本地化的 CHINT 官方蓝色 C favicon；AI 助手采用白底、冷灰与 Blue 强调色的轻量视觉系统。

## 已确认的重要决策

- 保留现有路由、信息架构、业务流程和 Radix/shadcn 组件体系，采用渐进式完善，不做大框架重写。
- 后端 API、Schema、权限和危险操作确认逻辑不得因纯 UI 工作改变。
- `violet-*` 历史用色通过语义 Token 兼容映射收敛；PDF 标注等明确工具色可以保留。
- RSS 自动同步与员工端摘要调度仅允许生产运行；开发预览可保存频率、手动同步和立即生成摘要，但调度开关禁用。RSS 来源支持每 1/2/4/6/12/24 小时独立同步，员工端摘要支持每 4/8/12/24 小时全局生成，周期以北京时间 09:00 为锚点。
- 员工端定时摘要仅聚合尚未进入摘要的已审核资讯，使用现有标题与摘要确定性生成，不调用 LLM；无新内容时不生成空摘要。
- 不开发完整深色模式，不在视觉重设计中混入构建拆包或新大型依赖。
- 知识接入采用 Source → Connector → Normalize → 统一内容副本与版本 → 发布关联 → 页面。Source 不与 Page 绑定，保留现有课程、资讯、社区与 Skills 业务模型。
- 首个来源同步整个“AI应用知识库”空间；IDAtwKn8TiaaGLkucKycZAOgn1e 是其中案例节点，需通过 OpenAPI 解析 space_id 后遍历整个空间。快捷方式须识别真实来源，不无限追踪正文链接。
- 员工入口为学习中心“知识与案例”。本机开发连接可向任意已登录账号展示最新 ready 副本，并标明“开发预览·未发布”；非本机与生产仅展示负责人确认后明确发布给所有已登录账号的内容。当前公开注册也能取得本地账号，因此发布确认文案明确包含自注册账号；未来接入飞书 SSO 后再调整正式受众。
- 六个学习栏目固定为 AI 入门、工具与平台、实操教程、业务案例、开发与集成、治理与参考。节点编目与飞书同步数据分离；正式阅读使用批准时的编目快照，运营草稿变更需重新批准发布才生效。同步不会自动批准或发布。
- V1 不实现 RAG、Embedding、Chunk、Vector DB 或语义检索；保留稳定 ID、正文、版本、哈希、来源、层级与访问策略供后续扩展。
- 外部来源优先国内可直连资源；IT之家 RSS 已通过直连请求与现有 RSS 解析器验证，官方文档来源仅验证可访问，正文采集仍需逐源验收。

## 知识源接入当前事实

- 飞书企业自建应用“ChintAI 知识源同步”（cli_aa31997de0b8dbc0，正泰集团）已发布。应用身份开通 wiki:node:read、wiki:node:retrieve、docx:document:readonly、drive:file:download、sheets:spreadsheet:read、sheets:spreadsheet.meta:read、bitable:app:readonly；没有编辑、删除、消息或通讯录权限。Bitable 的官方 readonly 权限说明含评论能力，服务端 Reader 仅使用 GET。
- 新凭证保存在未跟踪的 .env 中 FEISHU_KNOWLEDGE_APP_ID / FEISHU_KNOWLEDGE_APP_SECRET，保留原有 FEISHU_APP_*。后端单篇验证命令为 pnpm knowledge:poc，不写数据库、不输出企业正文或凭证，不回退使用其他应用。
- 单篇真实 POC 成功：目标为 Docx，读取“AI 应用案例▶️做AI项目”正文 4,494 字符，与浏览器中的采购平台、案例致谢内容匹配。应用未发布时即可完成此只读调用，不能把“待上线”与“API 不可读”等同。
- “AI应用知识库”的 space_id 为 7504978450990710788；全空间同步已完整遍历 67 页目录及 369 节点（349 Docx、17 file、2 Bitable、1 Sheet），其中 35 个为快捷方式。334 个原始节点均有 ready 正文版本；图片与附件缺失按质量问题单独记录。同步默认不发布内容。
- 该空间有 35 个快捷方式，其中 28 个的 originSpaceId 为其他空间或未知值；只将它们作为当前空间的节点记录，不自动越界遍历来源空间。17 个 file 为 12 个 Markdown、3 个 PDF、2 个 HTML；均已复制到开发环境 storage，Markdown/HTML 已标准化，PDF 保存文件并用受控 Range Reader 展示，不做 PDF 文本抽取。
- 三篇样本文档的 raw_content 与 Blocks 可读取；总览文档 279 个块，包括 11 个表格，其他样本确认图片、画板与 source_synced 引用块。正式 Normalize 不能只保存纯文本，也不能把未支持的块静默丢弃。
- 已按官方成员授权路径准备 1.0.1（版本 ID 7690787785541159873），只增加机器人能力以加入专用授权群；可用范围仅程鹏与知识库管理员陈超超，关闭外部共享、没有消息权限/事件回调。用户确认审批通过并已发布；本轮 Chrome 页面状态因连接超时未独立核验。
- 根目录此前返回 131006，用户报告陈超超已添加授权后重试为 HTTP 200 / 飞书 code=0，访问问题已解决。API 结果证明目录读取生效；具体是应用还是专用群获得成员资格未单独核验。
- 全空间目录元数据在未跟踪的 .data/knowledge/feishu-space-survey.json；314 个目标空间内原始 Docx 的 raw_content 全部读取成功（无空正文/失败），纯文本 UTF-8 合计 2,150,116 字节，最大单篇 334,294 字节，明细仅含大小/状态、不含正文，位于 .data/knowledge/feishu-docx-size-survey.json。目录含 35 个快捷方式，不自动读取其外部来源正文。
- Docx 正文使用 Blocks 标准化并保留 raw snapshot；大正文为 LONGTEXT，Sheet/Bitable 保留结构化内容，图片和文件只存 storage key。`grid/view` 版式线性化保留子块文字与图片，画板等未支持内容在管理员预览标记 incomplete。单次运行默认附件预算 512 MiB、单文件 64 MiB、并发 2；生产持久卷与备份尚未落实。
- v1.1.2 Normalizer 从原始快照重建正文、链接和表格，已下载附件复用；可用图片经同源签名路径展示，缺失图片隐藏并记录质量问题。Docx 中独立图片或附件读取失败不再丢弃已成功读取的正文。`grid/view` 线性化及画板等不支持结构仍标记 incomplete。单次运行默认附件预算 512 MiB、单文件 64 MiB、并发 2；生产持久卷与备份尚未落实。
- 开发库有 3 条学习路径、6 节课程，courseMaterials 为 0 且课程链接全部为空；3 个资讯源均为 example.com 占位地址，3 条资讯为种子内容。Skills、Agent 导入资产/任务/令牌与资讯摘要为空；2 条社区测试帖均已软删除。
- 统一 Knowledge Store 已独立于现有业务表建立；RSS → newsItems、公开文档/上传 → courseMaterials、Agent → 审核草稿仍按原流程工作，未迁移或重写。RSS 最近条目窗口与正文截断不用于 Knowledge authoritative full sync。
- README 的 Manus OAuth/Forge 架构图与当前认证、LLM、文件实现不一致，不能作为实现依据。统一接入设计及验收边界见 DESIGN.md。

## 当前验证基线

- 完整 `pnpm test` 已通过：37 个 Vitest 文件、203 条测试；`pnpm knowledge:verify` 的 24 项本地集成检查已通过，覆盖发布快照、版本绑定、附件 Range、权限及撤回。集成检查使用临时样本并清理。
- `pnpm check` 与 `pnpm build` 已通过；Vite 仍有既有的大 chunk 提示。
- 数据库迁移 `0027`～`0030` 已在本地与远程生产库应用；`0030` 增加节点编目与发布编目快照。知识数据迁移（2026-09-30）：六表行数与全量 `contentHash` 指纹校验一致，资产 `storageKey` 指纹一致，ID 与 `maxId` 保留；迁移前远程库全量逻辑备份在 `.data/backup-remote-before-knowledge-migration.sql`。
- 全空间 v1.1.2 重建成功：369 节点发现、334 篇 ready、0 篇正文失败；本机开发预览中 264 篇已初分并收录。最终运行仍记录 12 张缺失图片、263 个缺失附件，其中 230 项触及本次容量预算；这些缺失在正文中降级展示，不能视为完整保真。权限验收覆盖非本机拒绝未发布内容、正式受众授权、附件 Range 与撤回/重新发布后旧链接失效。
- Chrome 已覆盖 19 个桌面路由，以及 390×844、360×800 共 20 个移动路由/视口组合；未发现页面级横向溢出或控制台 warning/error。
- 浏览器已验收新版运营队列、独立审核、来源同步、学习列表和详情；第 11 篇图片与素材链接、大模型表格列名和分页、案例章节、目录节点、搜索返回、历史版本切换均已核对。390px 与 1024px 无页面级横向溢出；移动抽屉可关闭且切换版本会清空未提交的共享确认。
- UI 色彩对比度、移动导航/AI 悬浮入口、Dialog 边界、焦点环和 Escape 关闭已验证。

## 当前风险与已知限制

- Vite 生产构建存在既有的大 chunk 提示，功能不受影响，但后续应独立规划拆包。
- 运营后台和详情页内部仍保留部分历史 `violet-*`、`slate-*`、`font-serif` 与胶囊圆角类名；`slate-*` 已通过全局兼容色阶升级为标准冷灰，剩余类名统一清理留待后续独立任务。
- 真实 SSO、生产数据规模、生产 HTTPS、真实 PDF/视频/实操素材和移动设备安全区仍需在发布环境验证。
- 资讯同步与摘要调度均为进程内定时任务，依赖生产服务常驻；开发热重载环境不提供自动执行能力。
- 企业知识的开发预览以 `NODE_ENV=development` 和真实 socket loopback 地址共同判定；列表、详情、结构化数据及附件使用同一服务端边界，Host/转发头不能开启预览。正式发布后任意已登录账号（含自注册账号）可读，仍需知识负责人逐篇确认；飞书 SSO/ACL 映射属于后续阶段。
- 原先因图片 403 而 `content_failed` 的 Docx 已保留可读正文并记录缺失图片。当前仍有图片和附件缺失，包括容量预算造成的未复制文件；管理端可针对缺失资源重试。远程库的 3 条已发布记录使用 `authenticated_users` 受众，已确认原样迁移；剩余内容仍须知识负责人逐篇确认后发布。
- 生产上线前需将 `.data/knowledge-storage-20260930.zip`（约 2.76 GB 知识文件，6056 个文件）解压到生产机 `{DATA_DIR}/storage/knowledge`（步骤见 `.data/RESTORE-NOTE.txt`），并配置持久卷与备份；数据库侧已就绪。
- 内容版本为不可变历史，图片/文件资产可被多个版本引用；V1 无自动历史版本与文件垃圾回收，生产需监控长期存储增长并保留备份。

## 当前开发重点

远程库知识数据迁移与验收已完成（登录、列表 264 篇、详情、管理端 369 节点与 3 发布/1 批准计数、附件字节数核对均通过）。下一步：生产部署时解压 knowledge-storage zip 到目标机 `DATA_DIR/storage/knowledge` 并配置持久卷与备份；从另一台内网机器复核非本机员工端只读已发布内容的边界；按业务优先级复核剩余初分内容和缺失附件；飞书 SSO 上线时重新审阅正式受众。
