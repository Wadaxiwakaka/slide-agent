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
  it('rejects malformed or cross-site HTTP requests before accessing settings', async () => {
    const malformed = new Request('http://127.0.0.1:3000/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
    expect((await POST(malformed)).status).toBe(400);
    const crossSite = new Request('http://127.0.0.1:3000/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify(body) });
    expect((await POST(crossSite)).status).toBe(403);
  });
});
