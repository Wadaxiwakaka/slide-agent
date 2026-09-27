# M0：PPT Rendering Engine 规格

## 目标

不用 LLM，从硬编码的五页“人工智能与时间序列预测” DeckSpec 生成 PowerPoint 可打开、文本和形状可编辑的 16:9 PPTX。最小首页有下载按钮；不做幻灯片预览（M3）。

## 契约

DeckSpec 用 TypeScript + Zod 表达标题和按顺序排列的 SlideSpec。SlideSpec 是按 `layout` 区分的五种语义内容：`title`（标题、副标题）、`title_body`（标题、要点）、`three_cards`（标题、三张卡片）、`comparison`（标题、左右比较）、`process`（标题、顺序步骤）。字段限制避免空内容和过长文字；不接受模型生成的坐标。一个独立 Theme 包含页面尺寸、字体、颜色、边距、间距。换 Theme 不改变 DeckSpec。

## 行为与约束

- Zod 在生成之前拒绝不合法的布局、缺失字段、错误的卡片/步骤数和过长文本。
- 布局引擎按布局种类确定性地计算文本和图形元素几何；中间元素与 PptxGenJS 类型无关。边界验证对所有元素检查有限数值、正宽高以及页面内位置；失败时不导出文件。文本用约束长度、固定版面及 PPT 的文本缩放防止溢出。
- Renderer 生成五页、16:9、可编辑原生文本与形状，返回 PPTX 二进制；不把文字烘焙成图片。演示无需密钥和外部服务。
- 首页只有项目名称、说明及 Generate Demo PPT 按钮，点击下载 `slide-agent-demo.pptx`。

## 验收

`pnpm install`、`pnpm dev`、`pnpm test`、`pnpm build` 可用；测试覆盖合法/非法 schema、五种布局、边界/越界、渲染生成和五页 PPTX 文件结构；PPTX 能在 PowerPoint 或兼容软件打开。若当前环境无办公软件，需明确说明无法完成手动打开验证。

## 非目标

不实现 LLM、Agent、预览、Vision QA、PDF/DOCX、搜索、图片、数据库、登录、后台任务、微服务、Model Router 或 MCP；暂不支持主题/自由文本直接生成，这是 M1 及后续目标。
