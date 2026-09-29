import { z } from 'zod';
import { datesInOrder, type SlideSpec } from './deck';

const quote = z.string().trim().min(1).max(200);
const slide = z.strictObject({
  id: z.string().trim().min(1).max(80),
  role: z.enum(['opening', 'point', 'evidence', 'summary']),
  layout: z.enum(['title', 'title_body', 'three_cards', 'comparison', 'process', 'timeline', 'data_highlight'] satisfies SlideSpec['layout'][]),
  title: z.string().trim().min(1).max(60),
  keyMessage: z.string().trim().min(1).max(110),
  sourceQuotes: z.array(quote).max(5).optional(),
}).superRefine((page, context) => {
  const quotes = page.sourceQuotes ?? [];
  const minimum = page.layout === 'timeline' ? 2 : page.layout === 'data_highlight' || page.role === 'evidence' ? 1 : 0;
  if (quotes.length < minimum || (minimum === 0 && quotes.length > 0) || new Set(quotes).size !== quotes.length) {
    context.addIssue({ code: 'custom', message: '页面来源片段无效' });
  }
  // ponytail: deliberately narrow explicit-date recognition; relative or written-out dates need ordinary pages.
  if (page.layout === 'timeline' && (quotes.some((value) => !/(?:\d{4}年?|\d{4}[-/.]\d{1,2}|\d{1,2}月\d{1,2}日)/.test(value) || !hasContext(value)) || !datesInOrder(quotes))) {
    context.addIssue({ code: 'custom', message: '时间轴必须包含明确且按顺序排列的日期与事件原文' });
  }
  if (page.layout === 'data_highlight' && quotes.some((value) => !/\d/.test(value) || !hasContext(value))) {
    context.addIssue({ code: 'custom', message: '数据页面需要原始数值和含义' });
  }
});

function hasContext(value: string): boolean {
  return value.replace(/\d+(?:[-/.年月日]\d+)*/g, '').replace(/[\s%年月日,.，。:：;；-]/g, '').length > 0;
}

export const outlineSchema = z.strictObject({
  title: z.string().trim().min(1).max(60),
  slides: z.array(slide).min(1).max(10),
}).superRefine(({ slides }, context) => {
  if (slides[0].role !== 'opening' || slides[0].layout !== 'title' || slides.slice(1).some((page) => page.layout === 'title' || page.role === 'opening') ||
    new Set(slides.map((page) => page.id)).size !== slides.length) {
    context.addIssue({ code: 'custom', message: '大纲封面、页序或标识无效' });
  }
});

export type Outline = z.infer<typeof outlineSchema>;
