'use client';

import type { Outline } from '../domain/outline';

type Props = { outline: Outline; onChange: (outline: Outline) => void; onRegenerate: () => void; onConfirm: () => void; busy: boolean; persistent?: boolean };
const roles: Record<Outline['slides'][number]['role'], string> = { opening: '开场', point: '论点', evidence: '依据', summary: '总结' };
const layouts: Record<Outline['slides'][number]['layout'], string> = {
  title: '封面', title_body: '标题与内容', three_cards: '三张卡片', comparison: '对比', process: '流程', timeline: '时间轴', data_highlight: '数据重点',
};

export default function OutlineEditor({ outline, onChange, onRegenerate, onConfirm, busy, persistent = false }: Props) {
  function update(index: number, field: 'title' | 'keyMessage', value: string) {
    onChange({ ...outline, slides: outline.slides.map((page, i) => i === index ? { ...page, [field]: value } : page) });
  }
  function move(index: number, target: number) {
    if (index === 0 || target < 1 || target >= outline.slides.length) return;
    const slides = [...outline.slides];
    [slides[index], slides[target]] = [slides[target], slides[index]];
    onChange({ ...outline, slides });
  }
  return <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="outline-heading">
    <h2 id="outline-heading" className="text-xl font-semibold">审阅并编辑大纲</h2>
    <p className="mt-2 text-sm text-slate-600">封面固定首位；可修改每页标题与核心观点，并调整其余页面顺序。{persistent ? '格式有效的大纲编辑会自动保存到本机；保存完成前刷新仍可能丢失最近编辑。' : '大纲仅保留在当前浏览器页面。'}</p>
    {persistent && <p className="mt-2 text-sm text-amber-800">当前大纲 {outline.slides.length} 页。可移除非封面页，为续页预留预算；减少页数须明确接受，重新确认会清除旧内容批次。</p>}
    <ol className="mt-5 grid gap-4">
      {outline.slides.map((page, index) => <li key={page.id} className="rounded-xl border border-slate-200 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">第 {index + 1} 页 · {roles[page.role]} · {layouts[page.layout]}</p>
          <div className="flex gap-2">
            <button type="button" aria-label={`上移第 ${index + 1} 页`} disabled={busy || index <= 1} onClick={() => move(index, index - 1)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-40">上移</button>
            {persistent && index > 0 && <button type="button" aria-label={`移除第 ${index + 1} 页`} disabled={busy} onClick={() => onChange({ ...outline, slides: outline.slides.filter((_, i) => i !== index) })} className="rounded-lg border border-red-200 px-3 py-1 text-sm text-red-700 disabled:opacity-40">移除</button>}
            <button type="button" aria-label={`下移第 ${index + 1} 页`} disabled={busy || index === 0 || index === outline.slides.length - 1} onClick={() => move(index, index + 1)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-40">下移</button>
          </div>
        </div>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">第 {index + 1} 页标题<input value={page.title} maxLength={60} required disabled={busy} onChange={(e) => update(index, 'title', e.target.value)} className="rounded-lg border border-slate-300 p-2" /></label>
          <label className="grid gap-1 text-sm">第 {index + 1} 页核心观点<textarea value={page.keyMessage} maxLength={110} required rows={2} disabled={busy} onChange={(e) => update(index, 'keyMessage', e.target.value)} className="rounded-lg border border-slate-300 p-2" /></label>
        </div>
        {page.sourceQuotes?.length ? <div className="mt-3 text-sm text-slate-600">原文依据（只读）<ul className="list-disc pl-5">{page.sourceQuotes.map((quote) => <li key={quote}>{quote}</li>)}</ul></div> : null}
      </li>)}
    </ol>
    <p className="mt-5 text-sm text-amber-800">{persistent ? '确认后分批生成，各批最多重试一次；新增续页计入100页上限，可能增加调用费用。' : '确认生成至少再调用模型 1 次，输出无效最多重试 1 次，可能产生两次调用费用。'}新增日期或数值请先补充原始材料并重新规划。</p>
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" disabled={busy} onClick={onRegenerate} className="rounded-lg border border-slate-300 px-4 py-3 font-medium disabled:opacity-50">重新生成大纲</button>
      <button type="button" disabled={busy} onClick={onConfirm} className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50">确认大纲并生成 PPTX</button>
    </div>
  </section>;
}
