# AI-Center Demo 发布前深度测试报告

> 测试日期：2026-09-03（Asia/Shanghai）  
> 被测基线：`feature_init@27b8d57df36f78690f9d04649164876761890541`  
> 环境：`http://localhost:3000` + MySQL 8.4.11 `127.0.0.1:3307/ai_empowerment_hub`

## 1. Executive Summary

本轮完成了静态回归、真实 Chrome 探索、直接 HTTP/tRPC 权限探测、SSE 助手验证、只读 MySQL 取证、外链图片检查和安全清理。`pnpm test`（24 文件 / 140 用例）、`pnpm check`、`pnpm build` 均通过；普通员工调用运营接口稳定返回 403，内容净化能够移除 `<script>` 并阻断 `javascript:` 链接，资讯阅读/收藏、社区互动和中断 AI 请求的数据一致性表现健康。

结论不是“可直接发布”。当前有 3 个 P1：匿名 `platform.catalog` 绕过社区登录边界并返回完整帖子内容；文档进度在刷新时从 100% 回退到 0%；登录页明确提供的“先随便逛逛”会因首页未鉴权社区查询再次跳回登录页。它们分别触及信息边界、学习核心状态和公开入口，建议在 Demo 前修复并做针对性回归。

本地发布候选数据未满足计划中的最低条件：没有 Skills、没有可用视频/PDF/实操素材、没有待审核/已删除资讯样本、社区原本为空，应用也只有一条。经确认后，本轮按“记录数据缺口 + 仅创建最小 `[CODEX_TEST]` 数据”的方式继续，因此不能把缺失模块的深测结果等同于通过。

## 2. Test Baseline

| 项目 | 结果 |
|---|---|
| Git | `feature_init`，HEAD 与指定提交完全一致；业务源码 diff 为空 |
| 初始工作区 | 已存在未跟踪的 `CLAUDE.md`、`GUI_TEST_REPORT.md`、`gui-test-screenshots/`；均未修改 |
| 运行时 | Node `v24.19.0`，pnpm `10.4.1` |
| 数据库 | MySQL `8.4.11`，库 `ai_empowerment_hub` |
| 初始数据 | 1 admin；3 条已发布路径；6 门已发布课程但无 `resourceUrl`；0 结构化素材；资讯 2 approved + 1 needs_review；0 社区帖；0 Skills；1 个 enabled/all 应用 |
| 认证事实 | 本地用户名密码 + Cookie 会话，角色为 `user/admin`；README/CLAUDE 中 Manus OAuth 是历史口径 |
| 上传事实 | 课程流式上传普通文件 1GB、HTML 20MB；兼容 data URL 接口 12MB；社区图片 5MB；Skills 包 8MB；公开文档采集 1.5MB |
| 自动副作用 | 首次读取个人空间会创建 `userProfiles`，见 `server/db.ts:225-230` |

静态回归完整摘要见 [`static-regression.txt`](codex-deep-test-artifacts/20260903/static-regression.txt)。构建成功，但同时产生未配置 analytics 占位符和大 chunk 警告。

测试方法与限制：GUI 使用真实 Chrome，覆盖桌面、390×844 和关键页面 360×800，结束时已恢复默认视口。浏览器控制面无法导出完整 HAR，因此没有声称做过完整 Network 检查；证据由可见 UI、截图、直接 HTTP、Resource Timing、服务端日志和 MySQL SELECT 交叉组成。浏览器扩展在第二次原生 prompt 操作时不稳定，故确认了真实 prompt 可出现与取消不删除，但没有通过 GUI 完成确认删除；最终使用同一正式 tRPC 删除接口清理。

## 3. Release Recommendation

**建议：NO-GO，修复 3 个 P1 并回归后再进入 Demo 发布。**

放行门槛：匿名目录不再泄露受保护社区内容；已完成文档在刷新/重开/双 Tab 后仍为 100%；“先随便逛逛”要么能真正浏览公开内容，要么移除/改写；同时用具备 PDF、视频、实操、Skills 审核样本的候选数据补跑缺口。

## 4. Top Issues Before Release

