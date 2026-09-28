# M2 可选择的视觉风格与确定性版式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 生成前自动或手选三种统一风格，让现有五种语义页面呈现不同、可编辑且确定性的 PPTX。

**Architecture:** 风格 ID 独立于 DeckSpec；模型在现有一次规划调用中建议风格，手选优先。Theme 存预设，Layout 按风格和内容确定性安排元素，Renderer 继续写原生 PPTX；API 在成功响应头回传实际风格，网页显示结果。

**Tech Stack:** 现有 Next.js 16、React 19、TypeScript、Zod 4、PptxGenJS、Vitest、pnpm；不新增运行时依赖。

**Spec:** `docs/specs/m2-style-intelligence/SPEC.md`

## Global Constraints

- `DeckSpec` / `SlideSpec` 的字段及 `title`、`title_body`、`three_cards`、`comparison`、`process` 五种布局类型不变；AI 不输出几何坐标。
- `auto` 为网页默认；手选 `classic` / `dark` / `warm` 优先；省略 API 字段按 `classic` 兼容 M1。
- 风格建议必须复用本次模型调用；只因风格缺失/无效时回退经典蓝并提示，不额外调用；仅 JSON/DeckSpec 无效可按 M1 对同一模型重试一次。
- 保留 M1 的密钥与模型安全边界：本机 `127.0.0.1`、无公开部署、90 秒、256 KiB、无重定向；测试不自动产生付费调用。
- M0 `/api/demo` 保持原经典蓝五页与可编辑输出；不做生成后换肤、进度可视化、预览、叙事优化、新语义页面、图表或图片。
- 现有 `feat/feedback-states` PR #1 未获批准前不合并；M2 分支独立推进。若该 PR 先合并，开始修改 `studio.tsx` 前同步 `main` 并保留红色错误/绿色成功提示；不得覆盖用户未提交改动。
- 每项任务先看到针对性测试 RED、再实现到 GREEN，跑全量测试/lint/build，单独提交并推送 **feature branch**；`next-env.d.ts` 若被 build 自动改写须还原，避免混入提交；完成后开 PR，未经用户确认不合并 `main`。

## Review Focus

- 模型仅返回旧版合法 DeckSpec，或 wrapper 的风格字段缺失/拼错：内容仍成功、`auto` 明确回退、无额外调用（任务 4）。
- 手选 `warm` 而模型建议 `dark`：最终 PPTX 和响应头必须是 `warm`，不能只更改 UI 文案（任务 5）。
- 非法 `styleChoice` / 附加未知字段：在查密钥、调用模型前返回 400，无 PPTX（任务 4、5）。
- 长中文、长英文词及五步流程无法保守容纳：不静默截断，也不依赖 PptxGenJS 隐式无限缩字；无法放下时返回安全错误（任务 3、5）。
- 深色主题文字背景对比不足、经典 Demo 意外变样：预设对比和经典布局基线测试，最终样例人工查看（任务 1、2、6）。

---

### Task 1: 风格 ID 与三个内建 Theme

**Files:** Modify `src/domain/theme.ts`; create `src/domain/theme.test.ts`.

**Interfaces:** Produce `StyleId = 'classic' | 'dark' | 'warm'`、`StyleChoice = StyleId | 'auto'`、`styleChoiceSchema`（Zod enum）和 `themeForStyle(id: StyleId): Theme`；`Theme` 加只供布局使用的 `styleId: StyleId`。`defaultTheme` 是 `classic`，保留原 M0 颜色、尺寸、字体、间距和字号。风格中文名可由 UI 的固定映射提供，不把文案塞进 DeckSpec。

- [ ] **Step 1 — RED:** `theme.test.ts` 的 `it('keeps classic stable and dark legible')` 断言 `expect(defaultTheme.colors.primary).toBe('1667CF')`、`expect(themeForStyle('dark').colors.background).not.toBe(defaultTheme.colors.background)`、`expect(contrast(themeForStyle('dark').colors.ink, themeForStyle('dark').colors.background)).toBeGreaterThanOrEqual(4.5)`（测试内 sRGB 公式，不复用被测实现）；另一测试断言 `styleChoiceSchema.safeParse('auto').success === true`、`safeParse('unknown').success === false`。
- [ ] **Step 2 — Verify RED:** `pnpm test src/domain/theme.test.ts`；预期缺少导出/断言失败。
- [ ] **Step 3 — GREEN:** 在 `theme.ts` 实现固定预设与导出；无字体下载、配置文件、工厂或主题插件。
- [ ] **Step 4 — Verify:** 目标测试及 `pnpm test && pnpm lint && pnpm build` 均通过。
- [ ] **Step 5 — Commit:** `git add src/domain/theme.ts src/domain/theme.test.ts && git commit -m "feat: add three editable deck styles"`，推送 `feat/m2-style`。

### Task 2: 五种布局的风格化确定性构图

