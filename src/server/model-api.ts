import { z } from 'zod';
import type { ModelConfig } from './model-config';

export class ModelApiError extends Error {}

const openai = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })) });
const anthropic = z.object({ content: z.array(z.object({ type: z.string(), text: z.string().optional() })) });
const gemini = z.object({ candidates: z.array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }) })) });

export async function callModel(config: ModelConfig, key: string, prompt: string, fetcher: typeof fetch = fetch): Promise<string> {
  const root = `${config.baseUrl.replace(/\/+$/, '')}/`;
  const endpoint = config.protocol === 'openai' ? 'chat/completions' :
    config.protocol === 'anthropic' ? 'messages' : `models/${encodeURIComponent(config.modelId)}:generateContent`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let body: unknown;
  switch (config.protocol) {
    case 'openai':
      headers.Authorization = `Bearer ${key}`;
      body = { model: config.modelId, messages: [{ role: 'user', content: prompt }] };
      break;
    case 'anthropic':
      headers['x-api-key'] = key;
      headers['anthropic-version'] = '2023-06-01';
      body = { model: config.modelId, max_tokens: 8192, messages: [{ role: 'user', content: prompt }] };
      break;
    case 'gemini':
      headers['x-goog-api-key'] = key;
      body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 8192 } };
      break;
  }
  const signal = AbortSignal.timeout(90_000);
  try {
    const response = await fetcher(new URL(endpoint, root), {
      method: 'POST', headers, body: JSON.stringify(body), signal, redirect: 'error',
    });
    if (!response.ok) throw new ModelApiError(`模型服务 HTTP ${response.status}${response.status === 401 || response.status === 403 ? '（检查密钥）' : response.status === 429 ? '（请求过于频繁或额度不足）' : ''}`);
    if (!response.body) throw new ModelApiError('模型响应无内容');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 256 * 1024) {
        await reader.cancel();
        throw new ModelApiError('模型响应超过 256 KiB');
      }
      chunks.push(value);
    }
    let payload: unknown;
    try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new ModelApiError('模型响应不是有效 JSON'); }
    let text: string | undefined;
    try {
      switch (config.protocol) {
        case 'openai': text = openai.parse(payload).choices[0]?.message.content; break;
        case 'anthropic': text = anthropic.parse(payload).content.filter((part) => part.type === 'text').map((part) => part.text ?? '').join(''); break;
        case 'gemini': text = gemini.parse(payload).candidates[0]?.content.parts.map((part) => part.text ?? '').join(''); break;
      }
    } catch { throw new ModelApiError('模型响应结构无效'); }
    if (!text?.trim()) throw new ModelApiError('模型响应无内容');
    return text;
  } catch (error) {
    if (error instanceof ModelApiError) throw error;
    if (signal.aborted || (error instanceof DOMException && ['AbortError', 'TimeoutError'].includes(error.name))) throw new Error('模型请求超时');
    throw new Error('模型连接失败（检查地址与网络）');
  }
}
