'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { longformRequestSchema, type LongformRequest } from '../domain/longform';
import { outlineSchema, type Outline } from '../domain/outline';
import type { JobStatus } from '../server/longform/job';
import FeedbackMessage, { type Feedback } from './feedback-message';
import OutlineEditor from './outline-editor';

export function estimateLongformCalls(chars: number, pages: number) {
  let chunks = Math.max(1, Math.ceil(chars / 5_000)), merges = 0;
  while (chunks > 8) { chunks = Math.ceil(chunks / 8); merges += chunks; }
  const min = Math.max(1, Math.ceil(chars / 5_000)) + merges + 1 + 2 * Math.ceil(pages / 8);
  return { min, max: min * 2 };
}
export type LongformHandle = { start: (input: LongformRequest) => Promise<void> };
type Props = { currentInput: unknown; onRestore: (input: LongformRequest) => void; onBusy: (busy: boolean) => void };
const STORAGE_KEY = 'slideagent-longform-job';
const phases = { summarize: '归纳材料', story: '规划全篇叙事', outline: '规划大纲', review: '审阅大纲', content: '生成内容', ready: '文稿完成' };
const buttonClass = 'rounded-lg border border-slate-300 px-4 py-3 disabled:opacity-40';

const LongformWorkflow = forwardRef<LongformHandle, Props>(function LongformWorkflow({ currentInput, onRestore, onBusy }, ref) {
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [material, setMaterial] = useState<LongformRequest | null>(null);
  const [outline, setOutline] = useState<Outline | null>(null);
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const running = useRef(false), cancelled = useRef(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftPending = useRef<Promise<unknown> | null>(null);
  const matches = Boolean(material && longformRequestSchema.safeParse(currentInput).success && JSON.stringify(longformRequestSchema.parse(currentInput)) === JSON.stringify(material));
  const markBusy = useCallback((value: boolean) => { running.current = value; setBusy(value); onBusy(value); }, [onBusy]);

  async function api(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(`/api/longform/jobs${path}`, { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {}, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) throw new Error((await response.json()).error ?? '任务请求失败');
    return response;
  }
  const restore = useCallback(async () => {
    const id = localStorage.getItem(STORAGE_KEY);
    if (!id) return;
    try {
      const response = await fetch(`/api/longform/jobs/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error((await response.json()).error ?? '任务已过期或已删除');
      const data = await response.json(); const input = longformRequestSchema.parse(data.input);
      setStatus(data.status); setMaterial(input); setOutline(data.status.outline ?? null); onRestore(input);
      setFeedback({ kind: 'success', text: '已恢复本机检查点；点击继续后才会调用模型。' });
    } catch (error) { setFeedback({ kind: 'error', text: error instanceof Error ? error.message : '恢复失败' }); localStorage.removeItem(STORAGE_KEY); }
  }, [onRestore]);
  useEffect(() => { void restore(); }, [restore]);
  async function run(initial: JobStatus) {
    let current = initial;
    while (!cancelled.current && current.stage !== 'review' && current.stage !== 'ready') {
      const data = await (await api(`/${current.id}/step`, 'POST', { checkpoint: current.checkpoint })).json();
      current = data.status; setStatus(current);
    }
    if (current.outline) setOutline(outlineSchema.parse(current.outline));
    setFeedback({ kind: 'success', text: cancelled.current ? '已停止后续批次，完成批次保留，可稍后继续。' : current.stage === 'ready' ? `文稿完成：实际 ${current.actualSlides} 页，含 ${(current.actualSlides ?? 0) - (current.outline?.slides.length ?? 0)} 张续页。` : '大纲已生成，请审阅确认。' });
  }
  async function start(input: LongformRequest) {
    if (running.current) return;
    markBusy(true); cancelled.current = false; setFeedback({ kind: 'progress', text: '正在分批规划材料…' });
    if (draftTimer.current) clearTimeout(draftTimer.current);
    await draftPending.current;
    try {
      const data = await (await api('', 'POST', input)).json();
      localStorage.setItem(STORAGE_KEY, data.status.id); setMaterial(input); setStatus(data.status); setOutline(null); setAccept(false); setEditing(false);
      await run(data.status);
    } catch (error) { setFeedback({ kind: 'error', text: error instanceof Error ? error.message : '任务失败' }); }
    finally { markBusy(false); }
  }
  useImperativeHandle(ref, () => ({ start }));
  function updateDraft(value: Outline) {
    setOutline(value);
    if (draftTimer.current) clearTimeout(draftTimer.current);
    if (!status || !outlineSchema.safeParse(value).success) return;
    draftTimer.current = setTimeout(() => {
      const pending = (draftPending.current ?? Promise.resolve()).then(() => api(`/${status.id}/outline`, 'POST', { draft: true, outline: value, checkpoint: status.checkpoint }));
      draftPending.current = pending.catch(error => setFeedback({ kind: 'error', text: `大纲尚未保存：${error instanceof Error ? error.message : '请稍后重试'}` }));
    }, 500);
  }
  useEffect(() => () => { if (draftTimer.current) clearTimeout(draftTimer.current); }, []);
  async function continueJob(confirm: boolean) {
    if (!status || !material || running.current) return;
    if (!matches) { setFeedback({ kind: 'error', text: '输入已改变，请重新规划，不能使用旧大纲。' }); return; }
    if (confirm && (!outline || !outlineSchema.safeParse(outline).success)) { setFeedback({ kind: 'error', text: '大纲无效，请检查编辑内容。' }); return; }
    if (confirm && (outline?.slides.length ?? 0) < material.slideCount && !accept) { setFeedback({ kind: 'error', text: '请明确接受较少页数或补充材料。' }); return; }
    if (confirm && status.stage !== 'review' && !window.confirm('重新确认大纲会清除已生成批次，重新调用模型可能收费。继续吗？')) return;
    markBusy(true); cancelled.current = false; setFeedback({ kind: 'progress', text: '正在处理下一批，模型输出无效可能重试一次…' });
    if (draftTimer.current) clearTimeout(draftTimer.current);
    await draftPending.current;
    try {
      const next = confirm ? (await (await api(`/${status.id}/outline`, 'POST', { outline, acceptShortfall: accept, checkpoint: status.checkpoint })).json()).status : status;
      setStatus(next); setEditing(false); await run(next);
    } catch (error) { setFeedback({ kind: 'error', text: error instanceof Error ? error.message : '任务失败' }); }
    finally { markBusy(false); }
  }
  async function download() {
    if (!status || running.current) return;
    markBusy(true);
    try {
      const response = await api(`/${status.id}/download`, 'POST', {});
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a');
      link.href = url; link.download = 'slide-agent-longform.pptx'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setFeedback({ kind: 'success', text: `PPTX 已开始下载 · 实际 ${response.headers.get('X-SlideAgent-Pages') ?? status.actualSlides} 页` });
    } catch (error) { setFeedback({ kind: 'error', text: error instanceof Error ? error.message : '下载失败' }); }
    finally { markBusy(false); }
  }
  async function remove() {
    if (!status || running.current || !window.confirm('删除本机任务及材料检查点？删除后不能恢复。')) return;
    markBusy(true);
    if (draftTimer.current) clearTimeout(draftTimer.current);
    await draftPending.current;
    try { await api(`/${status.id}`, 'DELETE'); localStorage.removeItem(STORAGE_KEY); setStatus(null); setMaterial(null); setOutline(null); setFeedback({ kind: 'success', text: '本机任务已删除。' }); }
    catch (error) { setFeedback({ kind: 'error', text: error instanceof Error ? error.message : '删除失败' }); }
    finally { markBusy(false); }
  }
  return <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6" aria-labelledby="longform-heading">
    <h2 id="longform-heading" className="text-xl font-semibold">长文稿 · 断点恢复</h2>
    <p className="mt-2 text-sm text-slate-600">仅本机保存材料与已完成批次，7 天未活动自动清理。刷新后不自动收费续跑；中断正在进行的调用仍可能计费。</p>
    {status && <>
      <p className="mt-3 font-medium">{phases[status.stage]} · 当前阶段 {status.completed}/{status.total}</p>
      {!matches && !busy && <p className="mt-2 text-red-700">输入已改变，请重新规划；恢复旧任务需使用原输入。</p>}
      {status.reason && <p className="mt-2">{status.reason} · 材料支持 {status.supportedPages} 页，目标 {material?.slideCount} 页。</p>}
      {material && <p className="mt-2 text-sm text-amber-800">正文预计至少 {Math.ceil((status.supportedPages ?? material.slideCount) / 8)} 次调用，各批无效最多额外重试一次；续页计入 100 页上限。</p>}
      {(status.stage === 'review' || editing) && (outline?.slides.length ?? status.supportedPages ?? 0) < (material?.slideCount ?? 0) && <label className="mt-3 flex gap-2"><input type="checkbox" checked={accept} disabled={busy} onChange={e => setAccept(e.target.checked)} />接受材料可支持的较少页数</label>}
      <div className="mt-4 flex flex-wrap gap-3">
        {!['review', 'ready'].includes(status.stage) && <button type="button" className={buttonClass} disabled={busy || !matches} onClick={() => void continueJob(false)}>继续任务（可能收费）</button>}
        {busy && <button type="button" className={buttonClass} onClick={() => { cancelled.current = true; }}>停止后续批次</button>}
        {status.stage === 'ready' && <button type="button" className={buttonClass} disabled={busy} onClick={() => void download()}>下载完整 PPTX</button>}
        {['content', 'ready'].includes(status.stage) && <button type="button" className={buttonClass} disabled={busy} onClick={() => setEditing(true)}>返回大纲</button>}
        <button type="button" className={buttonClass} disabled={busy} onClick={() => void remove()}>删除本机任务</button>
      </div>
      {outline && (status.stage === 'review' || editing) && <OutlineEditor outline={outline} onChange={updateDraft} onConfirm={() => void continueJob(true)} onRegenerate={() => { if (material && window.confirm('重新规划会覆盖编辑并再次收费，继续吗？')) void start(material); }} busy={busy || !matches} persistent />}
    </>}
    {feedback && <div className="mt-4"><FeedbackMessage {...feedback} /></div>}
  </section>;
});
export default LongformWorkflow;
