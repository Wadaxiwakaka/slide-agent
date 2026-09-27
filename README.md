# SlideAgent

从语义化 DeckSpec 生成真正可编辑的 PowerPoint 演示文稿。当前 M0 仅提供无 AI 的五页示例。

```bash
pnpm install
pnpm dev
# 打开 http://localhost:3000 并点击 Generate Demo PPT
# 或 curl -L http://localhost:3000/api/demo -o slide-agent-demo.pptx
pnpm test
pnpm build
```

生成文件保存在浏览器的下载目录（或 curl 命令指定的路径）。不需要 API Key。

架构与范围见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 和 [M0 规格](docs/specs/m0-rendering-engine/SPEC.md)。
