# 统一知识源接入设计

## 已确认方向

- 本地 MySQL 仅供开发，正式部署使用远程数据库，由 DATABASE_URL 配置；实例类型与容量在部署阶段验证。
- 保留现有单体后端、业务模型与运营流程，渐进增加 Source → Connector/Reader → 原始快照/附件 → Normalize → 内容副本/版本 → 发布关联 → 多页面消费。
- 首个 Source 同步整个“AI应用知识库”空间，入口节点为 IDAtwKn8TiaaGLkucKycZAOgn1e；浏览器只用于调研、配置与验收，生产接入只用 OpenAPI。
- 学习中心增加“知识与案例”栏目；本机开发预览允许已登录账号阅读 ready 副本，正式发布由负责人逐篇确认并面向所有已登录账号（含自注册账号）。
- 当前不做 RAG；飞书 SSO 接入时再收紧正式发布受众。

## 内容与既有业务关系

Connector 只读取与标准化，不绑定前端路由，不直接发布课程/帖子/新闻/Skills。同一内容可被企业案例、学习、资讯与精选栏目引用；工作台聚合这些栏目。

课程保留教学编排和学习记录，社区保留员工原创与引用，Skills 保留包结构和审核。逐步给 newsItems、courseMaterials 与 Agent 草稿增加知识版本引用，所有引用遵守统一访问检查。

## 六表模型（本地已迁移）

| 模型 | 职责 |
|---|---|
| knowledgeSources | 类型、配置、凭证引用、同步边界/频率、状态、最近成功时间 |
| knowledgeItems | 稳定 ID、sourceId/externalId、父节点、标题、URL、作者、类型、分类标签、访问策略与同步状态 |
| knowledgeContents | 正文版本、格式、哈希、来源版本、标准化器版本、原始快照引用 |
| knowledgeAssets | MIME、名称/大小/哈希、storage key、所属内容版本 |
| knowledgeSyncRuns | 范围/完整性、起止时间、结果计数与脱敏错误 |
| contentPublications | 指定版本与栏目/课程的关联、发布状态、负责人确认与排序 |

- (sourceId, externalId) 唯一；Wiki 节点与实际正文对象身份分开，快捷方式不能按标题去重。
- 来源更新、平台同步、平台发布时间分开；同步、审核、发布状态分开。
- 文档正文主要标准化为 Markdown，保留原始 Blocks/JSON；HTML 是清洗后的展示衍生格式。表格保留结构化数据，不强行变成文章。
- 长正文不套用既有 TEXT/20,000 字符截断：实测最大纯文本 334 KB；统一标准化正文建议远程 MySQL 的 LONGTEXT，并按版本读取、分页展示。
- 原始 Blocks 抽样单篇约 2.0 MB 且有 436 个图片 token；完整 Blocks JSON 快照与图片/文件放持久文件或对象存储，数据库保存 storage key、哈希与必要的可检索文本。开发环境可复用 .data/storage；正式环境须先落实持久卷/备份或对象存储，不能把远程数据库视为附件存储。
- 全空间已完成目录与纯文本/文件大小清点；未支持或未授权资源明确标记，不静默缩小同步范围。快捷方式保留节点、目标与来源空间身份，跨空间内容不自动抓取。

## 访问与发布

本机开发环境中，真实 socket 来源为 loopback 的已登录账号可以预览最新 ready 内容，无须 Publication，页面须标明未经审核发布。其他访问只读取负责人确认、管理员发布给 `authenticated_users` 的内容；V1 不做人工逐人核验。现有 `users.enterpriseAccessStatus` 等字段保留给未来 SSO，不参与当前知识读取。

列表、标题/摘要、正文、附件、课程引用、首页、搜索与未来检索都检查权限；未知权限默认拒绝。source_inherited 仅在真实 ACL 映射后使用。403、超时或分页失败不视为删除；撤销授权须停止展示、使旧引用失效，轮询不能承诺实时继承飞书 ACL。

## 飞书应用与单篇验证

- 应用：ChintAI 知识源同步；App ID：cli_aa31997de0b8dbc0；企业：正泰集团。1.0.0 已正式发布。用户已授权常规应用配置/最小只读权限/应用发布自主执行，不重复确认；企业实际审批与资源管理员权限仍由具备权限者完成。
- 描述：只读同步企业知识空间至 ChintAI，供授权员工学习与案例分享。
- 已开通应用身份 wiki:node:read、wiki:node:retrieve、docx:document:readonly、drive:file:download、sheets:spreadsheet:read、sheets:spreadsheet.meta:read、bitable:app:readonly，均经实际接口验证。Bitable 官方 readonly 权限名称包含评论能力；Connector 只实现 GET，不提供源端写操作。
- 新应用凭证保存在 .env 的 FEISHU_KNOWLEDGE_APP_ID / FEISHU_KNOWLEDGE_APP_SECRET，原有 FEISHU_APP_* 保留。Secret 与 token 仅在环境/服务端内存使用；不提交 Git，不进入日志/聊天/同步错误，也不回退到旧应用凭证。

