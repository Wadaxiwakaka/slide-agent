# 路线图

每一阶段以可验证的输出结束，不提前引入后续基础设施。

- **M0** PPT Rendering Engine：5 种布局、示例 DeckSpec、可编辑 PPTX、最小下载 UI。
- **M1** AI Presentation Planner：从输入生成结构化 DeckSpec。
- **M2** Style Intelligence：三套视觉主题与现有五种页面的确定性变体，自动建议或手选风格；内容组织与叙事逻辑、新语义页面、生成后换肤和制作进度另行规划。
- **M3** Preview Renderer：幻灯片预览。
- **M4** Rule-based QA：扩展规则检查。
- **M5** VLM Visual QA + Automatic Repair。
- **M6** PDF / DOCX / Web Research。
- **M7** Asset Search + Image Generation。
- **M8** Natural Language Slide Editing。
- **M9** Evaluation Framework。
- **M10** Model Router / MCP（在确有需要时）。

后续能力（暂不排入以视觉风格为重点的 M2）：
- 内容组织与叙事逻辑：让 AI 更好地安排开场、论点、证据和结论；另行设计和验收。
- 新的语义页面结构：时间轴、数据重点页等；需要扩展 DeckSpec 核心模型及布局/渲染链，实施前另行征求用户同意。
- 生成过程可视化，展示规划、布局、渲染、验证等环节。
- 生成后无需再次调用模型即可切换风格：保留当次 DeckSpec，用新主题重新渲染可编辑 PPTX。
