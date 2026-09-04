# 全站「克制型高级感」UI 重设计交付报告

日期：2026-09-03

## 交付结论

本轮已在不调整路由、信息架构、业务流程、权限模型与后端接口的前提下，完成登录页、员工端、详情页、阅读器、AI 助手以及全部运营入口的统一视觉收敛。

整体采用暖灰页面底色、白色主表面、石墨色主操作，以及蓝灰、陶土、青绿、雾蓝四种低饱和领域色。桌面顶部导航、移动底栏、表单、卡片、Dialog、Toast、空态与焦点状态均已统一；学习中心原有三张路径卡的布局和识别色得到保留，并进一步扩展到内容 Hero、路径 CTA 与 AI 助手。

## 设计 Token

| 语义 | 色值 |
| --- | --- |
| 页面背景 | `#F6F6F3` |
| 主表面 | `#FFFFFF` |
| 次级表面 | `#F0F1EE` |
| 主文字 | `#1D1E1C` |
| 次级文字 | `#666A67` |
| 边框 | `#E4E5E1` |
| 主操作 | `#242624` |
| 学习/知识 | `#596287` |
| 工作/应用 | `#835C4D` |
| 社区/Skills | `#3B7070` |
| 资讯 | `#4B7082` |

主要对比度：主文字/页面背景 15.46:1，次级文字/页面背景 5.07:1，白字/四种领域主色均为 5.33:1 以上，满足 WCAG AA 正文要求。

## 主要实现

- 在 `client/src/index.css` 建立语义色、表面、阴影、排版、间距、动效和兼容映射；旧 `violet-*` 使用点通过兼容层转为新的低饱和体系。
- 调整现有 Button、Card、Badge、Input、Textarea、Select、Tabs、Dialog、AlertDialog、Popover、Dropdown、Toast、Progress、Skeleton、Switch、Checkbox，保留原 variant 名称，并增加低强调 `soft`、`surface`。
- 新增 `ProductSurface.tsx`，提供 PageHeader、SurfaceCard、MetricCard、EmptyState 与稳定的领域色映射。
- 重做 PlatformShell 的暖白半透明顶栏、克制 active pill、账号区域与悬浮式移动底栏，未改变入口或路由。
- 左上品牌改为纯文字 `ChintAI` 字标；浏览器标题同步更新，并使用从 CHINT 官方站点下载、本地托管的蓝色 C favicon，来源与哈希记录在 `client/public/brand/SOURCE.md`。
- 学习中心的开始/继续学习按钮跟随路径的蓝灰、陶土、青绿领域色，不再使用统一黑色。
- 工作台、资讯、社区、应用、Skills、个人空间及运营 AI 审核卡引入低饱和大色块；AI 助手浮球与面板改为更轻的蓝灰材质。
- 登录页、工作台、学习、资讯、社区、应用、Skills、个人空间、课程/路径/文章/帖子/Skill 详情以及全部运营页面应用同一设计语言。
- 阅读器、AI 助手、图片 Lightbox、Dialog 与 Toast 使用统一圆角、遮罩、阴影和层级；PDF 标注工具色保留为明确工具语义。
- 运营区通过 `data-area="operations"` 使用更紧凑的表格与间距规则，宽表继续容器内滚动。
- 未引入新的 UI 框架、字体包或大型资源。

## 自动化验证

- `pnpm test`：通过，28 个测试文件、155 条测试；高于改造前 147 条。
- `pnpm check`：通过。
- `pnpm build`：通过。Vite 仍报告既有的大 chunk 提示，本轮未混入体积优化。
- `git diff --check`：通过；仅存在 Windows 工作区的 LF/CRLF 提示，无空白错误。
- 新增设计契约测试：领域色映射、公共组件 variant、导航结构。

## Chrome 回归

- 桌面：19 个核心/详情/运营路由全部加载成功，无页面级横向溢出。
- 移动端：390×844 与 360×800 共 20 个路由/视口组合均无页面级横向溢出。
- 移动底栏与 AI 悬浮入口未发生遮挡。
- 390px Dialog 完整位于视口内；Tab 焦点轮廓可见；Escape 可关闭。
- 浏览器控制台未发现 warning 或 error。
- 宽表与长内容保持在各自容器内滚动，没有改写操作布局。

截图目录：`gui-test-screenshots/ui-redesign-2026-09-03/`

- `chintai-learning-desktop.png`
- `chintai-news-desktop.png`
- `chintai-skills-desktop.png`
- `chintai-learning-390x844.png`
- `chintai-ai-390x844.png`
- `chintai-operations-360x800.png`
- `chintai-login-390x844.png`
- `home-desktop.png`
- `learning-desktop.png`
- `news-desktop.png`
- `community-desktop.png`
- `operations-desktop.png`
- `learning-390x844.png`
- `community-390x844.png`
- `operations-360x800.png`
- `ai-assistant-390x844.png`
- `login-390x844.png`

## 主要修改文件

- `client/src/index.css`
- `client/src/components/ProductSurface.tsx`
- `client/src/components/BrandWordmark.tsx`
- `client/src/components/PlatformShell.tsx`
- `client/src/components/AIAssistantBall.tsx`
- `client/src/components/ui/*`
- `client/src/components/learn/*`
- `client/src/components/community/ImageLightbox.tsx`
- `client/src/pages/*`
- `client/src/components/product-surface.contract.test.ts`
- `server/ui-design.contract.test.ts`
- `client/public/brand/chint-favicon.ico`
- `client/public/brand/SOURCE.md`

## Git 与生产验证

- 当前位于 `feature_init`，未 commit、未 push。
- 本轮基于原有未提交工作区继续开发，已有功能修复、测试与报告均予以保留；没有覆盖或清理用户文件。
- 上线前仍建议在真实 SSO、真实文档/PDF/视频资源、生产数据量与真实移动设备安全区下做一次冒烟验证。
- 构建体积拆包、完整深色模式与品牌图形重绘不属于本轮范围。
