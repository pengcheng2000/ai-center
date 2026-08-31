# Agent 内容导入 API v1

每次请求都需要：

```http
Authorization: Bearer $AGENT_IMPORT_TOKEN
Content-Type: application/json
```

基础路径为 `$PLATFORM_BASE_URL/api/agent-import/v1`。令牌由平台管理员一次性签发；令牌被撤销、失效或权限不足时停止处理并提示用户联系管理员。

| 接口 | 用途 | 关键约束 |
|---|---|---|
| `GET /capabilities` | 读取令牌允许的草稿类型与大小限制 | 开始导入前调用。 |
| `POST /assets/fetch-image` | 从用户明确提供的公网图片 URL 下载并托管 | 仅 PNG/JPEG/WebP/GIF；5MB；最多 3 次重定向。 |
| `POST /assets/upload` | 上传二进制文件的 Base64 data URL | 常规文件 12MB；ZIP 8MB；不上传密钥或可执行文件。 |
| `POST /drafts` | 创建资讯、课程资源或 Skills 待审核草稿 | 始终为 `pending_review`；按令牌和幂等键去重。 |

## 抓取图片

```json
POST /assets/fetch-image
{
  "sourceUrl": "https://example.com/diagram.png",
  "fileName": "architecture-diagram.png"
}
```

成功响应：

```json
{
  "assetId": 123,
  "url": "/manus-storage/…",
  "mimeType": "image/png",
  "sizeBytes": 42031,
  "sourceUrl": "https://example.com/diagram.png"
}
```

正文中不要使用返回的 `url`，而使用 `{{asset:123}}` 占位符。平台在运营人员应用草稿时才解析该占位符。

## 上传附件

```json
POST /assets/upload
{
  "assetType": "document",
  "fileName": "guide.pdf",
  "mimeType": "application/pdf",
  "dataUrl": "data:application/pdf;base64,..."
}
```

`assetType` 为 `image`、`document` 或 `package`。`package` 仅接受 ZIP；`image` 仅接受 PNG/JPEG/WebP/GIF 且会校验真实文件头。

## 创建资讯草稿

```json
POST /drafts
{
  "targetType": "news",
  "idempotencyKey": "sha256-of-source-url-and-content-v1",
  "sourceUrl": "https://example.com/article",
  "sourceTitle": "原始页面标题",
  "assetIds": [123],
  "payload": {
    "title": "面向员工的准确标题",
    "summary": "说明内容价值、适用对象和来源的摘要。",
    "contentMarkdown": "## 要点\n\n正文。\n\n![架构图]({{asset:123}})",
    "category": "模型趋势",
    "tags": ["RAG", "知识管理"],
    "publishedAt": "2026-08-27T02:00:00.000Z"
  }
}
```

## 创建课程资源草稿

```json
POST /drafts
{
  "targetType": "course_material",
  "idempotencyKey": "course-12-resource-source-hash-v1",
  "sourceUrl": "https://example.com/guide",
  "assetIds": [456],
  "payload": {
    "courseId": 12,
    "title": "检索增强生成入门图文指南",
    "description": "课程配套的阅读材料。",
    "materialType": "document",
    "assetId": 456,
    "orderIndex": 20,
    "config": {}
  }
}
```

仅能应用到草稿课程。`practice` 资源不得引用远程 URL 或附件。

## 创建 Skills 投稿草稿

```json
POST /drafts
{
  "targetType": "skill",
  "idempotencyKey": "skill-content-import-v1.0",
  "sourceUrl": "https://example.com/repository",
  "assetIds": [789],
  "payload": {
    "skillKey": "content-import-helper",
    "name": "内容导入助手",
    "summary": "将经授权的图文内容整理为待审核草稿。",
    "description": "面向运营人员的 Skills 使用说明。",
    "category": "内容运营",
    "tags": ["内容", "导入"],
    "version": "v1.0",
    "skillMd": "---\nname: content-import-helper\ndescription: …\n---",
    "usageGuide": "安装后，将经授权 URL 交给 Agent。",
    "packageAssetId": 789
  }
}
```

成功响应中的 `draftOnly: true` 表示草稿已经进入运营队列，不表示内容已发布。
