# 架构

采用 Next.js + TypeScript 的 modular monolith。Web UI 只触发下载；Application/API 负责装配；领域层用 Zod 定义独立于 PptxGenJS 的 DeckSpec/SlideSpec；Theme 提供页面尺寸、颜色、排版和间距；Layout Engine 把语义内容映射为有边界的文本和形状；PptxRenderer 唯一负责 PPTX 写入；Validation 检查布局元素位置。

```text
hard-coded DeckSpec → Zod 校验 → Theme → deterministic Layout → 几何检查 → PptxGenJS → PPTX → HTTP 下载
```

M0 不调用 LLM，也不提供幻灯片预览（预览在 M3）。DeckSpec 仅包含内容和布局意图，不允许绝对 x/y/w/h；布局输出带坐标的中间元素，渲染器只消费这些元素。将来同一 DeckSpec 可以换 Theme 而无需重新规划。当前只有一个 PPTX 渲染器，不建立工厂、插件或多服务接口。
