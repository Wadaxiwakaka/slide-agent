# Narrative Outline and Evidence Slides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户先编辑并确认有叙事逻辑的大纲，再生成对应的可编辑 PPTX，并在材料支持时使用时间轴/数据重点页。

**Architecture:** Outline 是独立语义模型，浏览器暂存；同一已选模型分别规划大纲和 DeckSpec。服务端在两阶段校验来源、确认的页序与文字；新增两种 SlideSpec 由现有确定性布局/渲染链输出三套主题，不引入数据库或第二个 Renderer。

**Tech Stack:** Next.js 16、React 19、TypeScript、Zod 4、PptxGenJS、Vitest、pnpm；复用原生 fetch 与既有三协议适配器，无新运行时依赖。

**Spec:** `docs/specs/m2-content-intelligence/SPEC.md`

## Global Constraints

- 本机单用户，仅 `127.0.0.1`；密钥只读 `SLIDEAGENT_API_KEY_<ALIAS>`，无真实付费测试、公开部署或新增存储。
- 主题/原文输入及页数继续用现有 `generationRequestSchema`（1–10 页）；封面固定第一页，其他页顺序以已确认大纲为准。
- 首次大纲、确认后生成各至少一次模型调用，重新生成/坏输出重试可能收费；每次调用 90 秒、256 KiB、禁止重定向；只有无效输出最多同模型重试一次，鉴权/网络错误不重试。
- 不改变已有五种 SlideSpec 字段、M0 Demo 或三主题；新增 `timeline`、`data_highlight` 不含 x/y/w/h，原 `/api/generate` 无大纲请求继续有效。
- 资料不足不做事实性时间轴/数据重点页；新增日期/数值必须有原始输入片段支持。日期事件/数值标签的语义关系仍需用户审阅，不宣称自动事实核查。
- 新功能独立分支按任务先 RED 再 GREEN，逐项 `pnpm test && pnpm lint && pnpm build`、提交推送；最终开面向 `main` 的 PR，未经确认不合并。构建改写的 `next-env.d.ts` 还原。
- 生成后网页内编辑与多轮对话、M3 预览/确认下载不在本阶段；M2 人工 PPTX 视觉检查及根目录 lint 误扫 worktree 是单列的验收遗留，不混入本 PR。

## File map

- `src/domain/deck.ts`：新增两种语义页面及字段；`src/domain/outline.ts`：可编辑但尚未渲染的大纲 schema。
- `src/server/evidence.ts`：来源片段与完整数字边界验证；`src/server/outline.ts`：大纲模型调用；`src/server/planner.ts`：可选已确认大纲的最终规划。
- `src/server/create-outline.ts` 与 `src/app/api/outline/route.ts`：沿用现有本机请求防护的大纲 API；现有 `src/server/generate.ts` / generate route 维持旧接口兼容。
- `src/presentation/layout.ts`：新页面的三主题元素排布；现有 `render.ts` 不拆渲染器。`src/app/outline-editor.tsx`：可编辑大纲；`src/app/studio.tsx`：两阶段状态与请求。

## Review Focus

- `10` 不得凭 `110` 的局部匹配通过数值来源校验（Task 3）。
- 模型建议缺少来源的时间轴/数据页，或用户编辑大纲时添加了无来源数字：模型生成最终文稿之前即拒绝（Tasks 3–6）。
- 用户调整页序/改标题/改核心观点后，模型输出旧顺序或偷换内容：不能下载 PPTX（Task 6）。
- 重生成大纲会覆盖未保存的编辑，输入变化不能使用旧大纲（Task 7）。
- 旧版无大纲生成与 Demo、无密钥/401、安全错误、自动风格回退继续正常（Tasks 5–7）。

---

### Task 1: 两种语义页面的 schema

**Files:** Modify `src/domain/deck.ts`, `src/domain/deck.test.ts`.

