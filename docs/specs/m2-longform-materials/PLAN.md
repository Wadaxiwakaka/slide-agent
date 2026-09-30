# Long-Form Materials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从粘贴的长材料生成最多 100 页、可恢复、内容更详细且来源可追溯的可编辑 PPTX，同时保持短文稿原路径。

**Architecture:** 独立的长文稿请求/任务 API 在本机 `data/longform-jobs/` 原子保存批次状态；模型先按材料分块规划全篇与可编辑大纲，再按确认的大纲每批最多 8 张原页生成。事实校验、Theme、确定性 Layout 与唯一 Renderer 复用 M2；正文超容量时只按语义边界插续页。旧 `/api/outline`、`/api/generate`、Demo 不改请求边界。

**Tech Stack:** Next.js 16 + React 19 + TypeScript + Zod 4 + PptxGenJS + Vitest + pnpm，Node 内置 `fs`/`crypto`，现有 OpenAI 兼容/Anthropic/Gemini 适配器；不加运行时依赖、数据库、RAG 或另一个 PPTX 渲染器。

**Spec:** `docs/specs/m2-longform-materials/SPEC.md`

## Global Constraints

- 本分支基于尚待用户确认合并的 M2 内容 PR #3；任何 PR 均不得自行合并。完成实现前核对依赖；功能 PR 最终面向 `main`，待 PR #3 经用户确认合并后再创建，避免夹带旧差异。
- 用户可选 1–100 页、简洁/详细，默认 5 页简洁；长材料最多 **200,000 UTF-16 字符**且新请求 JSON 最多 **1 MiB**；旧 API 仍限 1–10 页、20,000 字符。100 页包含大纲叙事页与正文续页，超限不下载。
- 材料模式要求原文；没有足够材料时给出可支持页数及理由、经用户明确接受后才进入生成；仅主题联网研究、图片上传、PDF/DOCX、M3 预览均在独立交付。
- 短篇简洁保留原两阶段调用；详细/长篇才分块、逐批；模型单次 90 秒、响应 256 KiB，无效内容每批至多同模型重试一次，401/429/网络不自动重试；调用前提示预计次数，不能虚报金额。
- 原文数值/日期及 `sourceQuote` 仍须来源验证；摘要不是事实来源。全篇插页必须在大纲供用户确认；仅排版续页可生成时紧邻原页插入。确认的原页相对顺序、原标题、完整核心观点不得丢失。内容不能放进 ≥16pt 正文时拆页或报错，绝不截断/静默缩小。
- 本机快照仅为断点恢复，浏览器只持久化随机任务 ID；服务端快照不得含密钥，用户可删除，最后活动 **7 天**后由服务启动/请求时清理。不提供长期项目库；断线时进行中的那次模型调用无法保证免费重试。旧版单用户本机限制不变，不能公开部署。
- 每任务 RED → GREEN，运行目标测试及 `pnpm test && pnpm lint && pnpm build`，还原构建可能改写的 `next-env.d.ts`；仅假模型，绝不调用付费模型。写 Next route/client 代码前读本工作区 `node_modules/next/dist/docs/` 对应 route 与 use-client 指南。

## File map / interface contracts

