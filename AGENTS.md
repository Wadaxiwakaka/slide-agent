# SlideAgent 开发约束

- 先读 `docs/PRODUCT.md`、`docs/ARCHITECTURE.md`、`docs/ROADMAP.md` 和当前 milestone 的 `SPEC.md` / `PLAN.md`。
- M0 已完成；当前 M1 只做本机单用户的多协议 AI Planner → 现有 DeckSpec → Layout → 可编辑 PPTX。详见 `docs/specs/m1-ai-planner/SPEC.md`。不得将无登录、无限额的版本直接公开部署。
- 保持 Web/API、Schema、Theme、Layout、Renderer、Validation 职责分离。DeckSpec 是语义领域模型，不含坐标或 PptxGenJS 类型；布局是确定性的。
- 单一 Next.js + TypeScript 应用，pnpm、Tailwind、Zod、PptxGenJS、Vitest。M1 允许服务端调用 OpenAI 兼容、Anthropic、Gemini API；不要提前添加 Python、服务拆分、数据库、缓存、RAG、MCP 或渲染器插件系统。
- 可自行决定小型拆分、函数命名、测试和 CSS；更换技术栈、修改 DeckSpec 核心模型、扩展 milestone 必须先询问。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
