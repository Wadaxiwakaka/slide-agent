import { z } from 'zod';
import { callModel } from '../model-api';
import type { ModelConfig } from '../model-config';

export const sourceChunkSchema = z.strictObject({ start: z.number().int().nonnegative(), end: z.number().int().positive(), text: z.string().min(1).max(5_000) }).refine((c) => c.end - c.start === c.text.length);
export const sourceDigestSchema = z.strictObject({ summary: z.string().trim().min(1).max(1_200), sourceRange: z.tuple([z.number().int().nonnegative(), z.number().int().positive()]) }).refine((d) => d.sourceRange[1] > d.sourceRange[0]);
export type SourceChunk = z.infer<typeof sourceChunkSchema>;
export type SourceDigest = z.infer<typeof sourceDigestSchema>;

export function splitSource(source: string, maxChars = 5_000): SourceChunk[] {
  if (!Number.isInteger(maxChars) || maxChars < 2 || maxChars > 5_000) throw new Error('材料分块长度无效');
  const chunks: SourceChunk[] = [];
  for (let start = 0; start < source.length;) {
    let end = Math.min(start + maxChars, source.length);
    if (end < source.length) {
      const segment = source.slice(start, end);
      const paragraph = [...segment.matchAll(/\r?\n\r?\n|\r?\n(?=#)/g)].at(-1);
      if (paragraph && paragraph.index! + paragraph[0].length > 0) end = start + paragraph.index! + paragraph[0].length;
      if (/[\uD800-\uDBFF]/.test(source[end - 1]) && /[\uDC00-\uDFFF]/.test(source[end])) end--;
    }
    chunks.push({ start, end, text: source.slice(start, end) }); start = end;
  }
  return chunks;
}

const summarySchema = z.strictObject({ summary: z.string().trim().min(1).max(1_200) });
async function digest(prompt: unknown, range: [number, number], config: ModelConfig, key: string, fetcher: typeof fetch): Promise<SourceDigest> {
  const request = JSON.stringify({ task: '归纳材料，仅返回 JSON {summary}，最多1200字符；不要外部知识、坐标或补造事实；摘要不是原文证据。', input: prompt, schema: z.toJSONSchema(summarySchema) });
  for (let attempt = 0; attempt < 2; attempt++) {
    const output = await callModel(config, key, request + (attempt ? '\n上次结构不合格，请修正。' : ''), fetcher);
    try { return { ...summarySchema.parse(JSON.parse(output)), sourceRange: range }; } catch { /* Content only retries. */ }
  }
  throw new Error('模型两次材料摘要无效，请更换模型或缩短材料');
}
export async function summarizeChunk(chunk: SourceChunk, config: ModelConfig, key: string, fetcher: typeof fetch = fetch): Promise<SourceDigest> {
  const valid = sourceChunkSchema.parse(chunk);
  return digest(valid.text, [valid.start, valid.end], config, key, fetcher);
}
export async function mergeDigests(digests: SourceDigest[], config: ModelConfig, key: string, fetcher: typeof fetch = fetch): Promise<SourceDigest> {
  const valid = z.array(sourceDigestSchema).min(1).max(8).parse(digests);
  if (valid.some((d, i) => i > 0 && d.sourceRange[0] !== valid[i - 1].sourceRange[1])) throw new Error('材料摘要区间不连续');
  return digest(valid, [valid[0].sourceRange[0], valid.at(-1)!.sourceRange[1]], config, key, fetcher);
}
