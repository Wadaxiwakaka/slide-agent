import { describe, expect, it } from 'vitest';
import type { ModelConfig } from './model-config';
import { callModel } from './model-api';

const base: ModelConfig = { id: 'a', name: 'Example', protocol: 'openai', baseUrl: 'https://api.example.com/v1', modelId: 'my-model', keyAlias: 'WORK' };
const key = 'sensitive-key';

describe('model protocol adapters', () => {
  it('calls OpenAI-compatible chat completions with bearer auth', async () => {
    const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.example.com/v1/chat/completions');
      expect(init?.headers).toMatchObject({ Authorization: `Bearer ${key}` });
      expect(init?.redirect).toBe('error');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'my-model', messages: [{ role: 'user', content: 'plan' }] });
      return Response.json({ choices: [{ message: { content: '{"title":"Example"}' } }] });
    }) as typeof fetch;
    expect(await callModel(base, key, 'plan', fetcher)).toBe('{"title":"Example"}');
  });
  it('calls Anthropic messages and joins only text blocks', async () => {
    const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.example.com/v1/messages');
      expect(init?.headers).toMatchObject({ 'x-api-key': key, 'anthropic-version': '2023-06-01' });
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'my-model', max_tokens: 8192 });
      return Response.json({ content: [{ type: 'text', text: 'deck' }, { type: 'tool_use', id: 'x' }, { type: 'text', text: ' JSON' }] });
    }) as typeof fetch;
    expect(await callModel({ ...base, protocol: 'anthropic' }, key, 'plan', fetcher)).toBe('deck JSON');
  });
  it('calls Gemini generateContent with auth in a header, not the URL', async () => {
    const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.example.com/v1/models/my-model:generateContent');
      expect(init?.headers).toMatchObject({ 'x-goog-api-key': key });
      expect(JSON.parse(String(init?.body))).toMatchObject({ contents: [{ parts: [{ text: 'plan' }] }] });
      return Response.json({ candidates: [{ content: { parts: [{ text: 'deck' }, { text: ' JSON' }] } }] });
    }) as typeof fetch;
    expect(await callModel({ ...base, protocol: 'gemini' }, key, 'plan', fetcher)).toBe('deck JSON');
  });
  it.each([302, 401, 429])('reports HTTP %s without provider body or key', async (status) => {
    const fetcher = (async (_: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe('error');
      return new Response(`provider echoed ${key}`, { status });
    }) as typeof fetch;
    await expect(callModel(base, key, 'plan', fetcher)).rejects.toThrow(/302|401|429/);
    try { await callModel(base, key, 'plan', fetcher); } catch (error) {
      expect(String(error)).not.toContain(key);
      expect(String(error)).not.toContain('provider echoed');
    }
  });
  it('rejects a missing completion and oversized streamed response', async () => {
    const empty = (async () => Response.json({ choices: [] })) as typeof fetch;
    await expect(callModel(base, key, 'plan', empty)).rejects.toThrow();
    const big = (async () => new Response('x'.repeat(256 * 1024 + 1))) as typeof fetch;
    await expect(callModel(base, key, 'plan', big)).rejects.toThrow(/256/);
  });
  it('sanitizes aborted and failed network calls', async () => {
    const aborted = (async () => { throw new DOMException(key, 'AbortError'); }) as typeof fetch;
    const failed = (async () => { throw new Error(key); }) as typeof fetch;
    const disguised = (async () => { throw new Error(`模型 ${key}`); }) as typeof fetch;
    await expect(callModel(base, key, 'plan', aborted)).rejects.toThrow(/超时/);
    await expect(callModel(base, key, 'plan', failed)).rejects.toThrow(/连接/);
    for (const fetcher of [aborted, failed, disguised]) {
      try { await callModel(base, key, 'plan', fetcher); } catch (error) { expect(String(error)).not.toContain(key); }
    }
  });
});
