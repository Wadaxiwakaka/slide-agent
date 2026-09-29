import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOutlineResponse } from '../../../server/create-outline';
import { createModel, selectModel } from '../../../server/manage-models';
import { POST } from './route';

const body = { topic: '项目', sourceText: '只是项目描述', audience: '团队', purpose: '介绍', slideCount: 2, styleChoice: 'warm' };
const outline = { title: '项目', slides: [
  { id: 'one', role: 'opening', layout: 'title', title: '项目', keyMessage: '概述' },
  { id: 'two', role: 'summary', layout: 'title_body', title: '总结', keyMessage: '值得推进' },
] };
const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', SLIDEAGENT_API_KEY_WORK: 'secret-value' };
const dirs: string[] = [];
async function configured() {
  const dir = await mkdtemp(join(tmpdir(), 'slideagent-outline-'));
  dirs.push(dir);
  const file = join(dir, 'data', 'model-configs.json');
  const model = await createModel(file, { name: 'Work', protocol: 'openai', baseUrl: 'https://api.example.com/v1', modelId: 'demo', keyAlias: 'WORK' });
  await selectModel(file, model.id);
  return file;
}
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
const fake = (content: string, status = 200) => (async () => status === 200
  ? Response.json({ choices: [{ message: { content } }] })
  : new Response('provider echoes secret-value', { status })) as typeof fetch;

describe('local outline API', () => {
  it('returns a validated outline without revealing configuration or key', async () => {
    const file = await configured();
    const response = await createOutlineResponse(body, file, fake(JSON.stringify(outline)), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outline });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects malformed fields and missing model/key before any network request', async () => {
    const file = await configured();
    let calls = 0;
    const fetcher = (async () => { calls++; return Response.json({ choices: [{ message: { content: JSON.stringify(outline) } }] }); }) as typeof fetch;
    for (const bad of [{ ...body, slideCount: 11 }, { ...body, styleChoice: 'neon' }, { ...body, leaked: 'secret' }]) {
      expect((await createOutlineResponse(bad, file, fetcher, env)).status).toBe(400);
    }
    await selectModel(file, null);
    expect((await createOutlineResponse(body, file, fetcher, env)).status).toBe(400);
    const other = await createModel(file, { name: 'Other', protocol: 'openai', baseUrl: 'https://api.example.com/v1', modelId: 'other', keyAlias: 'OTHER' });
    await selectModel(file, other.id);
    expect((await createOutlineResponse(body, file, fetcher, env)).status).toBe(400);
    expect(calls).toBe(0);
  });

  it('safely maps invalid model output to 422 and authentication errors to 502', async () => {
    const file = await configured();
    for (const [fetcher, status] of [[fake('secret-source-not-json'), 422], [fake('', 401), 502]] as const) {
      const response = await createOutlineResponse(body, file, fetcher, env);
      expect(response.status).toBe(status);
      expect(response.headers.get('content-type')).toContain('application/json');
      const text = await response.text();
      expect(text).not.toContain('secret-value');
      expect(text).not.toContain('secret-source-not-json');
    }
  });

  it('returns 502 without raw network errors when the model is unreachable', async () => {
    const response = await createOutlineResponse(body, await configured(), (async () => { throw new Error('secret network detail'); }) as typeof fetch, env);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('secret network detail');
  });

  it('rejects malformed or cross-site HTTP requests before accessing local settings', async () => {
    const url = 'http://127.0.0.1:3000/api/outline';
    const malformed = new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
    expect((await POST(malformed)).status).toBe(400);
    const crossSite = new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify(body) });
    expect((await POST(crossSite)).status).toBe(403);
  });
});
