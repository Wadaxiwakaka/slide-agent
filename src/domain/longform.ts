import { z } from 'zod';
import { styleChoiceSchema } from './theme';

export const densitySchema = z.enum(['concise', 'detailed']);
export const longformRequestSchema = z.strictObject({
  topic: z.string().trim().max(200).default(''),
  sourceText: z.string().max(200_000).refine((value) => Boolean(value.trim()), '请提供原始材料'),
  audience: z.string().trim().min(1).max(120).default('普通听众'),
  purpose: z.string().trim().min(1).max(120).default('介绍主题'),
  slideCount: z.number().int().min(1).max(100),
  styleChoice: styleChoiceSchema.default('classic'),
  density: densitySchema.default('concise'),
});
export type LongformRequest = z.infer<typeof longformRequestSchema>;
