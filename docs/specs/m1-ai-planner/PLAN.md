# M1 AI Presentation Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在单用户本机网页配置多协议模型 API，从主题/文本生成经校验的 DeckSpec 并下载可编辑 PPTX。

**Architecture:** 原有 DeckSpec/Layout/Renderer 保持不变。服务端本地存储非密钥配置，按别名读取环境变量；一个 Planner 使用原生 fetch 的三种协议适配器，输出经 Zod 校验后交给 M0 渲染器；网页仅调用同源 API。

**Tech Stack:** 现有 Next.js 16、React 19、TypeScript、Zod 4、PptxGenJS、Vitest、pnpm；无新运行时依赖。

**Spec:** `docs/specs/m1-ai-planner/SPEC.md`

## Global Constraints

- M1 只支持单用户本机；`pnpm dev`、`pnpm start` 默认绑定 `127.0.0.1`，不得当作公网可部署版本。
- 协议仅 `openai`（兼容协议）、`anthropic`、`gemini`；自定义接入仅填写对应协议的 Base URL 与模型 ID；不用 SDK、模型路由、数据库或登录系统。
- 密钥仅来自 `SLIDEAGENT_API_KEY_<ALIAS>`；普通配置保存在忽略 Git 的 `data/model-configs.json`；API/日志/配置文件不得暴露密钥。
- 不修改 `src/domain/deck.ts` 的核心模型或 M0 的五种布局；目标页数 1–10，第一页 `title`，后续只用现有布局。
- 单次模型请求超时 90 秒、响应上限 256 KiB、禁止重定向；无效 JSON/DeckSpec/页数最多同模型重试一次。
- 保留 `/api/demo`；每任务先看测试失败再实现、跑全量测试、单独提交；按用户之前的偏好逐阶段 push `main`，不重写已有未推送提交。

## Review Focus

- 自定义 URL 携带用户名、查询参数、片段或不安全 HTTP 地址：保存之前拒绝（任务 1）。
- 删除当前模型后立即生成：明确报“未选择模型”，不使用陈旧 ID 或静默换模型（任务 4、5）。
- 模型响应大于 256 KiB 或 HTTP 302：终止，且不继续请求重定向地址（任务 2）。
- 返回有效 DeckSpec 但页数不匹配或首页不是 `title`：最多重试一次，然后安全失败（任务 3）。
- 浏览器请求带不存在的密钥别名或模型错误正文回显密钥：响应/日志不泄漏值（任务 1、2、5）。

---

### Task 1: 配置模型、密钥解析与本地存储

**Files:** Create `src/server/model-config.ts`, `src/server/model-config.test.ts`; modify `.gitignore`, `package.json`; create `.env.example`（仅示例变量名，绝不含真实值）。

**Interfaces:** `ModelConfig = { id, name, protocol, baseUrl, modelId, keyAlias }`；`Settings = { activeId: string | null; models: ModelConfig[] }`（磁盘读取时拒绝重复 ID、悬空 activeId）；`modelInputSchema.parse(input)`；`loadSettings(filePath: string): Promise<Settings>`；`saveSettings(filePath: string, settings: Settings): Promise<void>`；`resolveKey(keyAlias: string, env?: NodeJS.ProcessEnv): string`；`settingsFile = <cwd>/data/model-configs.json`。默认 Base URL 样例：OpenAI `/v1`、Anthropic `/v1`、Gemini `/v1beta`；适配器均在此路径后拼各自端点。

- [ ] **Test RED:** 写合法 OpenAI/Anthropic/Gemini 与自定义 HTTPS URL、HTTP 仅 loopback、禁止 userinfo/query/fragment、`keyAlias='WORK'` 可读但任意 env 名不可读、密钥不入文件、空文件返回空配置、保存后重载相等及无效磁盘 JSON 拒绝的测试；`pnpm test src/server/model-config.test.ts` 应因模块不存在失败。
- [ ] **Implement:** Zod 严格字段验证（`name` 1–60，`modelId` 1–120，`keyAlias` 匹配 `[A-Z][A-Z0-9_]*`，ID 由 `crypto.randomUUID()` 生成）、URL 校验；`fs/promises` 原子临时文件 + rename 保存，缺文件视为空配置；只允许前缀密钥名；`data/` 加 `.gitignore`，脚本绑定本机地址。
- [ ] **Verify:** `pnpm test && pnpm lint && pnpm build` 全绿；提交 `feat: persist local model configurations`，push。

