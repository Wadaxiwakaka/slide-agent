import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configError, createModel, editModel, listModels, removeModel, selectModel, testModelConnection } from './manage-models';
import { loadSettings } from './model-config';
import { POST } from '../app/api/models/route';

const inputs = (name: string) => ({ name, protocol: 'openai', baseUrl: `https://${name.toLowerCase()}.example.com/v1`, modelId: name, keyAlias: name.toUpperCase() });
const dirs: string[] = [];
async function path() { const dir = await mkdtemp(join(tmpdir(), 'slideagent-config-')); dirs.push(dir); return join(dir, 'data', 'model-configs.json'); }
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe('local model management', () => {
  it('persists CRUD, selection and public key status without returning key values', async () => {
    const file = await path();
    const first = await createModel(file, inputs('First'));
    const second = await createModel(file, inputs('Second'));
    expect(first.id).not.toBe(second.id);
    await selectModel(file, second.id);
    expect(await listModels(file, { NODE_ENV: 'test', SLIDEAGENT_API_KEY_SECOND: 'private-secret' })).toMatchObject({
      activeId: second.id, models: [{ name: 'First', hasKey: false }, { name: 'Second', hasKey: true }],
    });
    expect(JSON.stringify(await listModels(file, { NODE_ENV: 'test', SLIDEAGENT_API_KEY_SECOND: 'private-secret' }))).not.toContain('private-secret');
    await editModel(file, first.id, { ...inputs('Renamed'), keyAlias: 'FIRST' });
    expect((await loadSettings(file)).models[0].name).toBe('Renamed');
    expect(await readFile(file, 'utf8')).not.toContain('private-secret');
    await removeModel(file, second.id);
    expect(await loadSettings(file)).toMatchObject({ activeId: null, models: [{ id: first.id }] });
    await expect(selectModel(file, second.id)).rejects.toThrow();
  });
  it('serializes simultaneous single-process writes rather than losing a new model', async () => {
    const file = await path();
    await Promise.all([createModel(file, inputs('First')), createModel(file, inputs('Second'))]);
    expect((await loadSettings(file)).models).toHaveLength(2);
  });
  it('tests only the active model, rejects missing alias and can clear selection', async () => {
    const file = await path();
    await createModel(file, inputs('First'));
    const second = await createModel(file, inputs('Second'));
    await selectModel(file, second.id);
    let calls = 0;
    const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      expect(String(url)).toBe('https://second.example.com/v1/chat/completions');
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer local-key' });
      return Response.json({ choices: [{ message: { content: 'OK' } }] });
    }) as typeof fetch;
    await expect(testModelConnection(file, fetcher, { NODE_ENV: 'test' })).rejects.toThrow('SLIDEAGENT_API_KEY_SECOND');
    await testModelConnection(file, fetcher, { NODE_ENV: 'test', SLIDEAGENT_API_KEY_SECOND: 'local-key' });
    expect(calls).toBe(1);
    await selectModel(file, null);
    await expect(testModelConnection(file, fetcher, { NODE_ENV: 'test', SLIDEAGENT_API_KEY_SECOND: 'local-key' })).rejects.toThrow('未选择模型');
    expect(calls).toBe(1);
  });
  it('reports provider authentication failures without reflecting raw response or key', async () => {
    const file = await path();
    const model = await createModel(file, inputs('First'));
    await selectModel(file, model.id);
    const fetcher = (async () => new Response('echo private-secret', { status: 401 })) as typeof fetch;
    try {
      await testModelConnection(file, fetcher, { NODE_ENV: 'test', SLIDEAGENT_API_KEY_FIRST: 'private-secret' });
      throw new Error('Expected failure');
    } catch (error) {
      const response = configError(error);
      expect(response.status).toBe(502);
      expect(await response.text()).toContain('401');
      expect(JSON.stringify(response.headers)).not.toContain('private-secret');
    }
  });
  it('rejects cross-origin or non-JSON config writes before touching disk', async () => {
    const crossSite = new Request('http://127.0.0.1:3000/api/models', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify(inputs('First')) });
    expect((await POST(crossSite)).status).toBe(403);
    const plain = new Request('http://127.0.0.1:3000/api/models', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(inputs('First')) });
    expect((await POST(plain)).status).toBe(415);
    const malformed = new Request('http://127.0.0.1:3000/api/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' });
    expect((await POST(malformed)).status).toBe(400);
  });
});