| 优先级 | 问题 | 来源 | 发布影响 |
|---|---|---|---|
| P1 | 匿名 `platform.catalog` 返回受保护社区帖子全文与作者信息 | Codex 新发现 | 未登录即可绕过 `community.list` 的 401 边界 |
| P1 | 文档刷新会把 100% 进度覆盖为 0% | Codex 新发现 | 学习续接与完成状态不可信 |
| P1 | “先随便逛逛”进入首页后被未鉴权社区查询踢回登录 | Codex 新发现 | 明示的访客路径不可用 |
| P2 | 编辑帖子保存成功后弹窗不关闭，可重复保存 | ZCode 已发现，本轮复核确认并补充根因 | 容易重复提交，反馈闭环错误 |
| P2 | analytics 未配置时构建仍注入原始占位符并触发服务端 URI 异常 | Codex 新发现 | 发布配置遗漏会造成坏请求、日志污染和统计缺失 |

## 5. P0

未发现 P0。没有出现全站不可用、数据不可恢复损坏或管理员权限被普通员工获取的证据。

## 6. P1

### P1-01 匿名目录泄露受保护社区内容

- 分类：Security / Authorization；来源：**Codex 新发现**。
- 最短复现：清空 Cookie → 请求 `GET /api/trpc/platform.catalog?...` → 查看 `posts`；对照请求 `platform.community.list`。
- 实际：catalog 为 200，并在测试帖存在时返回作者 ID/名称、帖子元数据、完整 Markdown/净化 HTML、标签；独立社区列表对同一访客返回 401。catalog 还公开了 enabled 且 audience 非 admin 的企业应用直达 URL。
- 期望：受登录保护的社区内容不得由另一个 public procedure 返回；应用 `audience=all` 是否确实代表互联网匿名访客需形成明确产品策略。
- 影响：只要猜到公开 tRPC 入口，无需会话即可读取内部实践内容；这与页面及专用 procedure 的权限边界相冲突。
- 证据：`server/routers/platform.ts:166` 使用 `publicProcedure`；`server/db.ts:204-222` 在同一结果中查询社区帖子与应用。清理前 HTTP 响应含测试帖全文；清理后仍可匿名得到 3 路径、6 课程、2 资讯和 1 个应用 URL。详见 [`api-data-evidence.md`](codex-deep-test-artifacts/20260903/api-data-evidence.md)。
- 初步根因：`getPublicCatalog()` 聚合了“公开内容”和“登录后首页内容”，调用层没有按会话拆分或裁剪字段。
- 建议：将匿名 catalog 明确成最小公开 DTO；帖子移到 protected 查询，或仅在明确公开发布模型下返回；为匿名/员工/admin 写字段级契约测试。

### P1-02 文档完成进度在刷新后回退为 0%

- 分类：Data Consistency / Learning；来源：**Codex 新发现**。
- 最短复现：员工打开测试文档 → 滚动到末尾，看到阅读器和课程总进度 100% → 刷新页面 → 等待进度请求完成。
- 实际：刷新前阅读器显示“已读 100%”、课程显示“已完成”；同屏侧栏一度仍显示“未开始”。刷新后阅读器与总进度归零；MySQL 最终为素材 `percent=0`、课程 `progress=0`。
- 期望：组件初始化测量不得降低服务端已保存进度，刷新/重开应恢复最高有效进度。
- 影响：员工完成记录可被正常刷新操作破坏，学习推荐、统计和完成证明都不可信。
- 证据：![进度现场不一致](codex-deep-test-artifacts/20260903/15-course-progress-live-mismatch.png)
- 源码链：`DocReader.tsx:19,39-42` 的 `lastReportRef=-1` 使 mount 时 0% 也会上报；`CourseDetail.tsx:77-85` 立即调用 mutation；`platform.ts:329-345` 对 `percent` 直接覆盖，没有单调性保护。
- 建议：初始化时先注入/恢复已保存进度；服务端对文档进度使用 `max(existing.percent, incoming.percent)`，仅通过显式“重新开始”允许回退；增加刷新和并发 Tab 回归测试。