- `src/domain/longform.ts`：`longformRequestSchema`、`LongformRequest`、`densitySchema`；现有 `outline.ts` / `deck.ts` 上限调整，不改变七种布局字段。
- `src/server/longform/source.ts`：`splitSource(source, maxChars?)`、`summarizeChunk(chunk, config, key, fetcher)`、`mergeDigests(digests, config, key, fetcher)`；返回有原文区间的 `SourceChunk`、经校验的 `SourceDigest`。
- `src/server/longform/outline.ts`：`planStory(input, digests, config, key, fetcher)` 返回 `StoryPlan`（`supportedPages`、不足时的 `reason`、各节页额/来源区间）；`planOutlineBatch(storySection, batchSize, input, digests, preceding, config, key, fetcher)` 返回最多 8 张 `Outline['slides'][number]`；最终 `assembleOutline` 校验首页、唯一 ID、顺序与原文。
- `src/presentation/continuation.ts`：`paginateDetailedSlide(slide, theme, keyMessage): SlideSpec[]`；只在安全语义边界拆分，不能安全拆分则抛 `LayoutOverflowError`。现有 `layoutSlide` / `renderDeck` 新增可选“详细正文不低于 16pt、不用 PPTX 自动 shrink”的选项，旧调用行为不变。
- `src/server/longform/content.ts`：`planDeckBatch(input, outlinePages, sourceExcerpt, fullSource, config, key, fetcher)` 返回 `{pages:{anchorId, continuationIndex, slide}[],suggestedStyle}`；每原页恰一锚点、续页紧跟，复用 `callModel`/`assertEvidence`，不套用旧 `planDeck` 的“每批必须封面”断言。
- `src/server/longform/store.ts`：`createJob/readJob/saveJob/deleteJob/expireJobs`，严格校验随机任务 ID 与快照 schema、原子覆盖；`LongformJob` 包含请求、配置 ID、摘要/大纲/已完成批次、版本与阶段，不含密钥。
- `src/server/longform/job.ts`：`stepJob/confirmJobOutline/downloadJob`；每步推进一个逻辑批次（无效内容最多额外重试一次），只保存已验证批次；完成后用现有 `renderDeck` 一次输出 PPTX。
- `src/app/api/longform/jobs/**/route.ts`：创建、查询、删除、单步、确认、下载的本机 API；`src/app/longform-workflow.tsx` 与 `src/app/studio.tsx`：表单选择及数值进度/恢复/安全下载；复用 `outline-editor.tsx` 并调整长文稿持久化说明。

## Review Focus

1. 200,000 字符以内但 UTF-8 JSON 超过 1 MiB：创建任务前拒绝且不调用模型（Task 8 测试）。
2. 单段极长文本或块边界有 emoji/日期：分块后拼接逐 UTF-16 单元等于原文，任何块不超预算（Task 2 测试）。
3. 两个标签页同时对同一任务点继续：仅一个请求有权发起付费调用，另一个收到冲突且检查点不损坏（Task 6/7/8 测试）。
4. 已确认 99 页再产生两张续页：最终拒绝 101 页并保留检查点，不下载前 99 页（Task 7/8 测试）。
5. 页面里从原文 `110` 冒出 `10`，或编辑确认后模型偷换观点：该批拒绝/只重试一次，不写完成批次（Task 5 测试）。

---

### Task 1: 长文稿请求与语义上限

**Files:** Create `src/domain/longform.ts`, `src/domain/longform.test.ts`; modify `src/domain/outline.ts`, `src/domain/outline.test.ts`, `src/domain/deck.ts`, `src/domain/deck.test.ts`.
**Interfaces:** `longformRequestSchema` 接受 `{topic,sourceText,audience,purpose,slideCount,styleChoice,density:'concise'|'detailed'}`，原文非空、`slideCount` 1–100、原文最多 200,000 UTF-16 单元，沿用旧字段默认值；`LongformRequest=z.infer<typeof longformRequestSchema>`。
- [ ] **RED test:** `longform.test.ts` 断言 100 页+200,000 字符有效、101 页/空原文/200,001 字符无效；deck 100 有效/101 无效、outline 100 有效/101 无效；`generationRequestSchema` 11 页与 20,001 字符继续失败，旧 Demo 通过。
- [ ] **RED check:** `pnpm test src/domain/longform.test.ts src/domain/outline.test.ts src/domain/deck.test.ts` → 新断言失败。
- [ ] **Implement:** 新严格 schema；仅调高 Outline/DeckSpec max，不更改现有页类型及旧请求 schema。
- [ ] **GREEN check:** 重跑目标测试和 `pnpm test && pnpm lint && pnpm build` → 全绿；还原 `next-env.d.ts`，`git diff --check` 通过。
- [ ] **Commit/push:** 仅提交本任务文件 `feat: validate long-form inputs and 100-page outlines`，推送分支。

### Task 2: 有界材料分块与摘要

