# 架构

采用 Next.js + TypeScript 的 modular monolith。Web UI 暂存可编辑大纲并在确认后下载；Application/API 负责装配；领域层用 Zod 定义独立于 PptxGenJS 的 Outline 与 DeckSpec/SlideSpec；Theme 提供页面尺寸、颜色、排版和间距；Layout Engine 把语义内容映射为有边界的文本和形状；PptxRenderer 唯一负责 PPTX 写入；Validation 检查原文来源、布局元素位置和文本容量。

```text
用户输入 → POST /api/outline → AI 规划大纲 → Outline schema + 原文校验 → 浏览器内编辑与确认
               ↓                                                          ↓
旧版 POST /api/generate（无大纲） ───────────────────────→ POST /api/generate（确认的大纲 + 原输入）
               └────────────────→ AI 生成 DeckSpec + 原文/顺序/标题/核心观点校验 ──┐
M0 demoDeck ────────────────────────────────────────────────────────────────────────┴→ Theme → deterministic Layout → 几何/文字检查 → 唯一 PptxGenJS Renderer → PPTX 下载
风格：手选优先；自动采用模型同一次 DeckSpec 调用的风格建议，建议无效回退经典蓝
服务端模型配置 + 环境变量密钥 → 原生 fetch（OpenAI 兼容 / Anthropic / Gemini）
```

已确认大纲约束最终每页类型/顺序/标题与完整可编辑观点；仅用户原文可支持的日期/数值可进入时间轴或数据重点页，来源片段只用于校验不进入 PPTX。失败不静默降级。风格 ID 独立于 DeckSpec，布局按 Theme 确定性生成；DeckSpec 不含绝对 x/y/w/h 或厂商对象。响应头 `X-SlideAgent-Style` 报告实际风格，自动回退另有 `X-SlideAgent-Style-Fallback: 1`。模型普通配置位于本机 Git 忽略的 JSON 文件，密钥仅从服务端环境变量取得。单 Node 进程、只监听 `127.0.0.1`；没有登录、额度或公网 SSRF 防护，不能公开部署。幻灯片预览在 M3；生成后换肤后续再做。当前只保留一个 PPTX 渲染器。

长材料使用独立 `/api/longform/jobs` 输入与任务接口：有界材料分块/分层摘要→全篇故事线→最多8张原页的大纲批次→审阅确认→正文批次→原页锚点/来源/100页上限校验→原Renderer下载整稿。原API仍保持1–10页/20,000字符限制。详细布局最小正文16pt，安全语义边界拆续页、不自动缩字。Node文件API在 `data/longform-jobs/` 原子写检查点，以随机UUID、输入/确认大纲版本、模型配置指纹和进度token防止错配或重复付费请求；同任务单进程锁。服务启动和任务请求清理7天不活动记录，浏览器只持久化编号；模型密钥每步读取环境变量，不进入快照。无数据库、后台定时器或分布式任务系统。
