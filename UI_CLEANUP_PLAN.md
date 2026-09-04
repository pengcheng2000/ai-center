# 全站 UI 配色与设计优化 — Codex 执行方案（修正版）

> [!IMPORTANT]
> **经对代码库的全面审查，方案中列出的主要改动（约 90%）已在前一轮开发中完成。**
> 当前 `pnpm check`、`pnpm test`（28 文件 155 测试）、`pnpm build` 全部通过。
> 本修正版仅列出**真正剩余未完成的工作**。

---

## 已完成确认清单（不需要再做）

| 文件 | 状态 |
|------|------|
| `client/src/index.css` — Token 值、rich-panel 删除、阴影、渐变 | ✅ 已完成 |
| `server/ui-design.contract.test.ts` — 全部断言已更新 | ✅ 已完成 |
| `client/src/components/product-surface.contract.test.ts` | ✅ 已完成 |
| `client/src/components/ProductSurface.tsx` — 含新 `button` 字段 | ✅ 已完成 |
| `client/src/components/PlatformShell.tsx` — 白色顶栏、1400px、indigo 按钮 | ✅ 已完成 |
| `client/src/components/BrandWordmark.tsx` | ✅ 无需修改 |
| `client/src/components/AIAssistantBall.tsx` — 全部改为 blue-600/white | ✅ 已完成 |
| `client/src/components/ui/button.tsx` — soft variant 改 indigo | ✅ 已完成 |
| `client/src/lib/learnExperience.ts` — PATH_ACCENTS 新色配 | ✅ 已完成 |
| `client/src/pages/Home.tsx` — indigo 领域色、1400px、紧凑页头 | ✅ 已完成 |
| `client/src/pages/LearningCenter.tsx` — 紧凑页头、1400px | ✅ 已完成 |
| `client/src/pages/NewsCenter.tsx` — blue 领域色、紧凑页头 | ✅ 已完成 |
| `client/src/pages/Community.tsx` — emerald 领域色、紧凑页头 | ✅ 已完成 |
| `client/src/pages/ApplicationCenter.tsx` — orange 领域色、紧凑页头、1400px | ✅ 已完成 |
| `client/src/pages/SkillsHub.tsx` — violet 领域色、紧凑页头、1400px | ✅ 已完成 |
| `client/src/pages/Profile.tsx` — indigo、rounded-xl、1200px | ✅ 已完成 |
| `client/src/pages/Login.tsx` — bg-white、rounded-xl、indigo 链接 | ✅ 已完成 |

---

## 剩余工作

### Step 1: 清理 `client/src/App.tsx` 中的旧色值

**文件**：`client/src/App.tsx`
**行号**：L44

找到：
```tsx
  if (loading || !user) return <div className="grid min-h-screen place-items-center bg-[#f6f6f3]" aria-label="正在验证登录状态"><Loader2 className="h-6 w-6 animate-spin text-violet-600" /></div>;
```

替换为：
```tsx
  if (loading || !user) return <div className="grid min-h-screen place-items-center bg-white" aria-label="正在验证登录状态"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>;
```

**原因**：`bg-[#f6f6f3]` 是旧暖灰背景，应改为 `bg-white`。`text-violet-600` 应改为 `text-indigo-500` 与新色系一致。

---

### Step 2: 清理 `client/src/pages/NotFound.tsx`

**文件**：`client/src/pages/NotFound.tsx`

**2.1** L14 — 旧背景色：
找到：`bg-[#f6f6f3]`
替换为：`bg-white`

**2.2** L23 — 旧 slate 文字色：
找到：`text-slate-900`
替换为：`text-gray-900`

**2.3** L25 — 旧 slate 文字色：
找到：`text-slate-700`
替换为：`text-gray-700`

**2.4** L29 — 旧 slate 文字色：
找到：`text-slate-500`
替换为：`text-gray-500`

---

### Step 3: 清理 `client/src/components/learn/DocReader.tsx`

**文件**：`client/src/components/learn/DocReader.tsx`

