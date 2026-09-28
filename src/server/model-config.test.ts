import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { modelInputSchema, loadSettings, saveSettings, resolveKey } from './model-config';

const input = { name: 'Work', protocol: 'openai', baseUrl: 'https://api.example.com/v1', modelId: 'demo', keyAlias: 'WORK' };
const dirs: string[] = [];
async function file() { const dir = await mkdtemp(join(tmpdir(), 'slideagent-')); dirs.push(dir); return join(dir, 'data', 'model-configs.json'); }
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe('model configuration', () => {
  it.each(['openai', 'anthropic', 'gemini'])('accepts %s and third-party HTTPS endpoints', (protocol) => {
    expect(modelInputSchema.parse({ ...input, protocol }).baseUrl).toBe(input.baseUrl);
  });
  it.each(['http://localhost:11434/v1', 'http://127.0.0.1:1234/v1', 'http://[::1]:8080/v1'])('allows local HTTP %s', (baseUrl) => {
    expect(modelInputSchema.safeParse({ ...input, baseUrl }).success).toBe(true);
  });
  it.each(['http://192.168.1.10/v1', 'http://example.com/v1', 'ftp://example.com/v1', 'https://user:pass@example.com/v1', 'https://example.com/v1?q=x', 'https://example.com/v1#x'])('rejects unsafe URL %s', (baseUrl) => {
    expect(modelInputSchema.safeParse({ ...input, baseUrl }).success).toBe(false);
  });
  it('rejects direct secrets and arbitrary environment variable names', () => {
    expect(modelInputSchema.safeParse({ ...input, apiKey: 'secret' }).success).toBe(false);
    expect(modelInputSchema.safeParse({ ...input, keyAlias: 'HOME' }).success).toBe(true);
    expect(() => resolveKey('../HOME', { NODE_ENV: 'test', HOME: 'private' })).toThrow();
    expect(() => resolveKey('WORK', { NODE_ENV: 'test', HOME: 'private' })).toThrow('SLIDEAGENT_API_KEY_WORK');
    expect(resolveKey('WORK', { NODE_ENV: 'test', SLIDEAGENT_API_KEY_WORK: 'secret', HOME: 'private' })).toBe('secret');
  });
  it('persists only validated public config across reload and never the key', async () => {
    const path = await file();
    expect(await loadSettings(path)).toEqual({ activeId: null, models: [] });
    const settings = { activeId: 'a', models: [{ ...modelInputSchema.parse(input), id: 'a' }] };
    await saveSettings(path, settings);
    expect(await loadSettings(path)).toEqual(settings);
    expect(await readFile(path, 'utf8')).not.toContain('secret');
    expect(await readFile(path, 'utf8')).not.toContain('apiKey');
  });
  it('refuses corrupt, duplicated and stale disk settings', async () => {
    const path = await file();
    await saveSettings(path, { activeId: null, models: [] });
    await writeFile(path, '{broken');
    await expect(loadSettings(path)).rejects.toThrow();
    await writeFile(path, JSON.stringify({ activeId: 'missing', models: [] }));
    await expect(loadSettings(path)).rejects.toThrow();
    const model = { ...input, id: 'a' };
    await writeFile(path, JSON.stringify({ activeId: 'a', models: [model, model] }));
    await expect(loadSettings(path)).rejects.toThrow();
  });
});