**Files:** Create `src/server/longform/source.ts`, `src/server/longform/source.test.ts`.
**Interfaces:** `type SourceChunk={start:number;end:number;text:string}`；`splitSource(source:string,maxChars=5_000):SourceChunk[]` 按标题/段落边界优先且不在代理对中间拆；`type SourceDigest={summary:string;sourceRange:[number,number]}`；`summarizeChunk(chunk:SourceChunk,config:ModelConfig,key:string,fetcher?:typeof fetch):Promise<SourceDigest>` 与 `mergeDigests(digests:SourceDigest[],config:ModelConfig,key:string,fetcher?:typeof fetch):Promise<SourceDigest>` 每次处理一个有界层级批次、无效模型内容至多重试一次，保留覆盖的原文区间，不把摘要伪装成引文。
- [ ] **RED test:** 长单段、段落及代理对边界测试 `chunks.map(c=>c.text).join('')===source`、每块长度 `<=5000`、区间连续；假三协议响应验证摘要严格 schema、原文/密钥不进错误，坏 JSON 同模型重试一次、401 只调用一次；二层汇总输入不会带整篇原文。
- [ ] **RED check:** `pnpm test src/server/longform/source.test.ts` → 缺少函数/行为失败。
- [ ] **Implement:** 使用现有 `callModel`、严格 Zod 摘要输出与有界上下文；若模型不支持所需上下文，安全报错而非发送无限大 prompt。
- [ ] **GREEN check:** 重跑目标测试和 `pnpm test && pnpm lint && pnpm build` → 全绿，还原构建文件。
- [ ] **Commit/push:** 提交本任务文件 `feat: chunk and summarize source material` 并推送。

### Task 3: 全篇故事线与可编辑大纲批次

**Files:** Create `src/server/longform/outline.ts`, `src/server/longform/outline.test.ts`.
**Interfaces:** `type StoryPlan={supportedPages:number;reason?:string;sections:{id:string;theme:string;sourceRanges:[number,number][];pageBudget:number}[]}`；`planStory(input:LongformRequest,digests:SourceDigest[],config:ModelConfig,key:string,fetcher?:typeof fetch):Promise<StoryPlan>`；`planOutlineBatch(section:StoryPlan['sections'][number],batchSize:number,input:LongformRequest,digests:SourceDigest[],preceding:Outline['slides'],config:ModelConfig,key:string,fetcher?:typeof fetch):Promise<Outline['slides']>`；`assembleOutline(input:LongformRequest,batches:Outline['slides'][],supportedPages:number,source:string):Outline`，先固定封面、按节/当前批顺序赋唯一稳定 ID，完整 `assertEvidence`。
- [ ] **RED test:** 假模型材料仅支持 18 页而请求 30 页返回 `supportedPages=18` 和非空理由；各节预算和=18，8 页以内逐批返回封面/后续角色、三批拼成 18 页；跨批重复 ID/观点、无原文 quote、凭空日期/数字、大纲第 101 页被拒，原文含 110 不支持 10；模拟 100 页分批无一次百页模型输出。
- [ ] **RED check:** `pnpm test src/server/longform/outline.test.ts` → 未实现失败。
- [ ] **Implement:** 分层摘要供故事线使用，逐节最多 8 页调用现有模型适配器；无效响应仅该批重试一次，鉴权/限流不重试；模型提出不足页数时必须解释，不能自动按原目标凑数。近义语义重复仍由用户审阅，不宣称自动事实核查。
- [ ] **GREEN check:** 重跑目标测试和 `pnpm test && pnpm lint && pnpm build` → 全绿，还原构建文件。
- [ ] **Commit/push:** 提交本任务文件 `feat: plan source-backed long-form outlines in batches` 并推送。

### Task 4: 可读正文与无损续页

