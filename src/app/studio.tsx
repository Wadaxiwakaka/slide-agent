'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import ModelSettings, { type PublicSettings } from './model-settings';
import type { StyleChoice, StyleId } from '../domain/theme';
import { outlineSchema, type Outline } from '../domain/outline';
import FeedbackMessage, { type Feedback } from './feedback-message';
import OutlineEditor from './outline-editor';
import LongformWorkflow, { estimateLongformCalls, type LongformHandle } from './longform-workflow';
import { longformRequestSchema, type LongformRequest } from '../domain/longform';

const styleNames: Record<StyleId, string> = { classic: '经典蓝', dark: '深色科技', warm: '暖色简报' };

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
  const [styleChoice, setStyleChoice] = useState<StyleChoice>('auto');
  const [density, setDensity] = useState<LongformRequest['density']>('concise');
  const longform = useRef<LongformHandle>(null);
  const [outline, setOutline] = useState<Outline | null>(null);
  const [outlineInput, setOutlineInput] = useState<string | null>(null);
  const restoreInput = useCallback((value: LongformRequest) => {
    setTopic(value.topic); setSourceText(value.sourceText); setAudience(value.audience); setPurpose(value.purpose); setSlideCount(value.slideCount); setStyleChoice(value.styleChoice); setDensity(value.density);
    setOutline(null); setOutlineInput(null);
  }, []);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const refresh = useCallback(async () => setSettings(await fetchSettings()), []);
  useEffect(() => { void fetchSettings().then(setSettings).catch((error) => setFeedback({ kind: 'error', text: error instanceof Error ? error.message : '读取配置失败' })); }, []);
  const input = { topic, sourceText, audience, purpose, slideCount, styleChoice };
  const materialInput = { ...input, density };
  const isLong = density === 'detailed' || slideCount > 10 || sourceText.length > 20_000;
  const estimate = estimateLongformCalls(sourceText.length, slideCount);

  function invalidate() { setOutline(null); setOutlineInput(null); setFeedback(null); }

  async function plan(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!topic.trim() && !sourceText.trim()) { setFeedback({ kind: 'error', text: '请提供主题或原始文本' }); return; }
    if (isLong) {
      const result = longformRequestSchema.safeParse(materialInput);
      if (!result.success) { setFeedback({ kind: 'error', text: '详细或长文稿请提供原始材料，页数1–100，材料最多200,000字符。仅主题联网模式尚未实现。' }); return; }
      if (localStorage.getItem('slideagent-longform-job') && !window.confirm('重新规划会覆盖当前任务入口和未确认编辑，并再次收费；旧检查点保留至过期。继续吗？')) return;
      setOutline(null); setOutlineInput(null); setFeedback(null);
      await longform.current?.start(result.data); return;
    }
    if (outline && !window.confirm('重新生成大纲会覆盖当前所有编辑，并可能再次收费。继续吗？')) return;
    setBusy(true); setFeedback({ kind: 'progress', text: '正在规划大纲，模型输出无效时可能自动重试一次…' });
    const snapshot = JSON.stringify(input);
    try {
      const response = await fetch('/api/outline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: snapshot });
      if (!response.ok) throw new Error((await response.json()).error ?? '大纲生成失败');
      const result = outlineSchema.safeParse((await response.json()).outline);
      if (!result.success) throw new Error('大纲响应格式无效，请重新生成');
      setOutline(result.data); setOutlineInput(snapshot);
      setFeedback({ kind: 'success', text: '大纲已生成。可编辑内容并调整顺序，确认后再生成 PPTX。' });
    } catch (error) { setFeedback({ kind: 'error', text: error instanceof Error ? error.message : '大纲生成失败' }); }
    finally { setBusy(false); }
  }

  async function generate() {
    if (!outline || !outlineInput || outlineInput !== JSON.stringify(input)) { setFeedback({ kind: 'error', text: '输入已改变，请重新生成大纲' }); return; }
    if (!outlineSchema.safeParse(outline).success) { setFeedback({ kind: 'error', text: '大纲内容无效，请检查标题、核心观点和页序' }); return; }
    setBusy(true); setFeedback({ kind: 'progress', text: '正在按已确认大纲生成 PPTX，模型输出无效时可能自动重试一次…' });
    try {
      const response = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, outline }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? '生成失败');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = 'slide-agent-generated.pptx';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      const style = response.headers.get('X-SlideAgent-Style');
      const chosen = style && Object.hasOwn(styleNames, style) ? styleNames[style as StyleId] : null;
      const fallback = styleChoice === 'auto' && style === 'classic' && response.headers.get('X-SlideAgent-Style-Fallback') === '1';
      setFeedback({ kind: 'success', text: chosen ? `PPTX 已开始下载 · ${fallback ? '未识别风格，已使用经典蓝' : `本次风格：${chosen}`}` : 'PPTX 已开始下载' });
    } catch (error) { setFeedback({ kind: 'error', text: error instanceof Error ? error.message : '生成失败' }); }
    finally { setBusy(false); }
  }

  return <div className="mt-10 grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]">
    <div>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="generate-heading">
        <h2 id="generate-heading" className="text-xl font-semibold">生成演示文稿</h2>
        <p className="mt-2 text-sm text-slate-600">描述主题或粘贴材料，由所选模型先规划可编辑大纲，确认后再生成可编辑 PPTX。</p>
        <form onSubmit={plan} className="mt-6 grid gap-4">
          <label className="grid gap-1 text-sm">主题<input name="topic" maxLength={200} disabled={busy} value={topic} onChange={(e) => { setTopic(e.target.value); invalidate(); }} placeholder="例如：人工智能与时间序列预测" className="rounded-lg border border-slate-300 p-3" /></label>
          <label className="grid gap-1 text-sm">原始文本<textarea name="sourceText" maxLength={200000} disabled={busy} rows={6} value={sourceText} onChange={(e) => { setSourceText(e.target.value); invalidate(); }} placeholder="也可以只粘贴材料；不能与主题同时留空" className="rounded-lg border border-slate-300 p-3" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">受众<input name="audience" required maxLength={120} disabled={busy} value={audience} onChange={(e) => { setAudience(e.target.value); invalidate(); }} className="rounded-lg border border-slate-300 p-3" /></label>
            <label className="grid gap-1 text-sm">演示目的<input name="purpose" required maxLength={120} disabled={busy} value={purpose} onChange={(e) => { setPurpose(e.target.value); invalidate(); }} className="rounded-lg border border-slate-300 p-3" /></label>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="grid gap-1 text-sm">目标页数（1–100）<input name="slideCount" type="number" min={1} max={100} required disabled={busy} value={slideCount} onChange={(e) => { setSlideCount(Number(e.target.value)); invalidate(); }} className="w-32 rounded-lg border border-slate-300 p-3" /></label>
            <label className="grid gap-1 text-sm">视觉风格<select name="styleChoice" value={styleChoice} disabled={busy} onChange={(e) => { setStyleChoice(e.target.value as StyleChoice); invalidate(); }} className="min-w-44 rounded-lg border border-slate-300 p-3"><option value="auto">自动</option><option value="classic">经典蓝</option><option value="dark">深色科技</option><option value="warm">暖色简报</option></select></label>
          </div>
          <label className="grid gap-1 text-sm">内容详略<select name="density" value={density} disabled={busy} onChange={e => { setDensity(e.target.value as LongformRequest['density']); invalidate(); }} className="rounded-lg border border-slate-300 p-3"><option value="concise">简洁</option><option value="detailed">详细（解释与例子，放不下时续页）</option></select></label>
          {isLong && <p className="text-sm text-amber-800">按当前长度预计约 {estimate.min} 次模型调用，各批重试时约 {estimate.max} 次；实际次数随段落分块和章节划分改变，不代表费用金额。100 页包含续页；材料不足需接受较少页数。</p>}
          <p className="text-sm text-slate-600">当前模型：{settings?.models.find((model) => model.id === settings.activeId)?.name ?? '未选择'}</p>
          <p className="text-sm text-amber-800">生成大纲至少调用模型 1 次，无效输出最多重试 1 次，可能产生两次调用费用。重新生成也会收费。</p>
          <button type="submit" disabled={busy || !settings?.activeId} className="min-h-12 rounded-xl bg-blue-700 px-6 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">生成大纲</button>
          {feedback && <FeedbackMessage {...feedback} />}
        </form>
      </section>
      <LongformWorkflow ref={longform} currentInput={materialInput} onRestore={restoreInput} onBusy={setBusy} />
      {outline && <OutlineEditor outline={outline} onChange={setOutline} onRegenerate={() => void plan()} onConfirm={() => void generate()} busy={busy} />}
    </div>
    <ModelSettings settings={settings} refresh={refresh} />
  </div>;
}