**3.1** L87 — 沉浸模式背景：
找到：`bg-[#f6f6f3]`
替换为：`bg-gray-50`
（同一行中 `border-slate-200` → `border-gray-200`）

完整行替换：
找到：
```tsx
  return <div ref={containerRef} className={cn(immersive ? "fixed inset-0 z-40 flex flex-col bg-[#f6f6f3]" : "overflow-hidden rounded-2xl border border-slate-200 bg-white")}>
```
替换为：
```tsx
  return <div ref={containerRef} className={cn(immersive ? "fixed inset-0 z-40 flex flex-col bg-gray-50" : "overflow-hidden rounded-xl border border-gray-200 bg-white")}>
```

**3.2** L88 — 进度条颜色：
找到：
```tsx
    <div className={cn("h-1 w-full shrink-0 bg-slate-100", immersive && "bg-violet-100")}><div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-[width]" style={{ width: `${percent}%` }} /></div>
```
替换为：
```tsx
    <div className={cn("h-1 w-full shrink-0 bg-gray-100", immersive && "bg-indigo-100")}><div className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 transition-[width]" style={{ width: `${percent}%` }} /></div>
```

**3.3** L95 — 工具栏边框：
找到：`border-slate-100`
替换为：`border-gray-100`

**3.4** L98 — 沉浸模式正文背景：
找到：`bg-[#f6f6f3]`
替换为：`bg-gray-50`

**3.5** L99 — prose 色调：
找到：`prose-slate`
替换为：`prose-gray`

---

### Step 4: 更新 `client/src/index.css` 中的 `--color-slate-*` 兼容色阶

当前 `--color-slate-*` 仍然是旧的暖灰色调，与新的纯白/冷灰基底不协调。

**文件**：`client/src/index.css`，约 L77-L87

找到：
```css
  --color-slate-50: #f5f5f2;
  --color-slate-100: #ecece8;
  --color-slate-200: #dedfda;
  --color-slate-300: #c8cbc5;
  --color-slate-400: #929792;
  --color-slate-500: #686d69;
  --color-slate-600: #505551;
  --color-slate-700: #3c403d;
  --color-slate-800: #2b2e2b;
  --color-slate-900: #242624;
  --color-slate-950: #1a1c1a;
```

替换为标准 Tailwind slate（冷灰）色阶：
```css
  --color-slate-50: #f8fafc;
  --color-slate-100: #f1f5f9;
  --color-slate-200: #e2e8f0;
  --color-slate-300: #cbd5e1;
  --color-slate-400: #94a3b8;
  --color-slate-500: #64748b;
  --color-slate-600: #475569;
  --color-slate-700: #334155;
  --color-slate-800: #1e293b;
  --color-slate-900: #0f172a;
  --color-slate-950: #020617;
```

**原因**：运营后台和详情页（不在本轮修改范围内）仍在使用 `slate-*` 类名。旧的暖灰色调与新的纯白基底视觉不协调，升级为标准冷灰色阶可以让这些页面自动获得更干净的视觉效果。

---

### Step 5: 更新 `--radius` 值

**文件**：`client/src/index.css`，L43

找到：`--radius: 0.625rem;`
替换为：`--radius: 0.75rem;`

**原因**：当前 `--radius` 是 10px，方案约定 12px 统一圆角。这影响 `radius-sm` (9px→9px)、`radius-md` (10px→12px)、`radius-lg` (14px→16px)、`radius-xl` (18px→20px) 的计算基础。

---

### Step 6: 更新 `--color-amber-*` 和 `--color-rose-*` 兼容色阶（可选）

当前 `amber` 和 `rose` 仍是旧的低饱和色阶。如果时间允许，建议也替换为标准 Tailwind 色阶：

**amber**（L132-L142）：
```css
  --color-amber-50: #fffbeb;
  --color-amber-100: #fef3c7;
  --color-amber-200: #fde68a;
  --color-amber-300: #fcd34d;
  --color-amber-400: #fbbf24;
  --color-amber-500: #f59e0b;
  --color-amber-600: #d97706;
  --color-amber-700: #b45309;
  --color-amber-800: #92400e;
  --color-amber-900: #78350f;
  --color-amber-950: #451a03;
```