### Task 2: 三协议请求与可控网络错误

**Files:** Create `src/server/model-api.ts`, `src/server/model-api.test.ts`.

**Interfaces:** `callModel(config: ModelConfig, key: string, prompt: string, fetcher: typeof fetch = fetch): Promise<string>`；安全错误只含类别与 HTTP 状态，不回传原始响应/密钥。`openai` 追加 `chat/completions` 并取 `choices[0].message.content`；`anthropic` 追加 `messages` 并合并 text blocks；`gemini` 追加 `models/{encodeURIComponent(modelId)}:generateContent` 并取 candidate text parts。Anthropic 固定 `anthropic-version: 2023-06-01`、`max_tokens: 8192`；Gemini 使用 `x-goog-api-key` header；所有请求 `redirect: 'error'`。

- [ ] **Test RED:** 用假 fetch 返回真实形状的三种响应，分别断言 URL、认证头和抽取文本；覆盖 302、401（响应体包含密钥也不能回显）、429、无内容、过大流式响应及 AbortError；`pnpm test src/server/model-api.test.ts` 因模块缺失失败。
- [ ] **Implement:** 使用原生 fetch、`AbortSignal.timeout(90_000)`、流式读取累计最多 256 KiB；错误按连接/超时/鉴权/配额/无效响应分类，绝不输出 provider 原文；不加 SDK。
- [ ] **Verify:** `pnpm test && pnpm lint && pnpm build`；提交 `feat: call three model API protocols`，push。

### Task 3: 请求校验与 AI Planner

**Files:** Create `src/server/planner.ts`, `src/server/planner.test.ts`.

**Interfaces:** `generationRequestSchema.parse(input)` → `{ topic: string; sourceText: string; audience: string; purpose: string; slideCount: number }`（至少主题或材料非空，限长见 SPEC）；`planDeck(input: GenerationRequest, config: ModelConfig, key: string, fetcher?: typeof fetch): Promise<DeckSpec>` 消费任务 2 `callModel`。输出 JSON 必须满足 `deckSchema`、实际页数和首页 `title`。

- [ ] **Test RED:** 验证缺主题与材料、超长文本、页数 0/11 拒绝；假 fetch 返回有效 3 页 JSON → 保持语义内容；先返回非法 JSON/错误页数/错误首页再返回合法 JSON → 恰调用两次；连续无效 → 失败；网络错误 → 不重试；`pnpm test src/server/planner.test.ts` 失败。
- [ ] **Implement:** Prompt 包含请求值、现有 `deckSchema` 对应的结构约束（优先由 Zod 导出 JSON Schema）、五种 layout 及无坐标/仅 JSON 指令；只有输出校验失败才对原模型再试一次，失败提示可能收费两次。
- [ ] **Verify:** `pnpm test && pnpm lint && pnpm build`；提交 `feat: plan validated decks from user input`，push。

### Task 4: 本地配置管理 API 与连接测试

**Files:** Create `src/server/manage-models.ts`, `src/server/manage-models.test.ts`, `src/app/api/models/route.ts`, `src/app/api/models/test/route.ts`.

**Interfaces:** `listModels(filePath: string, env?: NodeJS.ProcessEnv)` 返回 `{ activeId, models: (ModelConfig & { hasKey: boolean })[] }`；`createModel(filePath, input)`、`editModel(filePath, id, input)`、`removeModel(filePath, id)`、`selectModel(filePath, id: string | null)` 使用任务 1 存储；路由 `GET/POST/PUT/DELETE /api/models` 分别列出、新建、编辑、删除（PUT 请求 `{id, config}`，DELETE 请求 `{id}`），`PATCH /api/models` 用 `{activeId}` 选择或取消选择；`POST /api/models/test` 测试当前选中模型并提示可能产生成本。无选择或无密钥返回安全错误。

