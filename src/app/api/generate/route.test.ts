import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { createGenerateResponse } from '../../../server/generate';
import { createModel, selectModel } from '../../../server/manage-models';
import { POST } from './route';

const body = { topic: '预测', audience: '学生', purpose: '入门', slideCount: 3 };
const deck = { title: '预测', slides: [
  { layout: 'title', title: '预测', subtitle: '介绍' },
  { layout: 'title_body', title: '方法', bullets: ['数据', '模型'] },
  { layout: 'three_cards', title: '应用', cards: [{ heading: 'A', body: '甲' }, { heading: 'B', body: '乙' }, { heading: 'C', body: '丙' }] },
] };
const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', SLIDEAGENT_API_KEY_WORK: 'secret-value' };
const dirs: string[] = [];
async function configured() {
  const dir = await mkdtemp(join(tmpdir(), 'slideagent-generate-'));
  dirs.push(dir);
  const file = join(dir, 'data', 'model-configs.json');
  const model = await createModel(file, { name: 'Work', protocol: 'openai', baseUrl: 'https://api.example.com/v1', modelId: 'demo', keyAlias: 'WORK' });
  await selectModel(file, model.id);
  return file;
}
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

const fake = (content: string, status = 200) => (async () => status === 200
  ? Response.json({ choices: [{ message: { content } }] })
  : new Response(`provider echoes ${env.SLIDEAGENT_API_KEY_WORK}`, { status })) as typeof fetch;

