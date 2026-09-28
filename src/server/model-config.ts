import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';

const alias = z.string().regex(/^[A-Z][A-Z0-9_]*$/).max(64);
const baseUrl = z.url().refine((raw) => {
  const url = new URL(raw);
  return !url.username && !url.password && !url.search && !url.hash &&
    (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
}, 'Use HTTPS or a local HTTP endpoint, without credentials, query or fragment');

export const modelInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(60),
  protocol: z.enum(['openai', 'anthropic', 'gemini']),
  baseUrl,
  modelId: z.string().trim().min(1).max(120),
  keyAlias: alias,
});
export type ModelInput = z.infer<typeof modelInputSchema>;
export type ModelConfig = ModelInput & { id: string };
export type Settings = { activeId: string | null; models: ModelConfig[] };

const modelSchema = modelInputSchema.safeExtend({ id: z.string().min(1) });
const settingsSchema = z.strictObject({ activeId: z.string().nullable(), models: z.array(modelSchema) }).refine(
  ({ models, activeId }) => new Set(models.map((model) => model.id)).size === models.length &&
    (activeId === null || models.some((model) => model.id === activeId)),
  'Duplicate model IDs or missing selected model',
);

export const settingsFile = join(process.cwd(), 'data', 'model-configs.json');

export async function loadSettings(filePath: string): Promise<Settings> {
  try {
    return settingsSchema.parse(JSON.parse(await readFile(filePath, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { activeId: null, models: [] };
    throw error;
  }
}

export async function saveSettings(filePath: string, settings: Settings): Promise<void> {
  const validated = settingsSchema.parse(settings);
  await mkdir(dirname(filePath), { recursive: true });
  const temp = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(validated, null, 2), { mode: 0o600 });
    await rename(temp, filePath);
  } finally {
    await unlink(temp).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
  }
}

export function resolveKey(keyAlias: string, env: NodeJS.ProcessEnv = process.env): string {
  const name = `SLIDEAGENT_API_KEY_${alias.parse(keyAlias)}`;
  const key = env[name];
  if (!key) throw new Error(`请在运行环境中设置 ${name}`);
  return key;
}
