import type { SlideSpec } from '../domain/deck';
import type { Theme } from '../domain/theme';

type Box = { x: number; y: number; w: number; h: number };
export type Element =
  | (Box & { kind: 'text'; value: string; size: number; color: string; bold?: boolean; align?: 'left' | 'center' })
  | (Box & { kind: 'rect'; fill: string; stroke?: string })
  | (Box & { kind: 'line'; color: string });

export function assertWithinSlide(elements: Element[], theme: Theme): void {
  for (const { x, y, w, h } of elements) {
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > theme.width + 1e-6 || y + h > theme.height + 1e-6) {
      throw new Error('Layout element is outside the slide or has invalid dimensions');
    }
  }
}

export function layoutSlide(slide: SlideSpec, theme: Theme): Element[] {
  const { width, margin, gap, colors } = theme;
  const usable = width - 2 * margin;
  const elements: Element[] = [];
  const text = (value: string, x: number, y: number, w: number, h: number, size = theme.bodySize, bold = false, color = colors.ink, align: 'left' | 'center' = 'left') => {
    elements.push({ kind: 'text', value, x, y, w, h, size, bold, color, align });
  };
  const rect = (x: number, y: number, w: number, h: number, fill = colors.surface) => {
    elements.push({ kind: 'rect', x, y, w, h, fill });
  };

  if (slide.layout === 'title') {
    rect(margin, 1.45, 0.13, 3.2, colors.primary);
    text(slide.title, margin + 0.42, 2.05, usable - 0.6, 1.15, 38, true);
    text(slide.subtitle, margin + 0.42, 3.42, usable - 0.6, 0.75, 22, false, colors.muted);
  } else {
    text(slide.title, margin, 0.62, usable, 0.75, theme.titleSize, true);
    rect(margin, 1.49, 0.72, 0.06, colors.primary);

    switch (slide.layout) {
      case 'title_body':
        slide.bullets.forEach((bullet, i) => {
          rect(margin + 0.2, 2.04 + i * 0.92, 0.11, 0.11, colors.primary);
          text(bullet, margin + 0.55, 1.86 + i * 0.92, usable - 0.8, 0.64);
        });
        break;
      case 'three_cards': {
        const w = (usable - 2 * gap) / 3;
        slide.cards.forEach((card, i) => {
          const x = margin + i * (w + gap);
          rect(x, 2.02, w, 3.78);
          rect(x, 2.02, w, 0.09, colors.primary);
          text(card.heading, x + 0.3, 2.45, w - 0.6, 0.6, 23, true);
          text(card.body, x + 0.3, 3.35, w - 0.6, 1.85, 17);
        });
        break;
      }
      case 'comparison': {
        const w = (usable - gap) / 2;
        [slide.left, slide.right].forEach((side, i) => {
          const x = margin + i * (w + gap);
          rect(x, 1.95, w, 4.5);
          rect(x, 1.95, w, 0.09, i === 0 ? colors.muted : colors.primary);
          text(side.heading, x + 0.3, 2.27, w - 0.6, 0.62, 23, true);
          side.items.forEach((item, j) => text(`•  ${item}`, x + 0.3, 3.13 + j * 0.88, w - 0.6, 0.72, 17));
        });
        break;
      }
      case 'process': {
        const w = (usable - (slide.steps.length - 1) * gap) / slide.steps.length;
        slide.steps.forEach((step, i) => {
          const x = margin + i * (w + gap);
          rect(x, 2.15, w, 3.6);
          text(String(i + 1).padStart(2, '0'), x + 0.22, 2.44, w - 0.44, 0.6, 25, true, colors.primary);
          text(step.heading, x + 0.22, 3.31, w - 0.44, 0.66, 19, true);
          text(step.detail, x + 0.22, 4.27, w - 0.44, 1.12, 15, false, colors.muted);
          if (i < slide.steps.length - 1) {
            elements.push({ kind: 'line', x: x + w + 0.01, y: 3.9, w: gap - 0.02, h: 0.01, color: colors.primary });
          }
        });
        break;
      }
    }
  }
  assertWithinSlide(elements, theme);
  return elements;
}
