import { describe, expect, it } from 'vitest';
import type { ModelConfig } from './model-config';
import { generationRequestSchema, planDeck } from './planner';
import { outlineSchema } from '../domain/outline';

const config: ModelConfig = { id: 'one', name: 'Test', protocol: 'openai', baseUrl: 'https://api.example.com/v1', modelId: 'test', keyAlias: 'WORK' };
const request = { topic: '时间序列', sourceText: '过去三年的负荷记录', audience: '学生', purpose: '入门介绍', slideCount: 3, styleChoice: 'classic' as const };
const deck = { title: '时间序列', slides: [
  { layout: 'title', title: '时间序列', subtitle: '从数据预测未来' },
  { layout: 'title_body', title: '数据', bullets: ['收集', '清洗'] },
  { layout: 'process', title: '过程', steps: [{ heading: '输入', detail: '准备历史数据' }, { heading: '输出', detail: '做出预测' }] },
] };
const reply = (text: string) => Response.json({ choices: [{ message: { content: text } }] });

describe('presentation planner', () => {
  it('validates required input, lengths, and 1–10 slides', () => {
    expect(generationRequestSchema.safeParse({ ...request, topic: '', sourceText: '' }).success).toBe(false);
    expect(generationRequestSchema.safeParse({ ...request, topic: 'x'.repeat(201) }).success).toBe(false);
    expect(generationRequestSchema.safeParse({ ...request, sourceText: 'x'.repeat(20001) }).success).toBe(false);
    expect(generationRequestSchema.safeParse({ ...request, slideCount: 0 }).success).toBe(false);
    expect(generationRequestSchema.safeParse({ ...request, slideCount: 11 }).success).toBe(false);
    expect(generationRequestSchema.parse({ topic: '预测', slideCount: 1 })).toMatchObject({ audience: '普通听众', purpose: '介绍主题', sourceText: '', styleChoice: 'classic' });
    expect(generationRequestSchema.safeParse({ ...request, styleChoice: 'other' }).success).toBe(false);
  });
  it('preserves valid semantic content and sends all user requirements without a key in the prompt', async () => {
    const fetcher = (async (_: RequestInfo | URL, init?: RequestInit) => {
      const prompt = JSON.parse(String(init?.body)).messages[0].content as string;
      for (const value of ['时间序列', '过去三年的负荷记录', '学生', '入门介绍', 'three_cards', 'comparison', 'classic', 'dark', 'warm']) expect(prompt).toContain(value);
      expect(prompt).not.toContain('secret-key');
      return reply(JSON.stringify(deck));
    }) as typeof fetch;
    expect(await planDeck(request, config, 'secret-key', fetcher)).toEqual({ deck, suggestedStyle: null });
  });
  it.each([
    ['not json', '{broken'],
    ['wrong count', JSON.stringify({ ...deck, slides: deck.slides.slice(0, 2) })],
    ['wrong first slide', JSON.stringify({ ...deck, slides: [deck.slides[1], deck.slides[0], deck.slides[2]] })],
  ])('retries once for %s then succeeds with valid output', async (_case, bad) => {
    let calls = 0;
    const fetcher = (async () => reply(++calls === 1 ? bad : JSON.stringify(deck))) as typeof fetch;
    expect(await planDeck(request, config, 'secret-key', fetcher)).toEqual({ deck, suggestedStyle: null });
    expect(calls).toBe(2);
  });
  it('suggests a style without a second model call', async () => {
    let calls = 0;
    const fetcher = (async () => { calls++; return reply(JSON.stringify({ deck, styleId: 'dark' })); }) as typeof fetch;
    expect(await planDeck(request, config, 'secret-key', fetcher)).toEqual({ deck, suggestedStyle: 'dark' });
    expect(calls).toBe(1);
  });
  it.each([undefined, 'neon', 42])('accepts valid content but falls back for invalid style %s', async (styleId) => {
    let calls = 0;
    const fetcher = (async () => { calls++; return reply(JSON.stringify({ deck, styleId })); }) as typeof fetch;
    expect(await planDeck(request, config, 'secret-key', fetcher)).toEqual({ deck, suggestedStyle: null });
    expect(calls).toBe(1);
  });
  it('fails after exactly two invalid outputs without exposing raw content', async () => {
    let calls = 0;
    const fetcher = (async () => { calls++; return reply('sensitive-data-not-json'); }) as typeof fetch;
    await expect(planDeck(request, config, 'secret-key', fetcher)).rejects.toThrow(/两次|2/);
    expect(calls).toBe(2);
    try { await planDeck(request, config, 'secret-key', fetcher); } catch (error) { expect(String(error)).not.toContain('sensitive-data'); }
  });
  it('preserves every approved title, layout, order and key message', async () => {
    const approved = outlineSchema.parse({ title: '时间序列', slides: [
      { id: 'cover', role: 'opening', layout: 'title', title: '新封面', keyMessage: '概要' },
      { id: 'later', role: 'point', layout: 'title_body', title: '后页先讲', keyMessage: '论点乙' },
      { id: 'earlier', role: 'summary', layout: 'title_body', title: '前页后讲', keyMessage: '论点甲' },
    ] });
    const planned = { title: '时间序列', slides: [
      { layout: 'title', title: '新封面', subtitle: '概要' },
      { layout: 'title_body', title: '后页先讲', bullets: ['论点乙'] },
      { layout: 'title_body', title: '前页后讲', bullets: ['论点甲'] },
    ] };
    const fetcher = (async (_: RequestInfo | URL, init?: RequestInit) => {
      const prompt = JSON.parse(String(init?.body)).messages[0].content as string;
      for (const value of ['后页先讲', '前页后讲', '论点乙', '论点甲']) expect(prompt).toContain(value);
      return reply(JSON.stringify({ deck: planned, styleId: 'warm' }));
    }) as typeof fetch;
    expect(await planDeck(request, config, 'secret-key', fetcher, approved)).toEqual({ deck: planned, suggestedStyle: 'warm' });
  });

  it('retries a deck that rewrites a confirmed point then rejects it safely', async () => {
    const approved = outlineSchema.parse({ title: '时间序列', slides: [
      { id: 'cover', role: 'opening', layout: 'title', title: '时间序列', keyMessage: '从数据预测未来' },
      { id: 'data', role: 'point', layout: 'title_body', title: '数据', keyMessage: '必须保留的观点' },
      { id: 'process', role: 'summary', layout: 'process', title: '过程', keyMessage: '准备历史数据' },
    ] });
    let calls = 0;
    const fetcher = (async () => { calls++; return reply(JSON.stringify(deck)); }) as typeof fetch;
    await expect(planDeck(request, config, 'secret-key', fetcher, approved)).rejects.toThrow(/两次/);
    expect(calls).toBe(2);
  });

  it('does not retry authentication/network errors', async () => {
    let calls = 0;
    const fetcher = (async () => { calls++; return new Response('denied', { status: 401 }); }) as typeof fetch;
    await expect(planDeck(request, config, 'secret-key', fetcher)).rejects.toThrow(/401/);
    expect(calls).toBe(1);
  });
});
