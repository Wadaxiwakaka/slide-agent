# M0 Rendering Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 无 AI 地生成可下载、可编辑的五页示例 PPTX。

**Architecture:** Schema 是语义数据；Theme 注入布局；Layout 产出内部 text/rect/line 元素并验证边界；Renderer 转成 PptxGenJS；API 只编排并下载。单体 Next.js 不拆服务。

**Tech Stack:** Next.js, React, TypeScript, Tailwind, Zod, PptxGenJS, Vitest, pnpm.

**Spec:** `docs/specs/m0-rendering-engine/SPEC.md`

## Global Constraints

- 只做 M0；不添加 LLM、Python、数据库、预览或网络服务。
- 16:9，五页，各覆盖 `title`、`title_body`、`three_cards`、`comparison`、`process`。
- DeckSpec 不含绝对坐标，不依赖 PptxGenJS；文本与形状必须可编辑。
- 每个任务完成后单独 commit + push `main`，先测试再提交。

## Review Focus

- 未知 layout / 缺字段：Zod 拒绝（任务 2）。
- 超长标题 / 非三张卡片：Zod 拒绝（任务 2）。
- NaN / 零尺寸 / 越过页边：布局检查拒绝（任务 3）。
- 五种布局均在页内：完整示例检测（任务 3）。
- 生成物是真实五页 PPTX 而非伪扩展名：ZIP 内 slide 文件检测（任务 4）。

---

### Task 1: 初始化 Next.js

**Files:** Create/modify `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css` 等 create-next-app 基础文件；保留现有文档和 git。

**Interfaces:** `pnpm dev`, `pnpm build`, `pnpm test`（测试脚本先建立）。

- [ ] 用 `pnpm create next-app` 在临时目录生成最小 TypeScript/App Router/Tailwind/src 项目，复制到当前目录并删除临时项目；不覆盖已有文档。
- [ ] 安装 `zod`, `pptxgenjs`, `vitest`；设置 `test` 脚本，运行 `pnpm build` 确认脚手架可用。
- [ ] commit `chore: scaffold Next.js application`，push。

### Task 2: Schema、Theme、示例

**Files:** Create `src/domain/deck.ts`, `src/domain/theme.ts`, `src/domain/demo.ts`, `src/domain/deck.test.ts`.

**Interfaces:** `deckSchema.parse(input)` → `DeckSpec`；`defaultTheme: Theme`；`demoDeck: DeckSpec`。SlideSpec 用 `layout` 判别联合；主题尺寸用英寸。

- [ ] 先写可运行的合法/非法 schema 测试；运行 `pnpm test` 确认失败。
- [ ] 定义五种布局的输入约束（卡片严格 3；步骤 2–5；字符串非空、有长度上限），主题和五页示例；运行 `pnpm test` 确认通过。
- [ ] commit `feat: define deck schema theme and demo`，push。

### Task 3: 确定性布局和边界验证

**Files:** Create `src/presentation/layout.ts`, `src/presentation/layout.test.ts`.

**Interfaces:** `layoutSlide(slide: SlideSpec, theme: Theme): Element[]`；`assertWithinSlide(elements: Element[], theme: Theme): void`；Element 为独立于 PPTX 的 text / rect / line 联合，含坐标和样式。

- [ ] 先写五种布局、重复结果、NaN/零尺寸/越界元素的失败测试。
- [ ] 为各布局实现固定规则及边界检查；跑 `pnpm test`。
- [ ] commit `feat: lay out and validate five slide types`，push。

### Task 4: PPTX 渲染与二进制验证

**Files:** Create `src/presentation/render.ts`, `src/presentation/render.test.ts`.

**Interfaces:** `renderDeck(deck: DeckSpec, theme?: Theme): Promise<Buffer>`，渲染前调用 schema 与布局校验。

- [ ] 先写生成物是 ZIP（PK 签名）、内部恰有五个 slide XML 文件并含文字/形状的失败测试。
- [ ] 用 PptxGenJS 映射内部元素到可编辑 text / shapes，导出二进制；跑 `pnpm test`。
- [ ] commit `feat: render editable five-slide pptx`，push。

### Task 5: 下载 UI 与最终验证

**Files:** Modify `src/app/page.tsx`, `src/app/globals.css`; create `src/app/api/demo/route.ts`; update `README.md`.

**Interfaces:** `GET /api/demo` 返回 `application/vnd.openxmlformats-officedocument.presentationml.presentation`，下载文件名 `slide-agent-demo.pptx`。

- [ ] 编写路由 HTTP 响应测试（若 Next 的模块导入可直接测试），先验证失败，再加入 API 和最小可访问首页。
- [ ] `pnpm test`、`pnpm build`；启动服务器用 HTTP 下载并检查 ZIP 文件结构；有兼容软件则手动打开验证。
- [ ] commit `feat: download demo pptx from web`，push，核对远端状态后停止 M0。
