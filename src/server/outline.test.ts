import { describe, expect, it } from 'vitest';
import type { ModelConfig } from './model-config';
import { generationRequestSchema } from './planner';
import { InvalidOutlineError, planOutline } from './outline';

const config: ModelConfig = { id: 'one', name: 'Test', protocol: 'openai', baseUrl: 'https://api.example.com/v1', modelId: 'test', keyAlias: 'WORK' };
const cover = { id: 'cover', role: 'opening', layout: 'title', title: '项目', keyMessage: '了解项目' };
const point = { id: 'point', role: 'point', layout: 'title_body', title: '目标', keyMessage: '聚焦服务' };
const summary = { id: 'end', role: 'summary', layout: 'title_body', title: '结论', keyMessage: '稳步推进' };
const timeline = { id: 'history', role: 'evidence', layout: 'timeline', title: '历程', keyMessage: '持续推进', sourceQuotes: ['2022年项目启动', '2024年项目交付'] };
const request = generationRequestSchema.parse({ topic: '项目', sourceText: '2022年项目启动；2024年项目交付。', audience: '团队', purpose: '汇报', slideCount: 3, styleChoice: 'warm' });
const reply = (text: string) => Response.json({ choices: [{ message: { content: text } }] });

const expected = (slides: unknown[]) => ({ title: '项目', slides });

describe('narrative outline planner', () => {
  it.each([
    [1, [cover]],
    [3, [cover, point, summary]],
    [5, [cover, point, timeline, { ...point, id: 'second' }, summary]],
  ])('returns exactly %i validated pages and keeps their narrative roles', async (slideCount, slides) => {
    const fetcher = (async (_: RequestInfo | URL, init?: RequestInit) => {
      const prompt = JSON.parse(String(init?.body)).messages[0].content as string;
      for (const value of ['项目', '团队', '汇报', 'warm', String(slideCount), 'sourceQuotes']) expect(prompt).toContain(value);
      expect(prompt).not.toContain('secret-key');
      return reply(JSON.stringify(expected(slides)));
    }) as typeof fetch;
    const result = await planOutline({ ...request, slideCount }, config, 'secret-key', fetcher);
    expect(result.slides.map((page) => page.role)).toEqual(slideCount === 1 ? ['opening'] : slideCount === 3 ? ['opening', 'point', 'summary'] : ['opening', 'point', 'evidence', 'point', 'summary']);
    expect(result.slides).toHaveLength(slideCount);
  });

  it('retries once when model invents an unsupported evidence page', async () => {
    const noFacts = { ...request, sourceText: '只有项目概述' };
    let calls = 0;
    const fetcher = (async () => reply(JSON.stringify(expected(++calls === 1 ? [cover, timeline, summary] : [cover, point, summary])))) as typeof fetch;
    expect((await planOutline(noFacts, config, 'secret-key', fetcher)).slides[1].title).toBe('目标');
    expect(calls).toBe(2);
  });

  it('retries bad JSON exactly once and reports only a safe error after two failures', async () => {
    let calls = 0;
    const fetcher = (async () => reply(++calls === 1 ? 'sensitive-invalid-json' : JSON.stringify(expected([cover, point, summary])))) as typeof fetch;
    expect(await planOutline(request, config, 'secret-key', fetcher)).toEqual(expected([cover, point, summary]));
    expect(calls).toBe(2);
    const bad = (async () => reply('sensitive-invalid-json')) as typeof fetch;
    await expect(planOutline(request, config, 'secret-key', bad)).rejects.toBeInstanceOf(InvalidOutlineError);
    try { await planOutline(request, config, 'secret-key', bad); } catch (error) { expect(String(error)).not.toContain('sensitive'); }
  });

  it('never retries authentication failures', async () => {
    let calls = 0;
    const fetcher = (async () => { calls++; return new Response('secret-denied', { status: 401 }); }) as typeof fetch;
    await expect(planOutline(request, config, 'secret-key', fetcher)).rejects.toThrow(/401/);
    expect(calls).toBe(1);
  });
});