```text
后端鉴权 → tenant_access_token
→ /wiki/v2/spaces/get_node?token=IDAtwKn8TiaaGLkucKycZAOgn1e
→ code / space_id / obj_type / obj_token
→ 对应 Reader → 正文 → 比对浏览器标题与样本
```

若为 docx，先用 /docx/v1/documents/{obj_token}/raw_content 验证，再分页读取 /blocks 保留结构。只读最新版本，不为历史版本申请编辑权限；非 docx 明确报告，不冒充正文读取成功。

### 当前实测

- pnpm knowledge:poc 已成功运行：space_id=7504978450990710788，obj_type=docx，obj_token=Dvmpds2JRo3hsqxqS36cbMnKnje，标题为“AI 应用案例▶️做AI项目”，正文 4,494 字符。采购平台与案例致谢样本匹配浏览器。
- 正文 SHA-256：da251195bde1e077377b2bc3d5a206f068a3e0dcec9077fa65adabbfe2d93efe。只作为本次验证指纹，源更新后会变化；CLI 不打印正文或凭证。
- 浏览器知识库首页 token=P7IXwbSCvirX26kGky2cZcZunNb，API 确认与案例属于同一空间。知识库管理员授权后根目录返回 HTTP 200 / code=0；67 页目录 API 完整清点 11 个顶层节点、369 个节点：349 Docx、17 file、2 Bitable、1 Sheet。案例分支 44 个节点（含入口）。目录统计不代表所有正文和附件可读。
- 35 个快捷方式中有 28 个指向其他空间或来源不明；它们作为当前空间节点保留，不自动跨空间遍历。17 个 file 为 12 个 .md、3 个 .pdf、2 个 .html，Range 下载均返回 206，文件总量 40,299,615 字节（约 38.4 MiB，含 3 个 PDF 约 29.7 MiB）；未批量复制文件。目录明细在未跟踪的 .data/knowledge/feishu-space-survey.json，wholeSpaceDirectoryComplete=true、无分页/父节点错误。
- 314 个目标空间原始 Docx 的 raw_content 全部返回 code=0，无空正文，合计 1,030,315 字符、2,150,116 UTF-8 字节；最大单篇 334,294 字节，P95 约 22 KB。仅大小/状态明细在未跟踪的 .data/knowledge/feishu-docx-size-survey.json，不保存正文。
- 最长样本的 Blocks 分 8 页，3,918 块、序列化约 2.0 MB，含 436 个不同图片 token；抽样 20 张图片总量约 8.5 MB，不能外推为全空间图片总量。图片素材 Range API 已返回 206。
- Sheet 样本获取 1 个工作表，200×20 单元格范围可读，有 162 个非空值；2 个 Bitable 分别可列 1 个数据表，实际记录总数为 1 和 5，全部读取 code=0。Sheet/Bitable 应保留结构化数据并生成阅读摘要，不能全部转成 Markdown 文章。
- 三篇样本的 Blocks 分别为 279/45/28 个，均无下一页。样本有表格、图片、画板、source_synced 等结构；总览正文约 12KB UTF-8，不能据此推断全空间容量。清点明细在 .data/knowledge/feishu-survey.json，仅元数据与统计、不含正文或凭证、不提交 Git。
- raw_content 不保证保留文档链接标题、图片、表格结构；正式 Normalize 必须进一步验收 Blocks，不能把纯文本 POC 当作保真同步完成。
- 后端入口 server/knowledge/feishuPoc.ts；运行脚本 server/knowledge/runFeishuPoc.ts。默认使用给定节点，可通过 pnpm knowledge:poc <node_token> 验证另一篇 Docx。仅运行三段读源链路，无数据库或发布副作用。

正式同步按 space_id 遍历整个空间，识别快捷方式来源并防循环，不无限追踪正文链接。V1 手动全量、生产轮询、Source 防并发、幂等写入与完整性记录。只有完整权威遍历才能判定缺失；RSS 最近条目窗口不能作为删除清单。

### 完整空间授权准备

根据飞书官方知识库常见问题 https://open.feishu.cn/document/server-docs/docs/wiki-v2/wiki-qa ，完整知识空间授权可通过包含应用机器人的群，或管理员 user_access_token 调用成员 API 完成。本项目先准备群授权路径，避免给同步服务申请成员写入或用户通讯录权限。

- 1.0.1 版本详情：https://open.feishu.cn/app/cli_aa31997de0b8dbc0/version/7690787785541159873 。用户确认已审批通过并发布；机器人仅用于空间成员授权，没有消息权限、事件回调或外部共享，可用范围为程鹏与陈超超。后续为实测资源类型增加四项应用身份读/下载权限，现共七项；权限页显示当前修改均已发布。
- 陈超超授权后，新 token 实测空间根目录 `GET /wiki/v2/spaces/7504978450990710788/nodes?page_size=50` 返回 HTTP 200、code=0；整个空间目录访问已生效。API 结果不表明具体是应用还是专用群获得成员资格。
- 应用可用范围、知识空间访问授权、平台内容发布范围仍是三个不同边界；下一步按类型验证正文/附件权限，员工端精选内容仍须负责人确认。

