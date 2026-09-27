import { describe, expect, it } from 'vitest';
import { deckSchema } from './deck';
import { demoDeck } from './demo';

// Removing any layout variant or weakening its content bounds should fail these checks.
describe('DeckSpec', () => {
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
});