**rose**（L143-L153）：
```css
  --color-rose-50: #fff1f2;
  --color-rose-100: #ffe4e6;
  --color-rose-200: #fecdd3;
  --color-rose-300: #fda4af;
  --color-rose-400: #fb7185;
  --color-rose-500: #f43f5e;
  --color-rose-600: #e11d48;
  --color-rose-700: #be123c;
  --color-rose-800: #9f1239;
  --color-rose-900: #881337;
  --color-rose-950: #4c0519;
```

---

### Step 7: 验证

```bash
pnpm check    # TypeScript 类型检查
pnpm test     # 28 文件 155 测试
pnpm build    # Vite 构建
```

所有应当通过。如果某些测试检查了 `--color-slate-50` 或 `--radius` 的具体值，需要同步更新断言。

---

### Step 8: 更新 PROJECT_STATE.md

在 `PROJECT_STATE.md` 中，将设计系统描述更新为：

> 全站现代干净设计系统：纯白 `#FFFFFF` 基底、冷灰 `#F9FAFB` 次级表面、四种中等鲜明度领域色（学习 Indigo `#6366F1`、工作 Orange `#F97316`、社区 Emerald `#10B981`、资讯 Blue `#3B82F6`）；Skills 使用 Violet `#8B5CF6`；紧凑页头取代深色大色块 Hero，各页面 CTA 跟随领域色；`rounded-xl`(12px) 卡片 + `rounded-lg`(8px) 按钮统一圆角规范；卡片默认无阴影，hover 时微弱阴影。

同时记录：运营后台页面和详情页内部仍使用旧的 violet/slate 色系，计划在后续轮次处理。

---

## 注意事项

> [!WARNING]
> **运营后台和详情页不在本轮范围内**。以下文件仍有旧的 `violet-700`、`font-serif`、`rounded-full`、`slate-*` 用法，这是**预期行为**，不要修改它们：
> - `Operations.tsx`、`ContentOperations.tsx`、`CommunityOperations.tsx`、`ApplicationOperations.tsx`
> - `GovernanceCenter.tsx`、`ResourceLifecycleCenter.tsx`
> - `AgentImportOperations.tsx`、`SkillsDirectImport.tsx`、`SkillsOperations.tsx`
> - `CourseDetail.tsx`、`LearningPathDetail.tsx`、`NewsArticle.tsx`、`PostDetail.tsx`、`SkillDetail.tsx`、`SkillSubmit.tsx`

> [!NOTE]
> CSS 中的 `.font-serif` 重定向规则（`font-family: var(--font-sans)`）使得这些页面的 `font-serif` 类名实际渲染为 sans-serif，不需要逐个删除。
> CSS 中的 `--color-slate-*` 兼容色阶升级后，运营后台和详情页的 `slate-*` 类会自动获得更现代的冷灰色调。

---

## 追加：学习中心路径卡片配色修复

> [!IMPORTANT]
> 学习中心的三个大色块卡片（AI 素养起步 / 把 AI 用进日常工作 / 业务场景 AI 实践）当前使用 500/600 级别的高饱和度渐变，视觉上太亮、不够高级。
> 需要改为 700→800 的深色微差渐变（Apple/Linear 风格），CTA 按钮同步变深。

### 修改文件

**文件**：`client/src/lib/learnExperience.ts`，约 L108-L113