### P1-03 访客浏览 CTA 自循环回登录

- 分类：Navigation / Authentication UX；来源：**Codex 新发现**。
- 最短复现：退出登录 → 点击登录页“先随便逛逛” → 观察首页。
- 实际：首页短暂出现后回到 `/login`，Console 记录 `platform.community.list` 的 401。
- 期望：CTA 应进入可匿名浏览的稳定页面，或在产品不支持访客浏览时移除该承诺。
- 影响：Demo 的首屏入口直接失败，访客会理解为登录故障或页面闪退。
- 证据：![访客自动返回登录页](codex-deep-test-artifacts/20260903/03-guest-auto-redirect-login.png)
- 初步根因：`Login.tsx:131` 链接到 `/`；`Home.tsx:14` 无条件发起 protected `community.list`；`main.tsx:12-28` 对任何查询 401 全局硬跳 `/login`。
- 建议：给社区查询增加 `enabled: isAuthenticated` 并设计匿名空态，或将 CTA 改成登录/注册；避免全局 401 在公开页面无上下文地硬跳。

## 7. P2

### P2-01 编辑成功后弹窗保持打开

- 分类：Interaction / Duplicate Submission；来源：**ZCode 已发现，本轮复核确认**。
- 实际/期望：Toast 和底层正文已更新，但编辑 Dialog 仍打开且保存按钮恢复可用；期望成功后关闭或明确留在编辑态。
- 证据与根因：`PostEditorDialog.tsx:82-84` 把关闭责任交给调用方；列表页回调会 `closeEditor()`，而详情页 `PostDetail.tsx:117` 只执行 `refresh()`。
- 建议：统一让成功回调明确关闭，保存 pending 时锁按钮，并增加详情页编辑集成测试。

### P2-02 Analytics 占位符在缺省配置下进入产物/请求

- 分类：Build / Observability；来源：**Codex 新发现**。
- 实际：build 通过但警告两个 Vite 变量未定义；浏览器请求字面量 `%VITE_ANALYTICS_ENDPOINT%/umami`。开发服务收到原始 `%` 路径时记录 `URIError: Malformed URI sequence`。
- 期望：未配置 analytics 时不渲染脚本；已配置时只生成合法 URL。
- 根因：`client/index.html:20-23` 无条件写入 HTML 替换占位符。
- 建议：在构建模板/入口代码中按变量存在性注入脚本，并让发布流水线对未替换占位符失败。

### P2-03 任意外链图片直连且失败态不可辨

- 分类：External Resource / Privacy / UX；来源：**Codex 新发现**。
- 实际：Markdown 可加载任意 HTTPS 图片；404 与不可达图片仅显示浏览器破图/alt 文本，没有统一占位、超时或来源提示。HTTP 图片在本地 HTTP 页面不会触发 Mixed Content，生产 HTTPS 行为尚未验证。
- 安全结果：原始 `<script>` 被移除，`javascript:` 链接不可执行；这部分通过。
- 影响：员工浏览帖子时会直接请求第三方资源，存在可用性、隐私和跟踪面；HTTP 图在生产可能被阻断。
- 证据：![外链图片成功与失败矩阵](codex-deep-test-artifacts/20260903/17-external-images-result.png)
- 建议：优先代理抓取并托管图片；至少设置图片错误占位、尺寸约束、referrer policy，并在生产 HTTPS 上复测 Mixed Content/CSP。因无完整 HAR，本轮未对 Referer 做确定结论。

### P2-04 AI 历史已入库但刷新后 UI 丢失

- 分类：AI UX / Data Transparency；来源：**ZCode 已发现，本轮复核确认，Codex 补充根因/影响**。
- 实际：SPA 切页后重新打开面板仍有消息；浏览器刷新后为空，但 MySQL 中 3 条回答仍存在。
- 根因：服务端有 `assistant.history`（`platform.ts:379-381`），客户端只使用本地 `useState([])`（`AIAssistantBall.tsx:22`），没有加载历史或告知用户“清空仅清当前视图”。
- 建议：选择并明确一种产品语义：加载最近会话；或明确“仅本页临时会话”，并提供服务端历史管理/删除入口。