**Files:** Modify `src/presentation/layout.ts`, `src/presentation/layout.test.ts`, `src/presentation/render.test.ts`.

**Interfaces:** Consume Task 1 `Theme.styleId`；保留 `layoutSlide(slide: SlideSpec, theme: Theme): Element[]`、`assertWithinSlide`、`renderDeck(deck, theme)` 签名。`classic` 走原坐标；`dark`、`warm` 在每种现有布局上至少改变一个可观察的文本或形状几何位置，不只改色。仍由唯一 Renderer 使用 `Element[]`。

- [ ] **Step 1 — RED:** `it('changes geometry without changing the classic demo')` 遍历 `demoDeck.slides`，逐页断言 `layoutSlide(slide, themeForStyle('dark'))` 两次全等、`assertWithinSlide` 不抛错，并比较两组 `Element` 的 `[x,y,w,h]` 列表：`dark !== classic`、`warm !== classic`、`dark !== warm`；经典标题强调形状的 `x === defaultTheme.margin`，卡片原坐标不变。`renderDeck(demoDeck)` 仍保留原五页可编辑包。
- [ ] **Step 2 — Verify RED:** `pnpm test src/presentation/layout.test.ts src/presentation/render.test.ts`；预期新风格几何相同导致失败。
- [ ] **Step 3 — GREEN:** 在现有 `layoutSlide` 分支中加入风格化构图和内容量驱动的安全排布；不加新 layout 枚举、随机数或第二个 Renderer。
- [ ] **Step 4 — Verify:** 目标测试及 `pnpm test && pnpm lint && pnpm build` 均通过。
- [ ] **Step 5 — Commit:** 提交 Task 2 三个文件，提交信息 `feat: vary existing slide layouts by style`，推送分支。

### Task 3: 密文本的保守适配与明确失败

**Files:** Modify `src/presentation/layout.ts`, `src/presentation/layout.test.ts`.

**Interfaces:** Produce `LayoutOverflowError extends Error`，由 `layoutSlide` 在确定性估算无法容纳文字时抛出，供 Task 5 映射安全 JSON 错误。只在布局层做保守字号/行预算或退回较宽排布，不截断 `Element.value`；保持 `assertWithinSlide` 的几何职责不变。M3/M4 再做像素级/全面视觉 QA。

- [ ] **Step 1 — RED:** `it('rejects an overfull but schema-valid process slide')` 用 `steps: Array.from({length: 5}, ...detail: '长'.repeat(110))` 断言 `expect(() => layoutSlide(dense, themeForStyle('warm'))).toThrow(LayoutOverflowError)`；另一测试用长中文/英文但可容纳的 `title_body` 断言输出的文字 `value` 与输入完全一致、文字 `size >= 14`。五页 Demo 在三风格下不抛错。
- [ ] **Step 2 — Verify RED:** `pnpm test src/presentation/layout.test.ts`；预期超密文本仍返回元素而不抛出。
- [ ] **Step 3 — GREEN:** 在文字放置后做简明保守的宽度/行高预算，优先已有宽排布/有限缩字；预算不足抛错，不靠 PptxGenJS 的 `fit: 'shrink'` 掩盖失败；不引入字体测量服务或新依赖。
- [ ] **Step 4 — Verify:** 目标测试及 `pnpm test && pnpm lint && pnpm build` 均通过。
- [ ] **Step 5 — Commit:** 提交 `layout.ts` 和 `layout.test.ts`，提交信息 `fix: reject unsafe text layouts`，推送分支。

### Task 4: 一次规划请求同时取得内容和风格

**Files:** Modify `src/server/planner.ts`, `src/server/planner.test.ts`, `src/server/generate.ts`（仅同步新的 `planDeck` 返回类型，先仍用经典蓝，保证全量构建通过）。

**Interfaces:** `generationRequestSchema` 增加 `styleChoice: styleChoiceSchema.default('classic')`；网页将在 Task 6 显式提交 `auto`。`planDeck(input: GenerationRequest, config: ModelConfig, key: string, fetcher?: typeof fetch): Promise<{ deck: DeckSpec; suggestedStyle: StyleId | null }>`；调用方 Task 5 决定最终风格。接受 `{deck, styleId}` 或旧版合法裸 DeckSpec；风格缺失/无效返回 `null`，不能绕过 DeckSpec/页数/首页验证。

