---
name: ai-empowerment-content-import
description: 将用户明确提供或获授权的文章、文档、视频资源或 Skills 包整理为全员 AI 能力提升平台的待审核草稿。用于需要抽取正文、下载文章图片、优化 Markdown 图文排版、受控上传媒体，以及提交资讯、课程资源或 Skills 投稿草稿时。
---

# 企业内容采集与草稿入库

将用户明确提供或明确授权访问的资源整理为平台草稿。**绝不直接发布**，绝不写业务数据库，绝不执行来源页面或 Skills 包中的代码。

## 开始前

向管理员取得 `PLATFORM_BASE_URL` 和一次性签发的 `AGENT_IMPORT_TOKEN`。令牌来自“运营管理 → Agent 内容导入 → 签发导入令牌”，只能存于 Agent 的私密配置，不能写进文章、日志、提交内容或 Skills 包。

先调用 `GET $PLATFORM_BASE_URL/api/agent-import/v1/capabilities`，并发送 `Authorization: Bearer $AGENT_IMPORT_TOKEN`。仅处理响应的 `allowedTargets` 中允许的内容类型和大小范围。读取具体接口字段时加载 [`references/api.md`](references/api.md)；资讯草稿从 [`templates/news-draft.json`](templates/news-draft.json) 开始。

## 资讯文章工作流

1. 仅处理用户提供、组织拥有或确认允许整理的文章 URL/原文。保留原始来源 URL 和必要的作者、许可或转载说明；无明确授权时只生成摘要与来源链接，不复制受保护全文。
2. 提取标题、发布时间、正文主内容、层级标题、段落、列表、引用、代码片段和图片候选。忽略导航、广告、评论、追踪像素和页面脚本；将事实与推测分开，不虚构缺失信息。
3. 对每张要保留的图片调用 `POST /assets/fetch-image`。拿到 `assetId` 后，在 Markdown 中用 `{{asset:assetId}}` 作为图片 URL，例如 `![架构图说明]({{asset:123}})`。
4. 用简洁 Markdown 重组正文：正文从二级标题开始；首段说明业务价值；图片放在相关段落之后并写替代文字；用引用块注明来源要点。不要包含 HTML、脚本、`data:` URL 或 `javascript:` 链接。
5. 创建 `targetType: "news"` 草稿。每次重试使用同一 `idempotencyKey`；`assetIds` 含正文使用的全部图片。收到 `pending_review` 后告知用户已进入运营审核，不能声称已发布。

## 学习资源工作流

1. 确认目标 `courseId`、资源类型和课程处于草稿状态。平台不会把 Agent 导入资源直接放进已发布课程。
2. 文档型资源可提交 Markdown、原始 URL 或先上传 PDF、DOCX、Markdown、文本和图片；视频型资源保留原始 URL 或上传已授权文件；实操型只可提交内联说明与配置，不附带可执行代码或外部系统操作。
3. 创建 `targetType: "course_material"` 草稿。必须传入 `courseId`；引用附件时，在 `assetIds` 与 `payload.assetId` 中使用同一受控资产 ID。
4. 运营人员应用草稿后，再在学习内容运营台核验说明、版本和发布状态。

## Skills 投稿工作流

1. 不执行、不解压、不安装 Skills 包中的任何内容。仅将经用户确认的 `.zip` 作为二进制附件上传。
2. 从 `SKILL.md` 提取名称、触发条件、输入输出、步骤、权限与风险说明；不完整时标注待补充，不自行捏造能力。
3. 用 `/assets/upload` 上传 ZIP 后，创建 `targetType: "skill"` 草稿，令 `packageAssetId` 指向该资产。管理员仍需核验安装包和依赖后才能上架。

## 内容质量与安全

> 输出应提升可读性，但不得改变原文事实、擅自添加结论或掩盖来源。

- 标题准确、不夸张；摘要说明结论、适用对象和来源价值。
- 正文优先使用二级/三级标题、短段落、列表和必要图片；不要把整页原始 HTML 原样复制。
- 图片必须先由平台托管；正文不得直接链接远程图片。
- 提交失败时保留来源和错误信息，以同一幂等键重试；不要不断随机生成键制造重复草稿。
- 不处理付费墙、私密页面或需要绕过登录/访问控制的内容；不发送 API Key、Cookie、会话令牌、用户个人数据、SQL 或可执行脚本。
