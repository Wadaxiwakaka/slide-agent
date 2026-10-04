import { describe, expect, it } from 'vitest';
import { splitSource, summarizeChunk, mergeDigests } from './source';
import type { ModelConfig } from '../model-config';
const config: ModelConfig = { id: 'test', name: 'Test', protocol: 'openai', baseUrl: 'https://example.com/v1', modelId: 'test', keyAlias: 'TEST' };
const reply = (output: unknown) => Response.json({ choices: [{ message: { content: typeof output === 'string' ? output : JSON.stringify(output) } }] });

describe('bounded material chunks', () => {
  it.each(['字'.repeat(20_013), '字'.repeat(4_999) + '😀2024年启动\n\n' + '文'.repeat(6_000), '# 一\n\n材料甲\n\n# 二\n\n材料乙'])('preserves every source unit and offset', (source) => {
    const chunks = splitSource(source);
    expect(chunks.map((c) => c.text).join('')).toBe(source);
    let offset = 0;
    for (const chunk of chunks) {
      expect(chunk.start).toBe(offset); expect(chunk.end).toBe(offset + chunk.text.length);
      expect(chunk.text.length).toBeLessThanOrEqual(5_000);
      expect(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(chunk.text)).toBe(false);
      offset = chunk.end;
    }
  });
  it('prefers paragraph boundaries without dropping whitespace', () => {
    expect(splitSource('甲甲\n\n乙乙乙乙', 7).map((c) => c.text)).toEqual(['甲甲\n\n', '乙乙乙乙']);
    expect(splitSource('')).toEqual([]);
    expect(() => splitSource('材料', 1)).toThrow();
  });
  it.each(['openai', 'anthropic', 'gemini'] as const)('summarizes with %s and server-owned ranges', async (protocol) => {
    const fetcher = (async (_: RequestInfo | URL, init?: RequestInit) => {
      expect(String(init?.body)).not.toContain('secret-key');
      const text = JSON.stringify({ summary: '项目建设与交付' });
      return protocol === 'openai' ? reply(text) : protocol === 'anthropic' ? Response.json({ content: [{ type: 'text', text }] }) : Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
    }) as typeof fetch;
    expect(await summarizeChunk({ start: 10, end: 17, text: '项目建设与交付' }, { ...config, protocol }, 'secret-key', fetcher)).toEqual({ summary: '项目建设与交付', sourceRange: [10, 17] });
  });
  it('retries only malformed content once and never echoes it', async () => {
    let calls = 0;
    const bad = (async () => { calls++; return reply('sensitive-not-json'); }) as typeof fetch;
    await expect(summarizeChunk({ start: 0, end: 2, text: '材料' }, config, 'secret-key', bad)).rejects.toThrow(/摘要/);
    expect(calls).toBe(2);
    let authCalls = 0;
    await expect(summarizeChunk({ start: 0, end: 2, text: '材料' }, config, 'secret-key', (async () => { authCalls++; return new Response('secret-key', { status: 401 }); }) as typeof fetch)).rejects.toThrow(/401/);
    expect(authCalls).toBe(1);
  });
  it('merges at most eight bounded digests, not full source text', async () => {
    const digests = [{ summary: '建设', sourceRange: [0, 5_000] as [number, number] }, { summary: '交付', sourceRange: [5_000, 10_000] as [number, number] }];
    const fetcher = (async (_: RequestInfo | URL, init?: RequestInit) => { expect(String(init?.body).length).toBeLessThan(10_000); return reply({ summary: '建设到交付' }); }) as typeof fetch;
    expect(await mergeDigests(digests, config, 'secret-key', fetcher)).toEqual({ summary: '建设到交付', sourceRange: [0, 10_000] });
    await expect(mergeDigests(Array(9).fill(digests[0]), config, 'secret-key', fetcher)).rejects.toThrow();
  });
});
