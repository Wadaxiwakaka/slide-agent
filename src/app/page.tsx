import Studio from './studio';

export default function Home() {
  return <main className="min-h-screen bg-[#f7f9fc] px-5 py-14 text-[#172743] sm:px-8">
    <div className="mx-auto max-w-6xl">
      <div className="inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">M2 · 内容大纲 · 仅供本机使用</div>
      <h1 className="mt-6 text-5xl font-bold tracking-tight sm:text-6xl">SlideAgent</h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-600">AI 规划语义内容，确定性布局生成真正可编辑的 PowerPoint。支持 OpenAI 兼容、Anthropic 与 Gemini 模型 API。</p>
      <a href="/api/demo" download="slide-agent-demo.pptx" className="mt-5 inline-block text-blue-700 underline underline-offset-4 hover:text-blue-900">Generate Demo PPT（无需模型）</a>
      <Studio />
      <p className="mt-8 text-sm text-slate-600">此版本没有登录与额度保护，请勿直接公开部署。API 密钥仅通过服务端环境变量提供。</p>
    </div>
  </main>;
}