**Files:** Create `src/presentation/continuation.ts`, `src/presentation/continuation.test.ts`; modify `src/presentation/layout.ts`, `src/presentation/layout.test.ts`, `src/presentation/render.ts`, `src/presentation/render.test.ts`.
**Interfaces:** `paginateDetailedSlide(slide:SlideSpec,theme:Theme,keyMessage:string):SlideSpec[]`；`layoutSlide(slide,theme,options?:{minBodySize?:number})`、`renderDeck(deck,theme,options?:{minBodySize?:number;disableAutoShrink?:boolean})`，长文稿详细模式传 `{minBodySize:16,disableAutoShrink:true}`；旧调用默认参数保持原输出。
- [ ] **RED test:** title_body / process / comparison 超密内容按整条/整句分成紧邻续页，全部可见原文恰好出现而非截断，锚点仍含完整 keyMessage，正文元素字号≥16；不能无损拆的卡片/数据页安全失败；三主题位置/容量校验和 OOXML 不含详细模式自动缩字设置；不把续页移到无关原页之前。
- [ ] **RED check:** `pnpm test src/presentation/continuation.test.ts src/presentation/layout.test.ts src/presentation/render.test.ts` → 新需求失败。
- [ ] **Implement:** 复用 `layoutSlide` 容量检查和唯一 Renderer，内部只拆语义结构（不截字符串），标题续页遵守 60 字限制；不可拆则 `LayoutOverflowError`，全局数量由 Task 7 守卫。测试中使用 ZIP OOXML 检查可编辑文字/形状。
- [ ] **GREEN check:** 重跑目标测试和 `pnpm test && pnpm lint && pnpm build` → 全绿，还原构建文件。
- [ ] **Commit/push:** 提交本任务文件 `feat: paginate dense editable slides without shrinking` 并推送。

### Task 5: 依据已确认大纲生成模型批次

**Files:** Create `src/server/longform/content.ts`, `src/server/longform/content.test.ts`; if needed extract shared approved-page text validator from `src/server/planner.ts` without changing legacy behavior.
**Interfaces:** `type AnchoredPage={anchorId:string;continuationIndex:number;slide:SlideSpec}`；`planDeckBatch(input:LongformRequest,outlinePages:Outline['slides'],sourceExcerpt:string,fullSource:string,config:ModelConfig,key:string,fetcher?:typeof fetch):Promise<{pages:AnchoredPage[];suggestedStyle:StyleId|null}>`；单批 1–8 张原页，分别验证 `layout/title/keyMessage`，`assertEvidence` 以完整原文为准，并经 Task 4 分页。
- [ ] **RED test:** 模型顺序/标题/观点错误均恰好重试一次后安全拒绝；跨批首张非封面也有效；用户将原大纲页 A/B 交换后输出仍为 B/A；普通页捏造 `10` 而材料只有 `110`、事实页伪造 quote 均拒，坏 JSON 不露原文，401/429 不自动重试；分批返回原页+续页映射且锚点内容可见。
- [ ] **RED check:** `pnpm test src/server/longform/content.test.ts src/server/planner.test.ts` → 新需求失败、旧测试仍通过。
- [ ] **Implement:** 每次 prompt 只带当前材料片段、已确认的这批原页和邻接上下文；复用现有 `callModel`、`deckSchema`、`assertEvidence` 和分页器，不使用 `planDeck` 对非首页批次的首页/页数约束。
- [ ] **GREEN check:** 重跑目标测试和 `pnpm test && pnpm lint && pnpm build` → 全绿，还原构建文件。
- [ ] **Commit/push:** 提交本任务文件 `feat: generate validated anchored content batches` 并推送。

### Task 6: 本机快照、恢复与并发安全

**Files:** Create `src/server/longform/store.ts`, `src/server/longform/store.test.ts`.
**Interfaces:** `type LongformJob={id:string;input:LongformRequest;modelConfigId:string;stage:'summarize'|'story'|'outline'|'review'|'content'|'ready';cursor:number;summaryLevel:number;chunks:SourceChunk[];digests:SourceDigest[];mergedDigests:SourceDigest[];story?:StoryPlan;outlineParts:Outline['slides'][];outline?:Outline;acceptedPages?:number;completed:AnchoredPage[][];suggestedStyle?:StyleId|null;revision:string;error?:string;updatedAt:number}`；`createJob(root:string,input:LongformRequest,modelConfigId:string,now?:number):Promise<LongformJob>`、`readJob(root,id):Promise<LongformJob>`、`saveJob(root,job):Promise<void>`、`deleteJob(root,id):Promise<void>`、`expireJobs(root,now?):Promise<void>`、`withJobLock<T>(id,fn:()=>Promise<T>):Promise<T>`；ID 用 `crypto.randomUUID()`，校验 UUID 再拼本机路径；快照 Zod 解析后才使用。
- [ ] **RED test:** 临时目录模拟写入/重启重新读取、只保存校验后的批次、同任务两次并发只执行一回、不同任务可并行；材料/大纲版本变化使 SHA-256 `revision` 失配；缺失/损坏快照安全失败；`../` 与无效 UUID 不得越权；7 天未活动删除、有活动保留、显式删除不可恢复；快照文件不含测试 API key，材料不进入错误消息。
- [ ] **RED check:** `pnpm test src/server/longform/store.test.ts` → 缺少实现失败。
- [ ] **Implement:** `data/longform-jobs/` 用原子写临时文件+重命名，单 Node 进程同 ID 互斥；不保存密钥，服务启动及请求时清过期任务；安全路径、损坏文件不会触发模型调用。该服务只供单机，不做分布式锁/数据库。
- [ ] **GREEN check:** 重跑目标测试和 `pnpm test && pnpm lint && pnpm build` → 全绿，还原构建文件。
- [ ] **Commit/push:** 提交本任务文件 `feat: checkpoint local long-form jobs for resume` 并推送。

