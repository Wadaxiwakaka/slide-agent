'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import ModelSettings, { type PublicSettings } from './model-settings';

async function fetchSettings(): Promise<PublicSettings> {
  const response = await fetch('/api/models');
  if (!response.ok) throw new Error((await response.json()).error ?? '读取模型配置失败');
  return response.json();
}

export default function Studio() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [topic, setTopic] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [audience, setAudience] = useState('普通听众');
  const [purpose, setPurpose] = useState('介绍主题');
  const [slideCount, setSlideCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => setSettings(await fetchSettings()), []);
  useEffect(() => { void fetchSettings().then(setSettings).catch((error) => setMessage(error instanceof Error ? error.message : '读取配置失败')); }, []);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!topic.trim() && !sourceText.trim()) { setMessage('请提供主题或原始文本'); return; }
    setBusy(true); setMessage('正在规划并生成 PPTX，可能需要约一分钟…');
    try {
      const response = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, sourceText, audience, purpose, slideCount }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? '生成失败');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = 'slide-agent-generated.pptx';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage('PPTX 已开始下载');
    } catch (error) { setMessage(error instanceof Error ? error.message : '生成失败'); }
    finally { setBusy(false); }
  }

  return <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="generate-heading">
      <h2 id="generate-heading" className="text-xl font-semibold">生成演示文稿</h2>
      <p className="mt-2 text-sm text-slate-600">描述主题或粘贴材料，由所选模型规划内容，程序负责布局与可编辑 PPTX。</p>
      <form onSubmit={generate} className="mt-6 grid gap-4">
        <label className="grid gap-1 text-sm">主题<input name="topic" maxLength={200} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="例如：人工智能与时间序列预测" className="rounded-lg border border-slate-300 p-3" /></label>
        <label className="grid gap-1 text-sm">原始文本<textarea name="sourceText" maxLength={20000} rows={6} value={sourceText} onChange={(e) => setSourceText(e.target.value)} placeholder="也可以只粘贴材料；不能与主题同时留空" className="rounded-lg border border-slate-300 p-3" /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">受众<input name="audience" required maxLength={120} value={audience} onChange={(e) => setAudience(e.target.value)} className="rounded-lg border border-slate-300 p-3" /></label>
          <label className="grid gap-1 text-sm">演示目的<input name="purpose" required maxLength={120} value={purpose} onChange={(e) => setPurpose(e.target.value)} className="rounded-lg border border-slate-300 p-3" /></label>
        </div>
        <label className="grid gap-1 text-sm">页数（1–10）<input name="slideCount" type="number" min={1} max={10} required value={slideCount} onChange={(e) => setSlideCount(Number(e.target.value))} className="w-32 rounded-lg border border-slate-300 p-3" /></label>
        <p className="text-sm text-slate-600">当前模型：{settings?.models.find((model) => model.id === settings.activeId)?.name ?? '未选择'}</p>
        <button type="submit" disabled={busy || !settings?.activeId} className="min-h-12 rounded-xl bg-blue-700 px-6 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">生成 PPTX</button>
        {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
      </form>
    </section>
    <ModelSettings settings={settings} refresh={refresh} />
  </div>;
}
