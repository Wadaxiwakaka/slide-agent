# 路线图

每一阶段以可验证的输出结束，不提前引入后续基础设施。

- **M0** PPT Rendering Engine：5 种布局、示例 DeckSpec、可编辑 PPTX、最小下载 UI。
- **M1** AI Presentation Planner：从输入生成结构化 DeckSpec。
- **M2** Style Intelligence + Content Intelligence：三套主题及五种原有页面；补做先编辑确认大纲再生成 PPTX，新增原文可支持的时间轴与数据重点页。生成后换肤和制作进度另行规划。
- **M3** Preview Renderer：先预览再确认下载；生成后网页内多轮编辑仍在后续阶段。
- **M4** Rule-based QA：扩展规则检查。
- **M5** VLM Visual QA + Automatic Repair。
- **M6** PDF / DOCX / Web Research。
- **M7** Asset Search + Image Generation。
- **M8** Natural Language Slide Editing。
- **M9** Evaluation Framework。
- **M10** Model Router / MCP（在确有需要时）。

后续能力（本阶段不做）：
- 生成过程可视化，展示规划、布局、渲染、验证等环节。
- 生成后无需再次调用模型即可切换风格：保留当次 DeckSpec，用新主题重新渲染可编辑 PPTX。
- **参考驱动的风格控制**：用户提供参考 PPTX 或图片（例如幻灯片截图），Agent 分析配色、字体层级、留白、版式与图形语言，提炼可审阅、可调整的风格约束，用于生成新的可编辑 PPTX，使视觉效果更贴近参考且更可控。区别于“上传图片作为页面素材”；参考文件不自动成为内容事实来源，也不默认复用其文字、图片或标识。不承诺任意参考的像素级复刻；仍保持语义内容、Theme、确定性 Layout 与 Renderer 分离，不将整页截图冒充可编辑幻灯片。安排在后续视觉能力阶段独立定规格与验收，具体阶段和顺序待确认，不纳入当前长材料交付。
- 工程遗留：根工作区 lint 误扫 `.worktrees/` 产物，单列跟踪；旧 M2 PPTX 的 PowerPoint/LibreOffice 逐页人工视觉验收已由用户完成。