## 国内来源候选

以下入口在开发机禁用 curl 代理后返回 200；正式部署网络仍需复核。文档可读不等于正文采集已实现，公开阅读不需要模型 API 凭证。

| 来源 | 用途/方式 | 建议频率 |
|---|---|---|
| https://help.aliyun.com/zh/model-studio/what-is-model-studio | 百炼官方精选教程；正文采集待验收 | 每周 |
| https://docs.volcengine.com/docs/ark?lang=zh | 方舟官方指南与实践；正文采集待验收 | 每周 |
| https://api-docs.deepseek.com/zh-cn/updates/ | 官方文档与更新；变更检测后审核 | 每日检查更新 |
| https://modelscope.cn/spotlight | 魔搭中文案例/教程，先精选，不依赖未公开接口 | 每周 |
| https://www.paddlepaddle.org.cn/documentation/docs/zh/guides/index_cn.html | 飞桨进阶模型/工业教程，页面动态渲染 | 每周按需 |
| https://www.ithome.com/rss/ | RSS＋AI 内容筛选/审核，现有解析器读到 50 条 | 每 6 小时 |

量子位 RSS 的 Node 请求成功但直连 curl 返回 403，稳定性待验证。V1 必需来源不依赖境外站点、GitHub 或第三方 RSS 代理。

## 阶段与验收

- V1-A：应用、最小权限、资源授权、单篇与全空间目录验证完成。
- V1-B：六表模型、全空间目录/正文同步、内容版本、文件/图片/原始快照、同步记录与管理员预览已实现；少量源端素材权限失败单独记录。
- V1-C：学习中心“知识与案例”、工作台入口、本机开发预览及逐版本受控发布已实现；真实企业内容仍需负责人逐篇确认后才能正式发布。
- V2：增量、多 Source、课程/资讯等引用、飞书 SSO/ACL 映射、普通搜索和国内其他来源；现有 RSS 不迁移。
- Later：Indexer → Chunk → Embedding/Vector DB → 带访问过滤的 Retriever → RAG；保留 block/页码/层级定位，不提前实现。

验收真实正文、节点/块分页、幂等、正文缩短、快捷方式循环、部分失败不误删、凭证脱敏、权限撤销、旧业务 API 访问边界与附件签名；同步更新不静默覆盖已审阅发布版本。

## V1-B / V1-C 实现契约

- Schema 位于 `drizzle/schema.ts`，六张核心表由 `0027` 创建，`0028` 为 `knowledgeItems.kind` 增加 `other`，`0029` 为 Publication 增加 `authenticated_users` 受众。开发库已应用；生产库须单独按发布流程迁移。`0029` 不自动扩大既有 `verified_employees` 发布记录。
- 正式入口为 `server/routers/knowledge.ts` 的 `knowledge.*`。Feishu POC 保留只读诊断用途并复用正式 Client。Source 只存环境变量引用，不存密钥。
- 全量同步区分 `directoryTraversalComplete` 与 `contentFetchComplete`：只有目录完整才执行 missing reconciliation；已出现节点的正文/图片失败保留旧版本，且不影响其他缺失节点判断。每个来源持有数据库租约，单项版本经过 tmp → staging → 文件 finalize → ready；启动恢复处理残留 staging。
- 开发存储使用 `DATA_DIR/storage`。默认单文件 64 MiB、单次运行 512 MiB、附件并发 2，可用 `KNOWLEDGE_MAX_SINGLE_ASSET_BYTES`、`KNOWLEDGE_MAX_ASSET_BYTES_PER_RUN`、`KNOWLEDGE_ASSET_CONCURRENCY` 调整；前两项单位为字节，当前 INT 计数列要求配置不超过 2,147,483,647。启动同步前要求可写及预算之外至少 1 GiB 空闲空间。生产必须提供持久卷和备份。
- 发布固定 `knowledgeContents.id`，一次审批/发布/撤回为一条 `contentPublications` 记录；新版本发布事务撤回旧记录。partial run 中自身完整的 ready 版本可人工发布，整次 run 无须 succeeded。正式访问面向所有已登录账号，审批界面须明确提示包含自注册账号。附件地址绑定用户、资产和访问生命周期：正式访问绑定 Publication，开发预览仅允许本机及当前最新 ready 版本，管理员独立预览使用专属作用域；有效期 1 小时，每次请求复核当前权限。
- 管理端 `/operations/knowledge` 提供来源、运行历史、目录树、版本预览与审核发布；员工端入口为学习中心 `/learn/knowledge` 和 `/learn/knowledge/:id`。本机开发入口明确标记未经审核发布，非本机及生产工作台仅展示已发布内容。生产周期同步复用 heartbeat，开发环境保持手动同步。
- 当前 Docx normalizer 版本为 `knowledge-v1.0.3`：`grid/view` 子块按文档顺序线性化，正文与图片进入 canonical Markdown，布局不保真仍明确标记 incomplete；源端未变时可从已保存的 raw snapshot 重建新版本，必要新增资产才重新下载。