- [ ] **Test RED:** 临时目录中的真实文件测试 CRUD、重启可读、删除当前后 `activeId=null`、不能选未知 ID、列表含 `hasKey` 而从不含密钥、连接测试调用任务 2 的已选模型而非其他模型；`pnpm test src/server/manage-models.test.ts` 失败。
- [ ] **Implement:** 管理函数负责校验与文件读写；路由只解析请求、映射安全错误和 JSON，不允许客户端指定存储路径、密钥值或任意环境变量名；连接测试发最短回复请求。
- [ ] **Verify:** `pnpm test && pnpm lint && pnpm build`；提交 `feat: manage local models and test connections`，push。

### Task 5: 生成 API 与可编辑 PPTX

**Files:** Create `src/server/generate.ts`, `src/app/api/generate/route.ts`, `src/app/api/generate/route.test.ts`.

**Interfaces:** `createGenerateResponse(body: unknown, filePath: string, fetcher: typeof fetch, env: NodeJS.ProcessEnv): Promise<Response>` 消费任务 4 当前模型、任务 1 密钥、任务 3 `planDeck`、已有 `renderDeck`；`POST /api/generate` 只解析 JSON 并调用它。成功返回 `slide-agent-generated.pptx` 与 PPTX MIME；失败只返回安全 JSON 错误。

- [ ] **Test RED:** 用临时配置与假模型 HTTP 响应调用真实 `createGenerateResponse`，验证 3 页 PPTX ZIP 有 3 个 `ppt/slides/slideN.xml` 且含 `<a:t>`/`<p:sp>`；无模型、缺密钥、错误请求、模型拒绝、重复无效输出时不返回 PPTX/密钥；直接 `POST` 无效 JSON 验证 HTTP 400；`pnpm test src/app/api/generate/route.test.ts` 因模块不存在失败。
- [ ] **Implement:** 服务器函数组合已有层；路由仅解析请求、调用函数，不在 UI/路由内复制 prompt 或 PPTX 逻辑。
- [ ] **Verify:** `pnpm test && pnpm lint && pnpm build`；提交 `feat: generate editable pptx with selected model`，push。

### Task 6: 网页交互与真实启动验收

**Files:** Modify `src/app/page.tsx`, `src/app/layout.tsx`, `README.md`, `docs/ARCHITECTURE.md`, `docs/PRODUCT.md`; create `src/app/model-settings.tsx`, `src/app/generate-form.tsx`（仅在两部分交互需要分拆时）； tests in `src/app/generate-form.test.tsx` if using React server rendering.

**Interfaces:** 使用 `/api/models`、`/api/models/test`、`/api/generate`；M0 `/api/demo` 保留。配置面板完整 CRUD/切换与密钥状态；生成表单字段/反馈/下载，提示测试连接可能收费；`.env.example` 写配置用法。

- [ ] **Test RED:** 新增可在 Node 运行的表单渲染测试（默认受众/目的、主题/材料、页数和禁用状态）或先验证 `GET /` HTML 中这些控件缺失；运行目标测试看到失败。
- [ ] **Implement:** 最少 React client state 与 fetch；字段校验提示和加载/错误状态；Blob 下载生成结果，失败 JSON 不下载；保留 Demo 按钮；文档说明本机配置、三种 URL 示例、密钥、潜在费用与**不可直接公开部署**。
- [ ] **Verify:** `pnpm test && pnpm lint && pnpm build`；本机启动 `pnpm dev` 并验证 127.0.0.1 页面和 CRUD/缺密钥错误、示例下载；有用户自备有效密钥才测试付费调用，绝不自动消耗额度。提交 `feat: configure models and generate decks in web UI`，push；核对远端 SHA 和工作区状态，停在 M1。
