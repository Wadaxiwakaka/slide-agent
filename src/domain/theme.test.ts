import { expect, it } from 'vitest';
import { defaultTheme, styleChoiceSchema, themeForStyle } from './theme';

function luminance(hex: string): number {
  const rgb = [0, 2, 4].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

it('keeps classic stable and dark legible', () => {
  expect(defaultTheme.styleId).toBe('classic');
  expect(defaultTheme.colors.primary).toBe('1667CF');
  expect(defaultTheme.colors.background).toBe('F7F9FC');
  expect(themeForStyle('classic')).toBe(defaultTheme);
  expect(themeForStyle('dark').colors.background).not.toBe(defaultTheme.colors.background);
  expect(themeForStyle('warm').colors.background).not.toBe(defaultTheme.colors.background);
  expect(themeForStyle('dark').colors.primary).not.toBe(themeForStyle('warm').colors.primary);
  for (const id of ['dark', 'warm'] as const) {
    const { ink, background } = themeForStyle(id).colors;
    expect(contrast(ink, background)).toBeGreaterThanOrEqual(4.5);
  }
});

it('accepts auto and the three named styles, rejecting unknown choices', () => {
  for (const choice of ['auto', 'classic', 'dark', 'warm']) expect(styleChoiceSchema.safeParse(choice).success).toBe(true);
  for (const choice of ['other', 'AUTO', '', null]) expect(styleChoiceSchema.safeParse(choice).success).toBe(false);
});