**Interfaces:** `SlideSpec` 增加 `timeline: {layout:'timeline'; title; takeaway; events: {date; event; sourceQuote}[]}`（2–5 项）及 `data_highlight: {layout:'data_highlight'; title; value; label; takeaway; sourceQuote}`；`title` 最长 60、`takeaway/event` 最长 110、`label` 最长 42、`date/value` 最长 32、`sourceQuote` 最长 200，均非空；保持 `deckSchema` 严格字段与已有类型。

- [ ] **Test RED:** 在 `deck.test.ts` 添加 `it('accepts source-backed semantic pages and rejects missing evidence')`：两种有效页面 parse 成功，缺 `sourceQuote`、时间轴仅一项、带 x 字段失败；旧 Demo 通过。
- [ ] **Verify RED:** `pnpm test src/domain/deck.test.ts`，预期新类型尚不存在而失败。
- [ ] **Implement:** 在 `deck.ts` 增加上述 Zod union 分支，不放坐标、样式或 PPTX 类型。
- [ ] **Verify GREEN:** `pnpm test src/domain/deck.test.ts && pnpm test && pnpm lint && pnpm build` 全绿，还原 `next-env.d.ts`。
- [ ] **Commit:** `git add src/domain/deck.ts src/domain/deck.test.ts && git commit -m "feat: model timeline and data highlight slides"`；推送功能分支。

### Task 2: 新页面的确定性布局和可编辑输出

**Files:** Modify `src/presentation/layout.ts`, `src/presentation/layout.test.ts`, `src/presentation/render.test.ts`.

**Interfaces:** 继续使用 `layoutSlide(slide: SlideSpec, theme: Theme): Element[]`、`renderDeck(deck, theme)` 和 `assertWithinSlide`；来源片段只用于校验，不在 PPTX 中展示；可见日期/数值、事件/标签、takeaway 均为可编辑文本。三主题各有可辨几何构图，fitText 无法容纳则抛 `LayoutOverflowError`。

- [ ] **Test RED:** 在 `layout.test.ts` / `render.test.ts` 分别断言两种页面三主题结果确定、画布内、原文未截断且几何不同；ZIP 有日期/数值、takeaway、`<a:t>`/`<p:sp>`；过密 5 事件抛 `LayoutOverflowError`。
- [ ] **Verify RED:** `pnpm test src/presentation/layout.test.ts src/presentation/render.test.ts`，预期新布局尚不能放置元素而失败。
- [ ] **Implement:** 在现有 Layout 分支放置新页面文本/形状，复用唯一 Renderer 与文字容量检查。
- [ ] **Verify GREEN:** 目标测试及 `pnpm test && pnpm lint && pnpm build` 全绿，还原 `next-env.d.ts`。
- [ ] **Commit:** 提交以上三个文件 `feat: lay out evidence slides in three themes`，推送。

### Task 3: 独立大纲及来源校验

**Files:** Create `src/domain/outline.ts`, `src/domain/outline.test.ts`, `src/server/evidence.ts`, `src/server/evidence.test.ts`.

**Interfaces:** `outlineSchema` / `type Outline`：`{title:string; slides: OutlineSlide[]}`，页数 1–10；每页 `{id:string; role:'opening'|'point'|'evidence'|'summary'; layout:SlideSpec['layout']; title:string; keyMessage:string; sourceQuotes?:string[]}`。标题/观点限 60/110，ID 非空且唯一，第一页 `opening/title`，后续不能再次使用 `title`；`timeline` 需 2–5 个不同的、含明确日期的原文片段，`data_highlight` 需 1 个含完整数值及文字含义的片段；其他页面若 `role='evidence'` 也需至少 1 个原文片段，否则不接受来源字段。`assertEvidence(value: Outline | DeckSpec, source: string): void` 抛 `EvidenceError`：来源片段必须是 topic + sourceText 的原文子串；新页面的 date/value 与编辑后大纲中显式数字必须有**完整数字边界**，不可 `10` 匹配 `110`；没有事实就不接受新页面。