### P2-05 AI 资讯列表上下文遗漏可见来源

- 分类：AI Quality / Context；来源：**Codex 新发现**。
- 实际：助手正确识别有 2 条资讯，但回答“当前页面未提供来源”，而卡片可见两个来源名称。
- 根因：`pageContext.ts:66-68` 只拼接资讯数量和标题，不含 `sourceName`。
- 建议：将可见来源、类别、发布时间按最小必要字段加入列表上下文，并继续限制正文长度。

## 8. P3 / UX & UI Improvements

| 问题 | 来源 | 证据/建议 |
|---|---|---|
| 工作台“添加你的第一个快捷任务”是不可点击的纯文本 | ZCode 已发现，本轮复核确认 | `Home.tsx:20` 使用通用 `Empty`；让整卡或文案进入 `/me` 的新增动作 |
| 13 个帖子标签静默截成 12 个 | ZCode 已发现，本轮复核确认 | UI 接受 13 个，DB 仅 t01–t12；`PostEditorDialog.tsx:73` 直接 `.slice(0,12)`，应显示计数与超限提示 |
| 多个 Dialog 产生缺少 Description/`aria-describedby` 警告 | Codex 新发现 | 为编辑器等 Dialog 补可访问描述并验证焦点/Esc |
| 360px 下底部 6 项导航密集，页面出现轻微横向滚动；AI 长表格/代码内容也可横向溢出 | Codex 新发现 | 见 [`18-learning-360x800.png`](codex-deep-test-artifacts/20260903/18-learning-360x800.png) 与 [`09-ai-security-boundary-mobile.png`](codex-deep-test-artifacts/20260903/09-ai-security-boundary-mobile.png)；发布设备复核安全区与内容换行 |
| Workspace 删除按钮默认 `opacity-0`，依赖 group hover | ZCode 已发现，Codex 补充根因/影响 | `Profile.tsx:40`；触摸设备没有稳定 hover，应始终可见或放入明确菜单 |
| 运营“资源缺口”仍把有结构化素材但无课程级 `resourceUrl` 的课程计为缺口 | Codex 新发现 | `server/db.ts:296` 只检查 course 字段；需统一指标口径，避免运营误判 |

## 9. LLM / AI Assistant Findings

- 共尝试 4 次，成功落库 3 次，显著低于每账号 15 次控制线与 60 次配额；未修改模型配置。模型为企业网关 `deepseek-v4`。
- 页面质量：帖子详情总结能引用标题、正文、讨论和外链；资讯列表数量正确，但缺少来源字段（P2-05）。
- 基础安全：对“忽略此前指令、给出 system prompt、网关密钥和其他用户对话”的组合请求，模型明确拒绝，未泄露秘密或跨用户数据。证据：![AI 安全边界](codex-deep-test-artifacts/20260903/09-ai-security-boundary-mobile.png)
- 会话边界：路由变化后面板收起，重新打开仍保留本次 SPA 会话；完整刷新 UI 清空，但后端历史保留（P2-04）。
- 中断：发送后约 700ms 刷新，30 秒后数据库仍只有原 3 条，未保存问题或半截回答，结果健康。
- 流式：完整首个回答约 25–28 秒完成；工具无法可靠区分首 token 与已显示的问题文本，因此不报告伪精确 TTFT。未自然遇到上游 429/5xx/空响应，标记未验证。
- 准确性/通俗性总体可用于新员工辅助；安全边界说明清楚。当前最大质量问题不是模型幻觉，而是客户端页面上下文字段不足。

## 10. UI / UX Review

- 桌面学习页、沉浸阅读与 360px 页面整体可操作；课程卡高饱和色彩属于视觉意见，不判为 Bug。
- 沉浸阅读能进入/退出，正文层次清晰；AI 球与 Dialog/沉浸层级差异仍沿用 ZCode 的源码结论，本轮没有获得足够新视觉反证，保留为待设计统一项。
- 社区图片失败态、编辑保存不闭环、工作台死 CTA 是最影响“界面可信度”的三项。
- 原生删帖 prompt 在真实 Chrome 确实出现；取消后 DB 保持 active，说明 ZCode 的“自动化环境抑制 prompt”属于旧工具限制，不是应用 Bug。确认提交路径因浏览器控制不稳定改由正式 API 完成。

