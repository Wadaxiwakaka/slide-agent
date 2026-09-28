import { z } from 'zod';
import { deckSchema, type DeckSpec } from '../domain/deck';
import { callModel } from './model-api';
import type { ModelConfig } from './model-config';

export const generationRequestSchema = z.strictObject({
  topic: z.string().trim().max(200).default(''),
  sourceText: z.string().trim().max(20_000).default(''),
  audience: z.string().trim().min(1).max(120).default('普通听众'),
  purpose: z.string().trim().min(1).max(120).default('介绍主题'),
  slideCount: z.number().int().min(1).max(10),
}).refine(({ topic, sourceText }) => Boolean(topic || sourceText), '请提供主题或原始文本');
export type GenerationRequest = z.infer<typeof generationRequestSchema>;
export class InvalidDeckError extends Error {}

export async function planDeck(input: GenerationRequest, config: ModelConfig, key: string, fetcher: typeof fetch = fetch): Promise<DeckSpec> {
  const request = generationRequestSchema.parse(input);
  const prompt = JSON.stringify({
    task: '生成一个演示文稿；仅返回 JSON 对象，不要 Markdown 或说明。不得输出绝对坐标 x/y/w/h。',
    requirements: request,
    rules: `恰好 ${request.slideCount} 页；第一页必须是 title；其他页只从 title_body、three_cards、comparison、process 中选择。内容精炼，每页聚焦一个信息。`,
    schema: z.toJSONSchema(deckSchema),
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const output = await callModel(config, key, attempt ? `${prompt}\n之前输出不符合 schema 或页数要求，请重新给出严格的 JSON。` : prompt, fetcher);
    try {
      const deck = deckSchema.parse(JSON.parse(output));
      if (deck.slides.length === request.slideCount && deck.slides[0].layout === 'title') return deck;
    } catch { /* One same-model retry for invalid JSON/schema only. */ }
  }
  throw new InvalidDeckError('模型两次输出均不符合演示文稿结构或页数要求，可能产生两次调用费用');
}
