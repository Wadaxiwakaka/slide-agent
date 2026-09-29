# SlideAgent

从语义化 DeckSpec 生成真正可编辑的 PowerPoint 演示文稿。M2 支持生成前选择视觉风格：自动（模型在原有规划调用中建议）或手选经典蓝、深色科技、暖色简报；现有五种语义页面均由确定性布局生成。模型接入支持 OpenAI 兼容协议、Anthropic 和 Gemini；M0 无 AI 五页示例仍可用。

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

选择模型后填写主题或原始文本、受众、目的和 1–10 页，选择视觉风格（默认“自动”），点击“生成 PPTX”；文件进入浏览器下载目录，页面提示实际采用的风格。自动选择未识别到有效风格时会提示并回退经典蓝；不会仅为风格额外请求一次模型。旧版 API 请求不传 `styleChoice` 时仍使用经典蓝。手动选择在生成前生效，**生成后无模型调用换肤**留待后续。测试连接和生成会请求第三方模型，**可能产生费用**。无需密钥的示例仍可点击 **Generate Demo PPT**，或执行 `curl -L http://127.0.0.1:3000/api/demo -o slide-agent-demo.pptx`。

架构与范围见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)、[M2 规格](docs/specs/m2-style-intelligence/SPEC.md)、[M1 规格](docs/specs/m1-ai-planner/SPEC.md) 和 [M0 规格](docs/specs/m0-rendering-engine/SPEC.md)。
