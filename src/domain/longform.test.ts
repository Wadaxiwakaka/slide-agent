import { describe, expect, it } from 'vitest';
import { longformRequestSchema } from './longform';
import { generationRequestSchema } from '../server/planner';

// Catches accidental legacy boundary expansion and invalid/oversized material jobs.
describe('material long-form requests', () => {
  it('accepts 100 pages and the exact UTF-16 source boundary', () => {
    expect(longformRequestSchema.parse({ sourceText: '材'.repeat(200_000), slideCount: 100 }).density).toBe('concise');
    expect(longformRequestSchema.parse({ sourceText: '材料', slideCount: 5, density: 'detailed' }).density).toBe('detailed');
  });
  it.each([
    { sourceText: '材料', slideCount: 101 }, { sourceText: '材料', slideCount: 0 },
    { sourceText: ' ', slideCount: 5 }, { sourceText: '材'.repeat(200_001), slideCount: 5 },
    { sourceText: '材料', slideCount: 5, x: 1 }, { sourceText: '材料', slideCount: 5, density: 'unknown' },
  ])('rejects an unsafe material request', (input) => { expect(longformRequestSchema.safeParse(input).success).toBe(false); });
  it('keeps legacy requests within their original bounds', () => {
    expect(generationRequestSchema.safeParse({ topic: '主题', slideCount: 11 }).success).toBe(false);
    expect(generationRequestSchema.safeParse({ sourceText: '材'.repeat(20_001), slideCount: 5 }).success).toBe(false);
    expect(generationRequestSchema.safeParse({ topic: '主题', slideCount: 10 }).success).toBe(true);
  });
});
