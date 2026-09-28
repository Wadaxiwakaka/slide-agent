# 架构

采用 Next.js + TypeScript 的 modular monolith。Web UI 只触发下载；Application/API 负责装配；领域层用 Zod 定义独立于 PptxGenJS 的 DeckSpec/SlideSpec；Theme 提供页面尺寸、颜色、排版和间距；Layout Engine 把语义内容映射为有边界的文本和形状；PptxRenderer 唯一负责 PPTX 写入；Validation 检查布局元素位置。

```text
M0 demoDeck ───────────────────────────┐
用户输入 → AI Planner → Zod DeckSpec ─┴→ Theme → deterministic Layout → 几何检查 → PptxGenJS → PPTX → HTTP 下载
                     ↑
服务端模型配置 + 环境变量密钥 → 原生 fetch（OpenAI 兼容 / Anthropic / Gemini）
```

M1 的 Planner 只输出语义内容和五种已有布局的选择；DeckSpec 不含绝对 x/y/w/h 或厂商 API 类型。模型普通配置位于本机 Git 忽略的 JSON 文件，密钥仅从服务端环境变量取得。单 Node 进程、只监听 `127.0.0.1`；没有登录、额度或公网 SSRF 防护，不能公开部署。幻灯片预览在 M3。未来同一 DeckSpec 可换 Theme 而无需重新规划；当前只保留一个 PPTX 渲染器，不建立工厂、插件或多服务接口。
