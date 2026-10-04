import { describe, expect, it } from 'vitest';
import { deckSchema } from './deck';
import { demoDeck } from './demo';

// Removing any layout variant or weakening its content bounds should fail these checks.
describe('DeckSpec', () => {
  it('renders at most 100 semantic pages', () => {
    const page = { layout: 'title_body', title: '内容', bullets: ['观点'] };
    expect(deckSchema.safeParse({ title: '长文稿', slides: Array(100).fill(page) }).success).toBe(true);
    expect(deckSchema.safeParse({ title: '长文稿', slides: Array(101).fill(page) }).success).toBe(false);
  });
  it('accepts the five-slide demo with each supported layout', () => {
    expect(deckSchema.parse(demoDeck).slides.map((slide) => slide.layout)).toEqual([
      'title', 'title_body', 'three_cards', 'comparison', 'process',
    ]);
  });

  it('rejects missing content and unknown layouts', () => {
    expect(deckSchema.safeParse({ title: 'X', slides: [{ layout: 'other', title: 'X' }] }).success).toBe(false);
    expect(deckSchema.safeParse({ title: 'X', slides: [{ layout: 'title', title: '' }] }).success).toBe(false);
  });

  it('rejects overlong titles and non-three-card layouts', () => {
    expect(deckSchema.safeParse({ title: 'X', slides: [{ layout: 'title', title: '字'.repeat(61) }] }).success).toBe(false);
    expect(deckSchema.safeParse({ title: 'X', slides: [{ layout: 'three_cards', title: 'X', cards: [{ heading: 'A', body: 'B' }] }] }).success).toBe(false);
  });

  it('rejects absolute coordinates in semantic content', () => {
    expect(deckSchema.safeParse({ title: 'X', slides: [{ layout: 'title', title: 'X', x: 1 }] }).success).toBe(false);
  });

  it('accepts source-backed semantic pages and rejects missing evidence', () => {
    const timeline = { layout: 'timeline', title: '发展历程', takeaway: '稳步增长', events: [
      { date: '2022年', event: '项目启动', sourceQuote: '2022年项目启动' },
      { date: '2024年', event: '项目落地', sourceQuote: '2024年项目落地' },
    ] };
    const data = { layout: 'data_highlight', title: '重要数据', value: '10%', label: '增长率', takeaway: '增长显著', sourceQuote: '增长率达到10%' };
    expect(deckSchema.parse({ title: '报告', slides: [timeline, data] }).slides.map((slide) => slide.layout)).toEqual(['timeline', 'data_highlight']);
    expect(deckSchema.safeParse({ title: '报告', slides: [{ ...timeline, events: timeline.events.slice(0, 1) }] }).success).toBe(false);
    expect(deckSchema.safeParse({ title: '报告', slides: [{ ...timeline, events: [...timeline.events].reverse() }] }).success).toBe(false);
    expect(deckSchema.safeParse({ title: '报告', slides: [{ ...timeline, events: [{ ...timeline.events[0], sourceQuote: '' }, timeline.events[1]] }] }).success).toBe(false);
    expect(deckSchema.safeParse({ title: '报告', slides: [{ ...data, sourceQuote: undefined }] }).success).toBe(false);
    expect(deckSchema.safeParse({ title: '报告', slides: [{ ...data, x: 1 }] }).success).toBe(false);
    expect(deckSchema.safeParse(demoDeck).success).toBe(true);
  });
});