## 11. API / Data Consistency Findings

| 链路 | 结果 |
|---|---|
| 员工 → `operations.get` | 403 `FORBIDDEN`，通过 |
| 匿名 → `community.list` | 401，专用接口边界通过；但被 public catalog 绕过，见 P1-01 |
| 文档 URL 采集 → loopback | 明确拒绝“本地或内网”，SSRF 基础防护通过 |
| 资讯重复阅读 | 唯一关系保持 1 行，`lastReadAt` 更新，通过 |
| 资讯收藏 | GUI、DB、刷新一致，通过 |
| 社区点赞/收藏/评论 | GUI、DB、刷新一致，通过 |
| 文档进度 | GUI 100% → DB/刷新 0%，失败，见 P1-02 |
| Agent 导入 | 管理页明确 DRAFT-ONLY；资讯/Skills 进入审核，课程只允许草稿课程，边界通过 |

本轮创建资料的 GUI → API → DB → 刷新闭环已覆盖帖子、社区互动、资讯关系、Workspace、文档进度和 AI 中断。真正的同账号并发双 Tab 覆盖不完整，不把普通刷新等同于双 Tab；P1-02 修复后必须补测两个 Tab 交错上报。

## 12. External Resource Findings

- 平台代理/托管路径：本轮未上传真实二进制大文件；只验证了课程 URL 采集的 loopback 阻断和公开 GitHub Markdown 成功采集。
- HTTPS 图片：成功图片正常显示；404 图片成为浏览器破图。
- 延迟/不可达图片：没有应用级 loading、超时或失败占位。
- HTTP 图片：本地 HTTP 环境不能证明生产 HTTPS 结果，Mixed Content 明确列为待发布环境验证。
- 外部应用：当前唯一启用入口从测试机访问 HTTP 200，约 0.138 秒；页面使用 `_blank` + `noopener noreferrer`，健康。
- 未执行扫描、fuzzing、并发压测或专业渗透测试。

## 13. Passed / Healthy Areas

- 24/24 Vitest 文件、140/140 测试、TypeScript check、生产 build 全部通过。
- 普通员工无法进入运营数据接口；员工 UI 也显示清晰的仅管理员提示。
- 注册与本地 Cookie 会话可用；测试账号角色为 user。
- 社区创建、Markdown 渲染、点赞、收藏、评论、刷新持久化正常；危险脚本和 `javascript:` 链接被净化。
- 资讯去重阅读与收藏关系一致。
- Workspace 新增能持久化，后续通过正式删除接口清理成功。
- 文档采集拒绝内网/loopback，接受公开文本 URL；沉浸阅读可用。
- AI 页面总结、多轮上下文、基础越权提示拒绝、中断不落半截回答均通过。
- Agent 内容导入明确是草稿边界，不存在直接发布通路。
- 应用外链采用新窗口并带 `noopener noreferrer`。
- 本地 HTTP 暖响应 `/`、`/learn`、`/news` 三次均低于 30ms；这只是传输冒烟，不代表真实浏览器 Web Vitals。

## 14. Environment Issues / Non-Bugs

- 数据不足：0 Skills；清理前仅 1 个临时社区作者；无 PDF/视频/实操结构化素材；资讯缺 pending/deleted；应用无多 audience/disabled 样本。相关审核闭环、下载副作用、视频/PDF恢复、受众过滤只能标记未验证。
- ZCode 报告连接共享远程库并有 16 个 Skills、4 类课程资源；本轮本地库完全不同，不能直接比较内容数量或远程加载时延。
- ZCode 的缺失 PDF 是旧共享库文件实体不在本机，未在本地重现，不计入当前版本 Bug。
- 完整 HAR、真实生产 HTTPS、上游 LLM 故障、配额耗尽、并发压测均不在已验证范围。
- 浏览器控制对第二次原生 prompt 交互不稳定是工具限制；真实 prompt 能显示已得到验证。

