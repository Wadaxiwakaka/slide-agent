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

  it('renders evidence pages as editable OOXML text and shapes in every theme', async () => {
    const deck = { title: '项目', slides: [
      { layout: 'timeline' as const, title: '历程', takeaway: '持续推进', events: [
        { date: '2022年', event: '启动', sourceQuote: '2022年启动' },
        { date: '2024年', event: '交付', sourceQuote: '2024年交付' },
      ] },
      { layout: 'data_highlight' as const, title: '增长', value: '10%', label: '增长率', takeaway: '增势向好', sourceQuote: '增长率达到10%' },
    ] };
    for (const id of ['classic', 'dark', 'warm'] as const) {
      const zip = await JSZip.loadAsync(await renderDeck(deck, themeForStyle(id)));
      const files = Object.keys(zip.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path));
      expect(files).toHaveLength(2);
      const first = await zip.file('ppt/slides/slide1.xml')!.async('string');
      const second = await zip.file('ppt/slides/slide2.xml')!.async('string');
      for (const xml of [first, second]) { expect(xml).toContain('<a:t>'); expect(xml).toContain('<p:sp>'); }
      for (const value of ['2022年', '启动', '2024年', '交付', '持续推进']) expect(first).toContain(value);
      for (const value of ['10%', '增长率', '增势向好']) expect(second).toContain(value);
      expect(first).not.toContain('sourceQuote');
    }
  });

  it('rejects malformed decks before writing output', async () => {
    await expect(renderDeck({ title: 'bad', slides: [{ layout: 'unknown' }] } as never)).rejects.toThrow();
  });
});
