export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f9fc] px-6 py-20 text-[#172743] sm:py-32">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 inline-flex rounded-full border border-[#dce5f0] bg-white px-4 py-2 text-sm text-[#576781]">
          M0 · Rendering Engine
        </div>
        <h1 className="text-5xl font-bold tracking-tight sm:text-7xl">SlideAgent</h1>
        <p className="mt-7 max-w-xl text-lg leading-relaxed text-[#576781]">
          从结构化内容到真正可编辑的 PowerPoint。体验五种确定性布局生成的演示文稿，无需登录或 AI 密钥。
        </p>
        <a href="/api/demo" download="slide-agent-demo.pptx" className="mt-10 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#1667cf] px-6 font-semibold text-white transition-colors hover:bg-[#1356ac] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1667cf]">
          Generate Demo PPT <span aria-hidden="true" className="ml-3">↗</span>
        </a>
        <p className="mt-5 text-sm text-[#576781]">下载 16:9、5 页的 .pptx；所有文字和图形可在 PowerPoint 中编辑。</p>
      </div>
    </main>
  );
}
