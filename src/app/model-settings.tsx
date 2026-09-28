'use client';

import { useState, type FormEvent } from 'react';

type Protocol = 'openai' | 'anthropic' | 'gemini';
type Model = { id: string; name: string; protocol: Protocol; baseUrl: string; modelId: string; keyAlias: string; hasKey: boolean };
export type PublicSettings = { activeId: string | null; models: Model[] };
const bases: Record<Protocol, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
};
const blank = { name: '', protocol: 'openai' as Protocol, baseUrl: bases.openai, modelId: '', keyAlias: 'WORK' };

async function send(method: string, path: string, body?: unknown): Promise<void> {
  const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  if (!response.ok) throw new Error((await response.json()).error ?? '操作失败');
}

export default function ModelSettings({ settings, refresh }: { settings: PublicSettings | null; refresh: () => Promise<void> }) {
  const [draft, setDraft] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function run(action: () => Promise<void>, success: string) {
    setBusy(true); setMessage('');
    try { await action(); await refresh(); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : '操作失败'); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      await send(editing ? 'PUT' : 'POST', '/api/models', editing ? { id: editing, config: draft } : draft);
      setDraft(blank); setEditing(null);
    }, editing ? '模型配置已更新' : '模型配置已添加，请选择使用');
  }
  function edit(model: Model) {
    setEditing(model.id);
    setDraft({ name: model.name, protocol: model.protocol, baseUrl: model.baseUrl, modelId: model.modelId, keyAlias: model.keyAlias });
  }
  return (
    <section aria-labelledby="settings-heading" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 id="settings-heading" className="text-xl font-semibold">管理模型配置</h2>
      <p className="mt-2 text-sm text-slate-600">仅保存非密钥配置。密钥从服务端环境变量读取；连接测试可能产生少量费用。</p>
      <ul className="mt-5 space-y-3">
        {settings?.models.map((model) => <li key={model.id} className="rounded-xl border border-slate-200 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <strong>{model.name}</strong><span className="text-slate-500">{model.protocol} · {model.modelId}</span>
            <span className={model.hasKey ? 'text-emerald-700' : 'text-amber-700'}>{model.hasKey ? '密钥已配置' : '缺少环境变量密钥'}</span>
          </div>
          <p className="mt-1 break-all text-slate-500">{model.baseUrl} · SLIDEAGENT_API_KEY_{model.keyAlias}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" disabled={busy || settings.activeId === model.id} onClick={() => run(() => send('PATCH', '/api/models', { activeId: model.id }), '已切换模型')} className="text-blue-700 disabled:text-slate-400">{settings.activeId === model.id ? '当前模型' : '选择'}</button>
            <button type="button" disabled={busy} onClick={() => edit(model)} className="text-blue-700">编辑</button>
            <button type="button" disabled={busy || settings.activeId !== model.id} onClick={() => run(() => send('POST', '/api/models/test'), '连接成功')} className="text-blue-700 disabled:text-slate-400">测试连接（可能收费）</button>
            <button type="button" disabled={busy} onClick={() => { if (window.confirm(`确定删除 ${model.name}？`)) void run(() => send('DELETE', '/api/models', { id: model.id }), '已删除配置'); }} className="text-red-700">删除</button>
          </div>
        </li>)}
        {settings && settings.models.length === 0 && <li className="text-sm text-slate-500">还没有模型配置。</li>}
      </ul>
      <form onSubmit={save} className="mt-6 grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-2">
        <h3 className="font-medium sm:col-span-2">{editing ? '编辑配置' : '添加模型'}</h3>
        <label className="grid gap-1 text-sm">名称<input required maxLength={60} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="rounded-lg border border-slate-300 p-2" /></label>
        <label className="grid gap-1 text-sm">协议<select value={draft.protocol} onChange={(e) => { const protocol = e.target.value as Protocol; setDraft({ ...draft, protocol, baseUrl: bases[protocol] }); }} className="rounded-lg border border-slate-300 p-2"><option value="openai">OpenAI 兼容</option><option value="anthropic">Anthropic</option><option value="gemini">Gemini</option></select></label>
        <label className="grid gap-1 text-sm sm:col-span-2">Base URL<input required type="url" value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} className="rounded-lg border border-slate-300 p-2" /></label>
        <label className="grid gap-1 text-sm">模型 ID<input required maxLength={120} value={draft.modelId} onChange={(e) => setDraft({ ...draft, modelId: e.target.value })} className="rounded-lg border border-slate-300 p-2" /></label>
        <label className="grid gap-1 text-sm">密钥别名（环境变量后缀）<input required pattern="[A-Z][A-Z0-9_]*" value={draft.keyAlias} onChange={(e) => setDraft({ ...draft, keyAlias: e.target.value })} className="rounded-lg border border-slate-300 p-2" /></label>
        <div className="flex items-center gap-3 sm:col-span-2"><button disabled={busy} className="rounded-lg bg-blue-700 px-4 py-2 text-white disabled:opacity-50">{editing ? '保存更改' : '添加配置'}</button>{editing && <button type="button" onClick={() => { setEditing(null); setDraft(blank); }} className="text-slate-600">取消</button>}</div>
      </form>
      {message && <p role="status" className="mt-4 text-sm">{message}</p>}
    </section>
  );
}
