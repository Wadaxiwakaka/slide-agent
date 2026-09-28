import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { callModel, ModelApiError } from './model-api';
import { loadSettings, modelInputSchema, resolveKey, saveSettings, type ModelConfig, type Settings } from './model-config';

export class ModelManagementError extends Error {}

// ponytail: one in-process write queue; use database transactions before multi-process/public deployment.
let pending: Promise<unknown> = Promise.resolve();
function update(filePath: string, mutate: (settings: Settings) => Settings | Promise<Settings>): Promise<Settings> {
  const operation = pending.then(async () => {
    const next = await mutate(await loadSettings(filePath));
    await saveSettings(filePath, next);
    return next;
  });
  pending = operation.catch(() => undefined);
  return operation;
}

export async function listModels(filePath: string, env: NodeJS.ProcessEnv = process.env) {
  const settings = await loadSettings(filePath);
  return { activeId: settings.activeId, models: settings.models.map((model) => ({
    ...model, hasKey: Boolean(env[`SLIDEAGENT_API_KEY_${model.keyAlias}`]),
  })) };
}

export async function createModel(filePath: string, input: unknown): Promise<ModelConfig> {
  const model = { id: randomUUID(), ...modelInputSchema.parse(input) };
  await update(filePath, (settings) => ({ ...settings, models: [...settings.models, model] }));
  return model;
}

export async function editModel(filePath: string, id: string, input: unknown): Promise<void> {
  const fields = modelInputSchema.parse(input);
  await update(filePath, (settings) => {
    if (!settings.models.some((model) => model.id === id)) throw new ModelManagementError('找不到模型配置');
    return { ...settings, models: settings.models.map((model) => model.id === id ? { id, ...fields } : model) };
  });
}

export async function removeModel(filePath: string, id: string): Promise<void> {
  await update(filePath, (settings) => {
    if (!settings.models.some((model) => model.id === id)) throw new ModelManagementError('找不到模型配置');
    return { activeId: settings.activeId === id ? null : settings.activeId, models: settings.models.filter((model) => model.id !== id) };
  });
}

export async function selectModel(filePath: string, id: string | null): Promise<void> {
  await update(filePath, (settings) => {
    if (id !== null && !settings.models.some((model) => model.id === id)) throw new ModelManagementError('找不到模型配置');
    return { ...settings, activeId: id };
  });
}

export async function activeModel(filePath: string, env: NodeJS.ProcessEnv = process.env): Promise<{ config: ModelConfig; key: string }> {
  const settings = await loadSettings(filePath);
  const config = settings.models.find((model) => model.id === settings.activeId);
  if (!config) throw new ModelManagementError('未选择模型');
  try { return { config, key: resolveKey(config.keyAlias, env) }; }
  catch { throw new ModelManagementError(`请设置 SLIDEAGENT_API_KEY_${config.keyAlias}`); }
}

export async function testModelConnection(filePath: string, fetcher: typeof fetch = fetch, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const { config, key } = await activeModel(filePath, env);
  await callModel(config, key, '请只回复 OK', fetcher);
}

export function configError(error: unknown): Response {
  if (error instanceof ModelManagementError) return Response.json({ error: error.message }, { status: 400 });
  if (error instanceof z.ZodError) return Response.json({ error: '模型配置字段无效' }, { status: 400 });
  if (error instanceof ModelApiError) return Response.json({ error: error.message }, { status: 502 });
  return Response.json({ error: '配置处理失败，请检查本地配置文件' }, { status: 500 });
}

export async function parseJsonRequest(request: Request): Promise<unknown> {
  try { return await request.json(); }
  catch { throw new ModelManagementError('请求 JSON 无效'); }
}

export function checkJsonRequest(request: Request): Response | null {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host') ?? new URL(request.url).host;
  try {
    const parsedHost = new URL(`http://${host}`);
    if (parsedHost.username || parsedHost.password || parsedHost.pathname !== '/' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsedHost.hostname) ||
      (origin && origin !== `${new URL(request.url).protocol}//${host}`)) {
      return Response.json({ error: '跨站请求被拒绝' }, { status: 403 });
    }
  } catch { return Response.json({ error: '请求主机无效' }, { status: 403 }); }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return Response.json({ error: '仅接受 JSON' }, { status: 415 });
  return null;
}