- [ ] **Step 1 — RED:** 旧 fixture `request` 加 `styleChoice: 'classic'`，旧断言改为 `.deck`；`it('suggests style without a second call')` 用离线假 fetch 返回 `{deck,styleId:'dark'}`，断言 `suggestedStyle === 'dark'`、调用数为 1。表驱动返回裸 DeckSpec、缺/无效 `styleId` 均断言 `{deck,suggestedStyle:null}` 和一次请求；无效 JSON/DeckSpec 两次、401 一次；prompt 不含密钥并列出三风格；`generationRequestSchema.safeParse({...request,styleChoice:'other'}).success === false`。
- [ ] **Step 2 — Verify RED:** `pnpm test src/server/planner.test.ts`；预期新返回结构/风格断言失败。
- [ ] **Step 3 — GREEN:** 保留 M1 的同模型一次重试与安全错误；风格作为 wrapper 元数据解析，校验内容后再处理风格；不调用另一个模型。同步 `generate.ts` 解构 `{ deck }` 后继续按默认主题渲染，Task 5 才应用风格。
- [ ] **Step 4 — Verify:** 目标测试及 `pnpm test && pnpm lint && pnpm build` 均通过。
- [ ] **Step 5 — Commit:** 提交 `planner.ts`、`planner.test.ts`、`generate.ts`，提交信息 `feat: suggest a style in the planning call`，推送分支。

### Task 5: 生成 API 应用最终风格并回传元数据

**Files:** Modify `src/server/generate.ts`, `src/app/api/generate/route.test.ts`.

**Interfaces:** `createGenerateResponse(...)` 维持签名；解析 Task 4 的 `styleChoice`，`styleChoice==='auto' ? suggestedStyle ?? 'classic' : styleChoice` 得最终 `StyleId`，用 Task 1 `themeForStyle` 调用 `renderDeck`。成功只在 PPTX 响应设置 `X-SlideAgent-Style: <styleId>`；自动模式无效建议时另设 `X-SlideAgent-Style-Fallback: 1`，其他成功响应不设此头。Task 3 的 `LayoutOverflowError` 映射 422 与安全、可操作的中文错误。

- [ ] **Step 1 — RED:** `it('renders the manual style, not the model suggestion')` 用假模型返回 `{deck,styleId:'dark'}`，请求 `styleChoice:'warm'`，断言 `response.headers.get('X-SlideAgent-Style') === 'warm'`、PPTX ZIP 的颜色/形状与 `dark` 不同且含可编辑文字；`auto` 返回 `dark`。另测试缺风格返回经典蓝及 fallback 头、只调用一次；省略字段默认经典；非法/未知字段在 fetch 前 400；布局溢出 422 且 JSON 非 PPTX。M1 无模型/无密钥及 Demo 仍可用。
- [ ] **Step 2 — Verify RED:** `pnpm test src/app/api/generate/route.test.ts`；预期未应用主题/缺响应头导致失败。
- [ ] **Step 3 — GREEN:** 在现有组合函数中选择 Theme、调用既有 Renderer，并写安全响应头；只捕获明确的布局错误，不把模型原文/密钥放入响应。
- [ ] **Step 4 — Verify:** 目标测试及 `pnpm test && pnpm lint && pnpm build` 均通过。
- [ ] **Step 5 — Commit:** 提交 `generate.ts` 和 route 测试，提交信息 `feat: render and report the chosen style`，推送分支。

### Task 6: 网页风格选择、提示与本机验收

**Files:** Modify `src/app/studio.tsx`, `src/app/page.test.tsx`, `README.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`（只更新 M2 状态；若 PR #1 已合并，保留其后续事项）。

**Interfaces:** 页面表单选择 `auto`、`classic`、`dark`、`warm`，默认 `auto`；提交 `styleChoice`；成功读取 `X-SlideAgent-Style` 和可选 fallback 头，显示中文风格及回退说明，然后下载 Blob。不能因为丢失/未知响应头展示未经验证的任意文本；错误 JSON 不下载。M0 Demo 链接和现有状态提示（若 PR #1 已合并）保持可用。

- [ ] **Step 1 — RED:** SSR 测试断言首页 HTML 包含 `name="styleChoice"`、四个固定选项及 `value="auto" selected`，仍包含 `Generate Demo PPT`；`pnpm test src/app/page.test.tsx` 在旧 UI 上应失败。本机浏览器脚本随后用**拦截/本机假响应**断言手选请求体、成功实际风格/回退文案；失败 JSON 时不调用 `URL.createObjectURL`。
- [ ] **Step 2 — Verify RED:** `pnpm test src/app/page.test.tsx`；预期找不到风格选择控件。
- [ ] **Step 3 — GREEN:** 给 `Studio` 加原生 `<select>`，使用现有 fetch/Blob 与状态提示逻辑；更新使用文档及 M2 当前范围，不加新依赖或预览/换肤状态存储。
- [ ] **Step 4 — Verify:** `pnpm test && pnpm lint && pnpm build`；本机启动后在浏览器验证四选项、自动/手选/回退提示和 Demo 下载，离线检查三套五页 PPTX 样例可读与可编辑；不使用真实密钥收费。
- [ ] **Step 5 — Commit/PR:** 提交 Task 6 指定文件并推送 `feat/m2-style`；复核分支全量 diff、远端 SHA 与工作区；针对 `main` 创建 PR 供用户审查，**不自动合并**。如 PR #1 已先合并，先合入最新 `main`、解决 `studio.tsx` 冲突并重新运行所有验证。