- [ ] **Test RED:** `outline.test.ts` 覆盖重复 ID、移走封面、超长编辑、缺失/重复的新布局依据及普通依据页无原文；`evidence.test.ts` 覆盖 `10` 不匹配 `110`、伪造片段、编辑新增 `2025` 未提供、旧 DeckSpec 正常通过。
- [ ] **Verify RED:** `pnpm test src/domain/outline.test.ts src/server/evidence.test.ts`，预期新模块缺失。
- [ ] **Implement:** 严格 Zod 大纲 schema 与 JS 原生字符串/完整数字 token 比对；不用模型替代人工语义事实审核。
- [ ] **Verify GREEN:** 目标测试及 `pnpm test && pnpm lint && pnpm build` 全绿，还原 `next-env.d.ts`。
- [ ] **Commit:** 提交四个文件 `feat: validate narrative outlines and source facts`，推送。

### Task 4: 一次调用规划大纲

**Files:** Create `src/server/outline.ts`, `src/server/outline.test.ts`.

**Interfaces:** `planOutline(input: GenerationRequest, config: ModelConfig, key: string, fetcher: typeof fetch = fetch): Promise<Outline>`；错误类型 `InvalidOutlineError`。沿用 `callModel`：先校验 JSON/schema、首页和页数，再 `assertEvidence(outline, topic + '\n' + sourceText)`；缺证据/无效输出仅同模型重试一次，鉴权/网络错误直接抛。提示词要求按页数收缩开场→论点→依据（有材料才用）→总结，不强加四页；不用原始资料外的数字/日期。

- [ ] **Test RED:** `outline.test.ts` 假模型返回 1/3/5 页大纲；无材料却返回数据页或非法 JSON 后第二次有效恰调 2 次，连续无效安全失败，401 恰 1 次，密钥不进 prompt。
- [ ] **Verify RED:** `pnpm test src/server/outline.test.ts`，预期尚未有大纲规划模块。
- [ ] **Implement:** 用 Task 3 schema/来源校验与既有 `callModel`，只在无效输出时重试。
- [ ] **Verify GREEN:** 目标测试及 `pnpm test && pnpm lint && pnpm build` 全绿，还原 `next-env.d.ts`。
- [ ] **Commit:** 提交两个文件 `feat: plan source-backed narrative outlines`，推送。

### Task 5: 本机大纲 API

**Files:** Create `src/server/create-outline.ts`, `src/app/api/outline/route.ts`, `src/app/api/outline/route.test.ts`.

**Interfaces:** `createOutlineResponse(body:unknown, filePath:string, fetcher:typeof fetch, env:NodeJS.ProcessEnv):Promise<Response>`：parse `generationRequestSchema` → `activeModel` → `planOutline` → JSON `{outline}`；输入错误 400、无效模型输出 422、模型网络错误 502；仅安全消息。Route 使用 `checkJsonRequest`、`parseJsonRequest`、`settingsFile` 与 `runtime='nodejs'`，不得暴露密钥。

- [ ] **Test RED:** `route.test.ts` 用临时配置/假 fetch 验证大纲 200 JSON，无模型/缺密钥/非法字段在模型调用前 400，错 Origin 403，无效 JSON/401 不泄漏密钥与原文，风格/页数一致。
- [ ] **Verify RED:** `pnpm test src/app/api/outline/route.test.ts`，预期新 Route 尚不存在。
- [ ] **Implement:** 用 `checkJsonRequest` 等已有边界函数装配规划与安全错误映射。
- [ ] **Verify GREEN:** 目标测试及 `pnpm test && pnpm lint && pnpm build` 全绿，还原 `next-env.d.ts`。
- [ ] **Commit:** 提交三个文件 `feat: expose local outline planning API`，推送。

### Task 6: 按已确认大纲生成，保留旧 API

