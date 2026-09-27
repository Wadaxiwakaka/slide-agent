# SlideAgent 开发约束

- 先读 `docs/PRODUCT.md`、`docs/ARCHITECTURE.md`、`docs/ROADMAP.md` 和当前 milestone 的 `SPEC.md` / `PLAN.md`。
- 当前 M0 只做无 AI 的 `DeckSpec → Layout → 可编辑 PPTX`，以测试与 build 验证。
- 保持 Web/API、Schema、Theme、Layout、Renderer、Validation 职责分离。DeckSpec 是语义领域模型，不含坐标或 PptxGenJS 类型；布局是确定性的。
- 单一 Next.js + TypeScript 应用，pnpm、Tailwind、Zod、PptxGenJS、Vitest。不要提前添加 Python、服务拆分、数据库、缓存、LLM、RAG、MCP 或渲染器插件系统。
- 可自行决定小型拆分、函数命名、测试和 CSS；更换技术栈、修改 DeckSpec 核心模型、扩展 milestone 必须先询问。
