import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { demoDeck } from '../domain/demo';
import { themeForStyle } from '../domain/theme';
import { renderDeck } from './render';

describe('editable PPTX export', () => {
  it('generates a five-slide OOXML package with editable text and shapes', async () => {
    const bytes = await renderDeck(demoDeck);
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    const zip = await JSZip.loadAsync(bytes);
    const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    expect(slides).toHaveLength(5);
    for (const path of slides) {
      const xml = await zip.file(path)!.async('string');
      expect(xml).toMatch(/<a:t>/);
      expect(xml).toMatch(/<p:sp>/);
    }
    expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain('人工智能与时间序列预测');
  });

  it('keeps five editable slides when rendering either new theme', async () => {
    for (const id of ['dark', 'warm'] as const) {
      const zip = await JSZip.loadAsync(await renderDeck(demoDeck, themeForStyle(id)));
      const paths = Object.keys(zip.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path));
      expect(paths).toHaveLength(5);
      for (const path of paths) {
        const xml = await zip.file(path)!.async('string');
        expect(xml).toContain('<a:t>');
        expect(xml).toContain('<p:sp>');
      }
    }
  });

  it('rejects malformed decks before writing output', async () => {
    await expect(renderDeck({ title: 'bad', slides: [{ layout: 'unknown' }] } as never)).rejects.toThrow();
  });
});