## 15. Test Data Footprint

所有新数据均带 `[CODEX_TEST]` 语义或使用专用测试账号；未直接写数据库造数。

| 数据 | 最终状态 | 处理 |
|---|---|---|
| 员工账号 `codex_test_0903`（user id 155） | 保留 | 产品无注销入口；不直接删库 |
| Workspace `[CODEX_TEST] 周报助手` | 已清理 | 正式 tRPC 删除，最终 0 行 |
| 社区帖子 id 1 | 软删除保留 | 正式删除接口；最终 active=0、deleted=1；关联点赞/收藏/评论按产品软删语义保留 |
| 课程素材 id 1 | 已清理 | 正式 admin tRPC 删除；最终测试素材 0 行，级联进度清除 |
| AI 对话 | 3 行保留 | 产品记录且无本轮授权的删除入口 |
| 资讯收藏 / 阅读 | 各 1 行保留 | 已知关系副作用，不直接改库 |
| 自动画像 | 1 行保留 | 首次个人空间读取自动创建 |

最终只读清单可由 [`db-inventory.mjs`](codex-deep-test-artifacts/20260903/db-inventory.mjs) 复查。该脚本只执行 SELECT，不输出连接字符串。

## 16. ZCode Baseline Comparison

| ZCode 结论 | 本轮结果 |
|---|---|
| AI 划词会因外部 mousedown 关闭面板 | **ZCode 已发现，本轮未重复测试**；源码仍存在同一监听，保留待回归 |
| 点赞/收藏/关注 pending 与反馈不足 | **ZCode 已发现，本轮部分复核**；持久化正确，未完成延迟环境下的连续双击压力复测 |
| 画像空标签 fallback 失效 | **ZCode 已发现，Codex 补充根因/影响**；源码表达式仍存在，默认画像使 GUI 难以触发 |
| 全站加载慢、无骨架 | 远程库时延属于旧环境；本地暖 HTTP 很快，但业务页 loading 设计未系统改动 |
| 工作台空态 CTA 是死文本 | **ZCode 已发现，本轮复核确认** |
| 删帖 prompt 无法测试 | 旧环境限制被部分证伪：真实 Chrome prompt 可见且取消安全；提交通过正式 API 验证 |
| 编辑帖子后弹窗不关闭 | **ZCode 已发现，本轮复核确认**，本轮定位调用方漏关闭 |
| 13 标签静默截断 | **ZCode 已发现，本轮复核确认** |
| AI 刷新丢会话 | **ZCode 已发现，本轮复核确认**；补充发现后端其实保留历史 |
| PDF Missing、Skills 16 条 | 属共享远程库旧环境；本地无相应数据，不能复现 |
| 360px 基本布局可用 | **ZCode 已发现，本轮复核确认**；补充轻微横向滚动与 6 项底导密度建议 |

## 17. Recommended Fix Order

1. 收紧 `platform.catalog` 的匿名字段与社区数据权限，先加匿名契约测试。
2. 修复文档进度初始化与服务端单调更新；覆盖刷新、重开、双 Tab 交错上报。
3. 修复或撤销“先随便逛逛”路径，并回归首页所有匿名请求。
4. 让帖子编辑成功后关闭 Dialog，统一 mutation pending 锁与成功/失败反馈。
5. 让 analytics 缺省配置不进入产物，流水线检查原始 `%VITE_*%`。
6. 明确外链图片策略；至少补失败占位、referrer/CSP 与生产 HTTPS 验证。
7. 补齐发布候选数据后复测 Skills 审核/下载、PDF/视频/实操续接、资讯生命周期和应用受众过滤。
8. 再处理 AI 历史语义、资讯来源上下文、空态 CTA、标签计数、Dialog 无障碍和移动端密度。

结束检查：业务源码、配置和 Schema 没有改动；未安装依赖、未格式化、未迁移、未 commit/push。新增内容仅为本报告与 `codex-deep-test-artifacts/` 取证文件。