找到：
```ts
export const PATH_ACCENTS: Record<string, { gradient: string; chip: string; icon: string; ring: string; button: string }> = {
  violet: { gradient: "from-indigo-500 via-indigo-600 to-indigo-500", chip: "bg-indigo-50 text-indigo-700", icon: "bg-indigo-600", ring: "ring-indigo-200", button: "bg-[#6366f1] text-white hover:bg-indigo-700" },
  orange: { gradient: "from-orange-400 via-orange-500 to-orange-400", chip: "bg-orange-50 text-orange-700", icon: "bg-orange-500", ring: "ring-orange-200", button: "bg-[#f97316] text-white hover:bg-orange-600" },
  emerald: { gradient: "from-emerald-500 via-emerald-600 to-emerald-500", chip: "bg-emerald-50 text-emerald-700", icon: "bg-emerald-600", ring: "ring-emerald-200", button: "bg-[#10b981] text-white hover:bg-emerald-700" },
  sky: { gradient: "from-blue-400 via-blue-500 to-blue-400", chip: "bg-blue-50 text-blue-700", icon: "bg-blue-500", ring: "ring-blue-200", button: "bg-[#3b82f6] text-white hover:bg-blue-700" },
  rose: { gradient: "from-violet-400 via-violet-500 to-violet-400", chip: "bg-violet-50 text-violet-700", icon: "bg-violet-500", ring: "ring-violet-200", button: "bg-[#8b5cf6] text-white hover:bg-violet-700" },
};
```

替换为：
```ts
export const PATH_ACCENTS: Record<string, { gradient: string; chip: string; icon: string; ring: string; button: string }> = {
  violet: { gradient: "from-indigo-700 to-indigo-800", chip: "bg-indigo-50 text-indigo-700", icon: "bg-indigo-700", ring: "ring-indigo-200", button: "bg-indigo-700 text-white hover:bg-indigo-800" },
  orange: { gradient: "from-orange-700 to-orange-800", chip: "bg-orange-50 text-orange-700", icon: "bg-orange-700", ring: "ring-orange-200", button: "bg-orange-700 text-white hover:bg-orange-800" },
  emerald: { gradient: "from-emerald-700 to-emerald-800", chip: "bg-emerald-50 text-emerald-700", icon: "bg-emerald-700", ring: "ring-emerald-200", button: "bg-emerald-700 text-white hover:bg-emerald-800" },
  sky: { gradient: "from-blue-700 to-blue-800", chip: "bg-blue-50 text-blue-700", icon: "bg-blue-700", ring: "ring-blue-200", button: "bg-blue-700 text-white hover:bg-blue-800" },
  rose: { gradient: "from-violet-700 to-violet-800", chip: "bg-violet-50 text-violet-700", icon: "bg-violet-700", ring: "ring-violet-200", button: "bg-violet-700 text-white hover:bg-violet-800" },
};
```

### 变更说明

| 属性 | 之前 | 之后 |
|------|------|------|
| `gradient` | `from-X-400/500 via-X-500/600 to-X-400/500`（三段亮渐变） | `from-X-700 to-X-800`（两段深色微差渐变） |
| `icon` | `bg-X-500/600`（中亮） | `bg-X-700`（与渐变统一） |
| `button` | `bg-[#hex] hover:bg-X-600/700`（原色硬编码） | `bg-X-700 hover:bg-X-800`（深色语义类名） |
| `chip` | 不变 | 不变 |
| `ring` | 不变 | 不变 |

### 契约测试更新

`server/ui-design.contract.test.ts` L52-L53 断言了 `button: "bg-[${color}]"` 格式，改动后需要更新：

找到：
```ts
    for (const color of ["#6366f1", "#f97316", "#10b981", "#3b82f6", "#8b5cf6"])
      expect(learning).toContain(`button: "bg-[${color}]`);
```

替换为：
```ts
    for (const token of ["indigo-700", "orange-700", "emerald-700", "blue-700", "violet-700"])
      expect(learning).toContain(`button: "bg-${token}`);
```

### 范围限制

> [!WARNING]
> **只改 `learnExperience.ts` 的 `PATH_ACCENTS` 和对应契约测试。**
> 不要修改 `LearningCenter.tsx` 本身的 JSX 结构，不要修改其他页面。
> `pathAccent()` 函数和卡片渲染代码不需要改动，它们会自动读取新的色值。

### 验证

```bash
pnpm check
pnpm test
```