### Task 7: 单步任务编排与整稿安全交付

**Files:** Create `src/server/longform/job.ts`, `src/server/longform/job.test.ts`.
**Interfaces:** `type JobDeps={root:string;settingsFile:string;env:NodeJS.ProcessEnv;fetcher:typeof fetch;now?:()=>number}`；`type JobStatus={id:string;stage:LongformJob['stage'];completed:number;total:number;outline?:Outline;supportedPages?:number;reason?:string;actualSlides?:number;error?:string}`；`stepJob(id:string,deps:JobDeps):Promise<JobStatus>` 每步推进一个逻辑批次（无效内容可同模型重试一次）；摘要层完成后按顺序以每组最多 8 个 digest 合并到 `mergedDigests`，换层清空该缓冲直至剩余不超过 8 个才规划故事线；`confirmJobOutline(id:string,outline:Outline,acceptShortfall:boolean,deps:JobDeps):Promise<JobStatus>`；`downloadJob(id:string,deps:JobDeps):Promise<Response>` 仅 `ready`。
- [ ] **RED test:** 20/100 页按摘要→故事→大纲→内容阶段逐步推进且已完成批次只读检查点；请求 30 而仅支持 18 页时未明确接受不能确认；更换输入/大纲版本/模型配置 ID 拒绝复用；第 N 批失败并重启后仅重试第 N 批；99+2 续页拒绝 101 页并保留快照，100 页成功只有一份可编辑 PPTX。
- [ ] **RED test:** 不完整任务 `downloadJob` 不返回 PPTX；同 ID 并发仅触发一次模型请求；手选风格优先，自动只采用首批建议、无效时经典蓝回退；模型错误不写完成批次，安全错误不含密钥/原文。
- [ ] **RED check:** `pnpm test src/server/longform/job.test.ts` → 新需求失败。
- [ ] **Implement:** 复用 Task 2–6 与 `activeModel`/`renderDeck`；在每个成功步骤原子保存，快照仅 pin 配置 ID、密钥每步重新读取；确认时核对版本及不足页数，最后检查原页次序、全局事实与总页数，失败不允许部分下载。
- [ ] **GREEN check:** 重跑目标测试和 `pnpm test && pnpm lint && pnpm build` → 全绿，还原构建文件。
- [ ] **Commit/push:** 提交本任务文件 `feat: orchestrate recoverable long-form jobs` 并推送。

### Task 8: 本机任务 API 与请求安全