describe('PPTX generation API', () => {
  it('returns three real editable slides, not a mislabeled error payload', async () => {
    const response = await createGenerateResponse(body, await configured(), fake(JSON.stringify(deck)), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
    expect(response.headers.get('content-disposition')).toContain('slide-agent-generated.pptx');
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const paths = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    expect(paths).toHaveLength(3);
    for (const path of paths) {
      const xml = await zip.file(path)!.async('string');
      expect(xml).toContain('<a:t>');
      expect(xml).toContain('<p:sp>');
    }
  });
  it('renders the manual style, not the model suggestion', async () => {
    const file = await configured();
    const modelReply = fake(JSON.stringify({ deck, styleId: 'dark' }));
    const warm = await createGenerateResponse({ ...body, styleChoice: 'warm' }, file, modelReply, env);
    const dark = await createGenerateResponse({ ...body, styleChoice: 'auto' }, file, modelReply, env);
    expect(warm.status).toBe(200);
    expect(warm.headers.get('X-SlideAgent-Style')).toBe('warm');
    expect(warm.headers.has('X-SlideAgent-Style-Fallback')).toBe(false);
    expect(dark.headers.get('X-SlideAgent-Style')).toBe('dark');
    const warmZip = await JSZip.loadAsync(await warm.arrayBuffer());
    const darkZip = await JSZip.loadAsync(await dark.arrayBuffer());
    const warmXml = await warmZip.file('ppt/slides/slide1.xml')!.async('string');
    const darkXml = await darkZip.file('ppt/slides/slide1.xml')!.async('string');
    expect(warmXml).toContain('FFF8EC');
    expect(darkXml).toContain('0B1224');
    expect(warmXml).toContain('<a:t>');
    expect(warmXml).toContain('<p:sp>');
    expect(warmXml).not.toBe(darkXml);
  });
  it('falls back to classic without charging for another call when only the style is invalid', async () => {
    const file = await configured();
    for (const content of [JSON.stringify(deck), JSON.stringify({ deck, styleId: 'neon' })]) {
      let calls = 0;
      const fetcher = (async () => { calls++; return Response.json({ choices: [{ message: { content } }] }); }) as typeof fetch;
      const response = await createGenerateResponse({ ...body, styleChoice: 'auto' }, file, fetcher, env);
      expect(response.status).toBe(200);
      expect(response.headers.get('X-SlideAgent-Style')).toBe('classic');
      expect(response.headers.get('X-SlideAgent-Style-Fallback')).toBe('1');
      expect(calls).toBe(1);
    }
    const legacy = await createGenerateResponse(body, file, fake(JSON.stringify(deck)), env);
    expect(legacy.headers.get('X-SlideAgent-Style')).toBe('classic');
    expect(legacy.headers.has('X-SlideAgent-Style-Fallback')).toBe(false);
  });
  it('rejects unknown style or extra fields before calling the model', async () => {
    const file = await configured();
    let calls = 0;
    const fetcher = (async () => { calls++; return Response.json({ choices: [{ message: { content: JSON.stringify(deck) } }] }); }) as typeof fetch;
    for (const invalid of [{ ...body, styleChoice: 'neon' }, { ...body, extra: 'ignored?' }]) {
      const response = await createGenerateResponse(invalid, file, fetcher, env);
      expect(response.status).toBe(400);
      expect(response.headers.get('content-type')).toContain('application/json');
    }
    expect(calls).toBe(0);
  });
  it('returns a safe JSON error instead of a PPTX for unfit text', async () => {
    const file = await configured();
    const dense = { ...deck, slides: [deck.slides[0], deck.slides[1], { layout: 'process', title: '流程', steps: Array.from({ length: 5 }, (_, i) => ({ heading: `步骤${i + 1}`, detail: '长'.repeat(110) })) }] };
    const response = await createGenerateResponse({ ...body, styleChoice: 'warm' }, file, fake(JSON.stringify({ deck: dense, styleId: 'dark' })), env);
    expect(response.status).toBe(422);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.has('X-SlideAgent-Style')).toBe(false);
    expect(await response.text()).toContain('文字');
  });
  it('requires an active model, env key and valid generation input', async () => {
    const file = await configured();
    await selectModel(file, null);
    const none = await createGenerateResponse(body, file, fake(JSON.stringify(deck)), env);
    expect(none.status).toBe(400);
    expect(await none.text()).toContain('未选择模型');
    await selectModel(file, (await createModel(file, { name: 'Other', protocol: 'openai', baseUrl: 'https://other.example.com/v1', modelId: 'other', keyAlias: 'OTHER' })).id);
    const missing = await createGenerateResponse(body, file, fake(JSON.stringify(deck)), env);
    expect(missing.status).toBe(400);
    expect(await missing.text()).toContain('SLIDEAGENT_API_KEY_OTHER');
    const invalid = await createGenerateResponse({ ...body, slideCount: 11 }, file, fake(JSON.stringify(deck)), env);
    expect(invalid.status).toBe(400);
  });
  it('does not echo keys or provider errors on failure, or return a PPTX', async () => {
    const file = await configured();
    for (const [fetcher, status] of [[fake('irrelevant', 401), 502], [fake('not-json'), 422]] as const) {
      const response = await createGenerateResponse(body, file, fetcher, env);
      expect(response.status).toBe(status);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(await response.text()).not.toContain('secret-value');
    }
  });
  it('generates PPTX in the exact edited outline order without losing key messages', async () => {
    const outline = { title: '预测', slides: [
      { id: 'cover', role: 'opening', layout: 'title', title: '新的封面', keyMessage: '概述' },
      { id: 'second', role: 'point', layout: 'title_body', title: '调整后的第一页', keyMessage: '必须出现乙' },
      { id: 'first', role: 'summary', layout: 'title_body', title: '调整后的第二页', keyMessage: '必须出现甲' },
    ] };
    const planned = { title: '预测', slides: [
      { layout: 'title', title: '新的封面', subtitle: '概述' },
      { layout: 'title_body', title: '调整后的第一页', bullets: ['必须出现乙'] },
      { layout: 'title_body', title: '调整后的第二页', bullets: ['必须出现甲'] },
    ] };
    const response = await createGenerateResponse({ input: { ...body, styleChoice: 'warm' }, outline }, await configured(), fake(JSON.stringify({ deck: planned, styleId: 'dark' })), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('X-SlideAgent-Style')).toBe('warm');
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    for (const [number, values] of [[1, ['新的封面', '概述']], [2, ['调整后的第一页', '必须出现乙']], [3, ['调整后的第二页', '必须出现甲']]] as const) {
      const xml = await zip.file(`ppt/slides/slide${number}.xml`)!.async('string');
      for (const value of values) expect(xml).toContain(value);
      expect(xml).toContain('<p:sp>');
    }
  });

  it('rejects mismatched confirmation and unsupported facts before fetching or downloading', async () => {
    const file = await configured();
    const outline = { title: '预测', slides: [
      { id: 'cover', role: 'opening', layout: 'title', title: '预测', keyMessage: '介绍' },
      { id: 'two', role: 'point', layout: 'title_body', title: '方法', keyMessage: '数据' },
      { id: 'three', role: 'summary', layout: 'three_cards', title: '应用', keyMessage: '甲' },
    ] };
    let calls = 0;
    const fetcher = (async () => { calls++; return Response.json({ choices: [{ message: { content: JSON.stringify(deck) } }] }); }) as typeof fetch;
    const bad = [
      { ...outline, slides: [{ ...outline.slides[0], title: '长'.repeat(61) }, ...outline.slides.slice(1)] },
      { ...outline, slides: [{ ...outline.slides[0], keyMessage: '2025年凭空增加' }, ...outline.slides.slice(1)] },
      { ...outline, slides: [outline.slides[0], { id: 'two', role: 'evidence', layout: 'data_highlight', title: '增长', keyMessage: '很重要', sourceQuotes: ['增长率达到10%'] }, outline.slides[2]] },
    ];
    for (const edited of bad) {
      const response = await createGenerateResponse({ input: body, outline: edited }, file, fetcher, env);
      expect(response.status).toBe(400);
      expect(response.headers.get('content-type')).toContain('application/json');
    }
    expect(calls).toBe(0);
    const invalidOutput = await createGenerateResponse({ input: body, outline }, file, fake(JSON.stringify({ ...deck, slides: [{ ...deck.slides[0], title: '旧标题' }, ...deck.slides.slice(1)] })), env);
    expect(invalidOutput.status).toBe(422);
    expect(invalidOutput.headers.get('content-type')).toContain('application/json');
  });

  it('rejects malformed or cross-site HTTP requests before accessing settings', async () => {
    const malformed = new Request('http://127.0.0.1:3000/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
    expect((await POST(malformed)).status).toBe(400);
    const crossSite = new Request('http://127.0.0.1:3000/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify(body) });
    expect((await POST(crossSite)).status).toBe(403);
  });
});
