# SlideAgent

从语义化 DeckSpec 生成真正可编辑的 PowerPoint 演示文稿。M2 内容阶段先生成可编辑、可调整顺序的叙事大纲，确认后生成 PPTX；当用户材料有原文依据时，可选时间轴与数据重点页。生成前可选自动/手动经典蓝、深色科技、暖色简报。支持 OpenAI 兼容、Anthropic、Gemini；M0 无 AI 五页示例仍可用。

> **仅限本机单用户使用。** 当前没有登录、额度控制或公网请求安全策略，**不可直接公开部署**。后续上线前必须补上身份认证、配置存储与访问限制。

```bash
pnpm install
cp .env.example .env.local
# 在 .env.local 中配置密钥，例如 SLIDEAGENT_API_KEY_WORK=<你自己的密钥>
pnpm dev
# 打开 http://127.0.0.1:3000
pnpm test
pnpm lint
pnpm build
```

网页的“管理模型配置”中添加协议、Base URL、模型 ID 和密钥别名 `WORK`，然后选择模型。密钥仅由服务端从 `SLIDEAGENT_API_KEY_WORK` 获取，网页不会保存或回显它。普通配置保存在 Git 忽略的 `data/model-configs.json`。修改 `.env.local` 后重新启动服务器。

| 协议 | Base URL 示例 |
| --- | --- |
| OpenAI 兼容 | `https://api.openai.com/v1`（第三方兼容接口填自己的 `/v1` 地址） |
| Anthropic | `https://api.anthropic.com/v1` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta` |

选择模型后填写主题或原始文本、受众、目的和 1–10 页，选择风格（默认“自动”），点击“生成大纲”。可修改每页标题、核心观点，用“上移/下移”调整非封面页顺序；“重新生成大纲”会在确认后覆盖当前编辑。点击“确认大纲并生成 PPTX”才调用模型生成可编辑文件并下载。两阶段各至少调用一次模型，无效输出各最多再试一次；**每次调用可能产生费用**。输入更改使旧大纲失效；大纲只保存在当前浏览器内存，刷新需重做。没有日期或数值依据时不生成对应事实页，编辑后新增无来源数字会被拒绝。自动风格建议无效时回退经典蓝；旧版 `/api/generate` 扁平请求继续可用。**生成后预览与无模型调用换肤**尚未实现。无需密钥的示例仍可点击 **Generate Demo PPT**，或执行 `curl -L http://127.0.0.1:3000/api/demo -o slide-agent-demo.pptx`。

## 长材料与详细模式

目标页数可选 1–100，原文最多 200,000 UTF-16 字符且新请求体最多 1 MiB。简洁、≤10页且材料≤20,000字符仍走原流程；详细或长稿要求提供原始材料，按材料归纳→全篇叙事→分批大纲→审阅→分批正文推进，每批最多8张原页。详细模式提供解释与必要例子，正文至少16pt；能无损拆分的过密页面插入续页，不能拆分或超过100页则报错，不下载残缺文稿。材料不足须明确接受较少页数。仅主题的联网研究、图片上传、PDF/DOCX与下载前预览尚未实现。

长稿检查点保存在 Git 忽略的 `data/longform-jobs/`，浏览器只保存任务编号；格式有效的大纲编辑自动保存（不调用模型），保存完成前刷新可能丢失最近编辑。刷新后可恢复已确认大纲及完成批次，点击继续才会再次调用模型；进行中的一次调用若中断仍可能计费。可停止后续批次、删除本机任务；7天未活动的任务在服务启动/任务请求时清理。本机材料以明文存储（不含密钥），不能把此目录上传或公开。模型配置改变后须重新规划，已完成批次不重复收费重做；最终只下载完整PPTX。

架构与范围见 [长材料规格](docs/specs/m2-longform-materials/SPEC.md)、[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)、[M2 内容规格](docs/specs/m2-content-intelligence/SPEC.md)、[M2 风格规格](docs/specs/m2-style-intelligence/SPEC.md)、[M1 规格](docs/specs/m1-ai-planner/SPEC.md) 和 [M0 规格](docs/specs/m0-rendering-engine/SPEC.md)。