**Files:** Modify `src/server/planner.ts`, `src/server/planner.test.ts`, `src/server/generate.ts`, `src/app/api/generate/route.test.ts`.

**Interfaces:** `planDeck(input:GenerationRequest, config:ModelConfig, key:string, fetcher:typeof fetch=fetch, outline?:Outline)` 新增可选第 5 参数；新请求为 `{input:GenerationRequest, outline:Outline}`，旧请求仍是原扁平 JSON。解析并验证后、`activeModel` 与调用模型前 `assertEvidence(outline, source)`；最终 `deck.slides[i]` 的 layout/title 必须与确认大纲对应，每页可见字段包含完整 `keyMessage`，且新布局的来源/日期/数值再次经 `assertEvidence(deck, source)` 校验；不满足按既有无效输出策略最多再试一次。旧请求同样校验新页面事实；手选风格与回退头保持 M2 语义。

- [ ] **Test RED:** 在 `planner.test.ts` / `route.test.ts` 测试改序/改标题/观点在最终 ZIP 保留；旧标题/缺观点重试一次后 422；来源不匹配、超长字段、无来源数字在模型调用前 400；旧无大纲请求/旧裸 DeckSpec/三主题/Demo 仍可用。
- [ ] **Verify RED:** `pnpm test src/server/planner.test.ts src/app/api/generate/route.test.ts`，预期已确认大纲被拒绝或被忽略。
- [ ] **Implement:** 在新请求严格解析后先校验来源，再由现有 `planDeck`/`renderDeck` 生成；不复制第二套生成器。
- [ ] **Verify GREEN:** 目标测试及 `pnpm test && pnpm lint && pnpm build` 全绿，还原 `next-env.d.ts`。
- [ ] **Commit:** 提交四个文件 `feat: generate editable decks from approved outlines`，推送。

### Task 7: 可编辑大纲网页与验收

**Files:** Create `src/app/outline-editor.tsx`, `src/app/outline-editor.test.tsx`; Modify `src/app/studio.tsx`, `src/app/page.test.tsx`, `README.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`.

**Interfaces:** `OutlineEditor` 展示角色、页标题、核心观点、页面类型与来源片段（只读）；标题/观点原生 input/textarea，非封面页上下移动按钮，首/末禁用；暴露 `outline:Outline, onChange:(outline:Outline)=>void, onRegenerate:()=>void, onConfirm:()=>void, busy:boolean`。`Studio` 保存当前输入与大纲于 React state：先 POST `/api/outline`，编辑/排序后 POST `/api/generate` 的新请求；输入修改使旧大纲失效；重新生成前确认会覆盖编辑。成功才下载；错误时保持大纲；每次可能收费的操作及潜在一次重试均明确提示。

- [ ] **Test RED:** `outline-editor.test.tsx` / `page.test.tsx` SSR 断言标题/观点输入框、首张移动禁用、只读来源片段、Demo 和模型配置仍在。
- [ ] **Verify RED:** `pnpm test src/app/outline-editor.test.tsx src/app/page.test.tsx`，预期编辑组件不存在或新控件缺失。
- [ ] **Implement:** 用原生控件、fetch 和 FeedbackMessage 完成两阶段状态；不加存储或组件库，更新本任务文档。
- [ ] **Verify GREEN:** 目标测试及 `pnpm test && pnpm lint && pnpm build` 全绿，还原 `next-env.d.ts`；本机浏览器拦截两 API，验证编辑/排序请求体、费用与覆盖提醒、旧大纲失效、422 不下载、风格和勾选反馈；离线查七种页面三主题 OOXML，不调用付费模型。
- [ ] **Commit/PR:** 提交本任务文件 `feat: review and edit outlines before download`，推送功能分支；复核全量 diff/远端 SHA/工作区，创建面向 `main` 的 PR，未经用户确认不合并。人工 PPTX 视觉验收与根目录 lint 问题仍单列跟踪。
