import pptxgen from 'pptxgenjs';
import { deckSchema, type DeckSpec } from '../domain/deck';
import { defaultTheme, type Theme } from '../domain/theme';
import { layoutSlide } from './layout';

export async function renderDeck(deck: DeckSpec, theme: Theme = defaultTheme): Promise<Buffer> {
  const valid = deckSchema.parse(deck);
  const pptx = new pptxgen();
  pptx.defineLayout({ name: 'SLIDE_AGENT', width: theme.width, height: theme.height });
  pptx.layout = 'SLIDE_AGENT';
  pptx.author = 'SlideAgent';
  pptx.subject = valid.title;
  pptx.theme = { headFontFace: theme.font, bodyFontFace: theme.font };

  for (const spec of valid.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: theme.colors.background };
    for (const element of layoutSlide(spec, theme)) {
      const { x, y, w, h } = element;
      if (element.kind === 'text') {
        slide.addText(element.value, {
          x, y, w, h, fontFace: theme.font, fontSize: element.size,
          bold: element.bold, color: element.color, align: element.align,
          margin: 0, valign: 'middle', fit: 'shrink',
        });
      } else if (element.kind === 'rect') {
        slide.addShape(pptx.ShapeType.rect, {
          x, y, w, h, rectRadius: 0,
          fill: { color: element.fill },
          line: { color: element.stroke ?? element.fill, transparency: element.stroke ? 0 : 100 },
        });
      } else {
        slide.addShape(pptx.ShapeType.line, { x, y, w, h, line: { color: element.color, width: 1.5 } });
      }
    }
  }
  return Buffer.from(await pptx.write({ outputType: 'nodebuffer' }) as Uint8Array);
}
