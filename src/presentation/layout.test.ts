import { describe, expect, it } from 'vitest';
import { demoDeck } from '../domain/demo';
import { defaultTheme } from '../domain/theme';
import { assertWithinSlide, layoutSlide, type Element } from './layout';

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