**Files:** Create `src/server/longform/http.ts`, `src/app/api/longform/jobs/route.ts`, `src/app/api/longform/jobs/[id]/route.ts`, `src/app/api/longform/jobs/[id]/step/route.ts`, `src/app/api/longform/jobs/[id]/outline/route.ts`, `src/app/api/longform/jobs/[id]/download/route.ts`, `src/app/api/longform/jobs/route.test.ts`; modify `src/server/manage-models.ts` only if the same local Host/Origin validation needs reuse on GET/DELETE.
**Interfaces:** `readBoundedJson(request:Request,limit=1_048_576):Promise<unknown>` counts stream bytes before parsing; POST `/api/longform/jobs` 创建任务但不调用模型，GET/DELETE `.../jobs/[id]` 查看/删除，POST `.../[id]/step`、`.../[id]/outline`、`.../[id]/download` 依 Task 7 状态流转；GET 状态返回 `{status:JobStatus,input:LongformRequest}` 供本机页面恢复表单（错误响应不含原文）；所有响应 `Cache-Control:no-store`。
- [ ] **RED test:** 200,000 UTF-16 字内但 JSON 超过 1 MiB、缺/伪造 Content-Length 均 413 且 0 模型调用；非本机 Host/Origin 403，非法 Content-Type 415，坏 JSON/损坏任务安全报错；恶意 `../` ID 不访问其他目录；GET/下载 no-store，DELETE 后不可恢复，过期任务在下一次请求时清理；无密钥/材料出现在错误消息。
- [ ] **RED test (compat):** 两个标签并发 `step` 只有一个触发模型、另一请求冲突；不同任务可并行；旧 `/api/outline`、`/api/generate`、Demo 与三风格自动回退测试仍通过，失败不下载 ZIP。
- [ ] **RED check:** `pnpm test src/app/api/longform/jobs/route.test.ts` → 新 API 不存在而失败。
- [ ] **Implement:** Route 仅装配 Task 6–7 和既有本机同源限制；流式限体积且不信任 Content-Length，URL ID 严格校验；GET/POST/DELETE 均限定本机，错误安全、无后台自动付费调用。
- [ ] **GREEN check:** 重跑目标测试和 `pnpm test && pnpm lint && pnpm build` → 全绿，还原构建文件。
- [ ] **Commit/push:** 提交本任务文件 `feat: expose bounded local long-form job API` 并推送。

### Task 9: 网页模式选择、恢复和交付验证

**Files:** Create `src/app/longform-workflow.tsx`, `src/app/longform-workflow.test.tsx`; modify `src/app/studio.tsx`, `src/app/outline-editor.tsx`, `src/app/page.test.tsx`, `README.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`.
**Interfaces:** 原表单新增“简洁/详细”与目标 1–100；简洁≤10 且材料≤20,000 字仍走旧流程，其他材料任务走 `/api/longform/jobs`；浏览器 `localStorage` **只存随机任务 ID**。恢复前先 GET 任务状态，不自动启动付费请求；用户主动继续，阶段和 X/Y 批次进度、预计调用次数/重试费用提示、确认不足页数、取消/删除、成功下载与实际页数可见；取消仅停止后续批次，正在进行的调用可能仍计费，已完成批次保留供恢复；大纲页仍可编辑排序。
- [ ] **RED test:** SSR/交互断言模式与 100 上限、长材料正文与大纲恢复、18/30 页需用户明确接受、仅主题且选择详细/长稿时提示先提供材料且不调用模型、刷新后旧批次未重跑、取消后不继续发起下一批；跨输入变化禁用过期大纲、重新规划覆盖警告、失败无 blob 下载、重复点击不双付费；短篇仍能下载、规划/正文调用批次数预估与可能重试费用提示可见，模型配置与红错/绿勾反馈保留。
- [ ] **RED check:** `pnpm test src/app/longform-workflow.test.tsx src/app/page.test.tsx` → 新交互失败。
- [ ] **Implement:** 仅新增独立长流程 UI 并接到 Studio，保留现有 OutlineEditor 的默认短稿文案；大纲列表在 100 页仍可定位与移动非封面页，显示新增叙事页/依据；原文只在本机快照中，不写浏览器本地存储。更新四份文档的实际能力/路线图（旧 M2 人工检查已由用户完成）。
- [ ] **GREEN check:** 重跑目标测试和 `pnpm test && pnpm lint && pnpm build` → 全绿，还原构建文件。
- [ ] **Browser/manual check:** 假模型依次验收短稿、100 页、失败刷新续跑/删除/下载，人工抽查三主题密集可编辑 PPTX；不调用付费模型。
- [ ] **Commit/push:** 提交本任务文件 `feat: review and resume long-form decks in studio` 并推送。
- [ ] **Whole-branch review:** 对照 SPEC 审查全量 diff、数据/密钥泄露、100 页 ZIP 与实际页数；确认远端 SHA、工作区干净、PR #3 经用户确认已合并后，创建面向 `main` 的独立 PR；**不自行合并**。
