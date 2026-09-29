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
- 旧 M2 PPTX 的 PowerPoint/LibreOffice 逐页人工视觉验收，以及根工作区 lint 误扫 `.worktrees/` 产物，单列跟踪。
