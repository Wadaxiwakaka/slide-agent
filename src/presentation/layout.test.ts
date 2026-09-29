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
