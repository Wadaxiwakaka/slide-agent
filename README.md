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

架构与范围见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)、[M2 内容规格](docs/specs/m2-content-intelligence/SPEC.md)、[M2 风格规格](docs/specs/m2-style-intelligence/SPEC.md)、[M1 规格](docs/specs/m1-ai-planner/SPEC.md) 和 [M0 规格](docs/specs/m0-rendering-engine/SPEC.md)。
