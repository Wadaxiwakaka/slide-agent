# 架构

采用 Next.js + TypeScript 的 modular monolith。Web UI 只触发下载；Application/API 负责装配；领域层用 Zod 定义独立于 PptxGenJS 的 DeckSpec/SlideSpec；Theme 提供页面尺寸、颜色、排版和间距；Layout Engine 把语义内容映射为有边界的文本和形状；PptxRenderer 唯一负责 PPTX 写入；Validation 检查布局元素位置。

```text
M0 demoDeck ────────────────────────────────────┐
用户输入 → AI Planner → Zod DeckSpec ──────────┴→ Theme → deterministic Layout → 几何/文字检查 → PptxGenJS → PPTX → HTTP 下载
     │               └→ 可选风格建议 ─┐               ↑
     └→ 自动/手选视觉风格 ────────────┴→ 风格决策 ───┘
服务端模型配置 + 环境变量密钥 → 原生 fetch（OpenAI 兼容 / Anthropic / Gemini）
```

M2 的 Planner 在原有一次规划调用中建议视觉风格，仍只输出语义内容和五种已有布局的选择；手选覆盖建议，自动无有效建议则回退经典蓝。风格 ID 独立于 DeckSpec，布局按 Theme 确定性生成并检查几何与密集文本；DeckSpec 不含绝对 x/y/w/h 或厂商 API 类型。响应头 `X-SlideAgent-Style` 报告实际风格，自动回退另有 `X-SlideAgent-Style-Fallback: 1`。模型普通配置位于本机 Git 忽略的 JSON 文件，密钥仅从服务端环境变量取得。单 Node 进程、只监听 `127.0.0.1`；没有登录、额度或公网 SSRF 防护，不能公开部署。幻灯片预览在 M3；生成后换肤后续再做。当前只保留一个 PPTX 渲染器，不建立工厂、插件或多服务接口。
