import { describe, expect, it } from 'vitest';
import { demoDeck } from '../domain/demo';
import { deckSchema, type SlideSpec } from '../domain/deck';
import { defaultTheme, themeForStyle } from '../domain/theme';
import { assertWithinSlide, LayoutOverflowError, layoutSlide, type Element } from './layout';

describe('deterministic layout', () => {
  it('places every demo layout within a 16:9 slide', () => {
    for (const slide of demoDeck.slides) {
      const elements = layoutSlide(slide, defaultTheme);
      expect(elements.length).toBeGreaterThan(1);
      expect(elements.some((element) => element.kind === 'text' && element.value === slide.title)).toBe(true);
      expect(() => assertWithinSlide(elements, defaultTheme)).not.toThrow();
    }
  });

  it('returns the same geometry for the same content and theme', () => {
    const slide = demoDeck.slides[2];
    expect(layoutSlide(slide, defaultTheme)).toEqual(layoutSlide(slide, defaultTheme));
  });

  it('changes geometry in each existing layout without changing the classic demo', () => {
    const geometry = (elements: Element[]) => elements.map(({ x, y, w, h }) => [x, y, w, h]);
    for (const slide of demoDeck.slides) {
      const classic = layoutSlide(slide, defaultTheme);
      const dark = layoutSlide(slide, themeForStyle('dark'));
      const warm = layoutSlide(slide, themeForStyle('warm'));
      expect(dark).toEqual(layoutSlide(slide, themeForStyle('dark')));
      expect(() => assertWithinSlide(dark, themeForStyle('dark'))).not.toThrow();
      expect(() => assertWithinSlide(warm, themeForStyle('warm'))).not.toThrow();
      expect(geometry(dark)).not.toEqual(geometry(classic));
      expect(geometry(warm)).not.toEqual(geometry(classic));
      expect(geometry(dark)).not.toEqual(geometry(warm));
    }
    expect(layoutSlide(demoDeck.slides[0], defaultTheme)[0].x).toBe(0.7);
    expect(layoutSlide(demoDeck.slides[2], defaultTheme).find((element) => element.kind === 'rect' && element.h === 3.78)?.x).toBe(0.7);
  });

  it('rejects an overfull but schema-valid process slide in every style', () => {
    for (const detail of ['长'.repeat(110), 'Word'.repeat(27)]) {
      const dense: SlideSpec = { layout: 'process', title: '流程', steps: Array.from({ length: 5 }, (_, i) => ({ heading: `步骤${i + 1}`, detail })) };
      expect(deckSchema.safeParse({ title: '流程', slides: [dense] }).success).toBe(true);
      for (const id of ['classic', 'dark', 'warm'] as const) {
        expect(() => layoutSlide(dense, themeForStyle(id))).toThrow(LayoutOverflowError);
      }
    }
  });

  it('rejects an unbreakable English word even when line count alone looks short', () => {
    const slide: SlideSpec = { layout: 'process', title: '流程', steps: [
      { heading: '输入', detail: 'W'.repeat(110) }, { heading: '输出', detail: '短内容' },
    ] };
    expect(() => layoutSlide(slide, themeForStyle('warm'))).toThrow(LayoutOverflowError);
  });

  it('keeps fitting Chinese and English content intact and readable', () => {
    const bullets = ['一段有信息量但仍适合单页展示的中文说明', 'An explanatory English sentence with a readable length and clear structure'];
    const slide: SlideSpec = { layout: 'title_body', title: '内容', bullets };
    for (const id of ['classic', 'dark', 'warm'] as const) {
      const texts = layoutSlide(slide, themeForStyle(id)).filter((element) => element.kind === 'text');
      for (const bullet of bullets) expect(texts.some((element) => element.value === bullet)).toBe(true);
      expect(texts.every((element) => element.size >= 14)).toBe(true);
      for (const demo of demoDeck.slides) expect(() => layoutSlide(demo, themeForStyle(id))).not.toThrow();
    }
  });

  it('places evidence pages deterministically with editable content in three distinct themes', () => {
    const slides: Extract<SlideSpec, { layout: 'timeline' | 'data_highlight' }>[] = [
      { layout: 'timeline', title: '历程', takeaway: '项目持续推进', events: [
        { date: '2022年', event: '启动', sourceQuote: '2022年启动' },
        { date: '2024年', event: '落地', sourceQuote: '2024年落地' },
      ] },
      { layout: 'data_highlight', title: '增长', value: '10%', label: '增长率', takeaway: '增长显著', sourceQuote: '增长率达到10%' },
    ];
    for (const slide of slides) {
      const geometries: string[] = [];
      for (const id of ['classic', 'dark', 'warm'] as const) {
        const theme = themeForStyle(id);
        const elements = layoutSlide(slide, theme);
        expect(elements).toEqual(layoutSlide(slide, theme));
        expect(() => assertWithinSlide(elements, theme)).not.toThrow();
        const visible = elements.filter((element) => element.kind === 'text').map((element) => element.value);
        const expected = slide.layout === 'timeline'
          ? [slide.title, slide.takeaway, ...slide.events.flatMap((event) => [event.date, event.event])]
          : [slide.title, slide.value, slide.label, slide.takeaway];
        for (const item of expected) expect(visible).toContain(item);
        expect(visible).not.toContain(slide.layout === 'timeline' ? slide.events[0].sourceQuote : slide.sourceQuote);
        geometries.push(JSON.stringify(elements.map(({ x, y, w, h }) => [x, y, w, h])));
      }
      expect(new Set(geometries).size).toBe(3);
    }
  });

  it('rejects dense five-event timelines rather than truncating content', () => {
    const slide: SlideSpec = { layout: 'timeline', title: '历程', takeaway: '摘要', events: Array.from({ length: 5 }, (_, index) => ({
      date: `202${index}年`, event: '难'.repeat(110), sourceQuote: `202${index}年发生事件`,
    })) };
    for (const id of ['classic', 'dark', 'warm'] as const) expect(() => layoutSlide(slide, themeForStyle(id)), id).toThrow(LayoutOverflowError);
  });

  it('does not overlap card surfaces', () => {
    const cards = layoutSlide(demoDeck.slides[2], defaultTheme).filter((el) => el.kind === 'rect' && el.h > 2);
    expect(cards).toHaveLength(3);
    expect(cards[0].x + cards[0].w).toBeLessThan(cards[1].x);
    expect(cards[1].x + cards[1].w).toBeLessThan(cards[2].x);
  });

  it.each([
    { kind: 'rect', x: Number.NaN, y: 0, w: 1, h: 1, fill: 'FFFFFF' },
    { kind: 'rect', x: 0, y: 0, w: 0, h: 1, fill: 'FFFFFF' },
    { kind: 'rect', x: 13, y: 0, w: 1, h: 1, fill: 'FFFFFF' },
    { kind: 'line', x: 0, y: -0.1, w: 1, h: 0.01, color: '000000' },
  ] as Element[])('rejects invalid or overflowing geometry %#', (element) => {
    expect(() => assertWithinSlide([element], defaultTheme)).toThrow();
  });
});
