import { z } from 'zod';
import { outlineSchema, type Outline } from '../domain/outline';
import { assertEvidence } from './evidence';
import { callModel } from './model-api';
import type { ModelConfig } from './model-config';
import { generationRequestSchema, type GenerationRequest } from './planner';

export class InvalidOutlineError extends Error {}

export async function planOutline(input: GenerationRequest, config: ModelConfig, key: string, fetcher: typeof fetch = fetch): Promise<Outline> {
  const request = generationRequestSchema.parse(input);
  const prompt = JSON.stringify({
    task: '规划演示文稿叙事大纲，仅返回符合 schema 的 JSON 对象；不要 Markdown、坐标或外部知识。',
    requirements: request,
    rules: `严格 ${request.slideCount} 页，首张 opening/title；其余页面按页数安排论点、材料依据（材料中确有事实时）与总结，短演示不强制凑四种角色。每页标题与一句核心观点，稳定且唯一的 id。没有日期事件、数值含义的原始片段时禁止 timeline/data_highlight，也不要生成 evidence 角色；所有依据片段须直接复制用户材料。不能补造日期、数字或事实。`,
    schema: z.toJSONSchema(outlineSchema),
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const output = await callModel(config, key, attempt ? `${prompt}\n上次大纲不符合结构、页数或原文来源；请只返回修正后的 JSON。` : prompt, fetcher);
    try {
      const outline = outlineSchema.parse(JSON.parse(output));
      if (outline.slides.length !== request.slideCount) continue;
      assertEvidence(outline, `${request.topic}\n${request.sourceText}`);
      return outline;
    } catch { /* Only model content errors retry. Connection/auth errors are outside this block. */ }
  }
  throw new InvalidOutlineError('模型两次输出的大纲不符合页数或材料依据，请补充原文或更换模型后重试（可能产生两次调用费用）');
}
