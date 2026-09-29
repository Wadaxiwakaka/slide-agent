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
    if (theme.styleId === 'dark') {
      rect(margin, 1.72, usable, 0.08, colors.primary);
      text(slide.title, margin + 0.65, 2.13, usable - 1.3, 1.15, 38, true, colors.ink, 'center');
      text(slide.subtitle, margin + 1.3, 3.48, usable - 2.6, 0.75, 22, false, colors.muted, 'center');
    } else if (theme.styleId === 'warm') {
      rect(margin, 1.5, 2.8, 0.1, colors.primary);
      text(slide.title, margin, 2.0, usable - 1, 1.15, 38, true);
      text(slide.subtitle, margin, 3.36, usable - 1, 0.75, 22, false, colors.muted);
    } else {
      rect(margin, 1.45, 0.13, 3.2, colors.primary);
      text(slide.title, margin + 0.42, 2.05, usable - 0.6, 1.15, 38, true);
      text(slide.subtitle, margin + 0.42, 3.42, usable - 0.6, 0.75, 22, false, colors.muted);
    }
  } else {
    if (theme.styleId === 'dark') {
      text(slide.title, margin, 0.72, usable, 0.75, theme.titleSize, true, colors.ink, 'center');
      rect((width - 2.1) / 2, 1.6, 2.1, 0.06, colors.primary);
    } else if (theme.styleId === 'warm') {
      text(slide.title, margin, 0.75, usable, 0.75, theme.titleSize, true);
      rect(margin, 1.64, 2.1, 0.06, colors.primary);
    } else {
      text(slide.title, margin, 0.62, usable, 0.75, theme.titleSize, true);
      rect(margin, 1.49, 0.72, 0.06, colors.primary);
    }

    switch (slide.layout) {
      case 'title_body':
        if (theme.styleId === 'dark') {
          const columns = slide.bullets.length > 1 && slide.bullets.every((bullet) => bullet.length < 55) ? 2 : 1;
          const w = (usable - (columns - 1) * gap) / columns;
          slide.bullets.forEach((bullet, i) => {
            const x = margin + (i % columns) * (w + gap);
            const y = 2.15 + Math.floor(i / columns) * 1.24;
            rect(x, y, w, 1.04);
            text(bullet, x + 0.24, y + 0.16, w - 0.48, 0.72, 17);
          });
        } else if (theme.styleId === 'warm') {
          slide.bullets.forEach((bullet, i) => {
            const y = 2 + i * 0.92;
            text(String(i + 1).padStart(2, '0'), margin + 0.15, y, 0.65, 0.62, 22, true, colors.primary);
            text(bullet, margin + 1.05, y, usable - 1.25, 0.62);
            rect(margin, y + 0.73, usable, 0.02, colors.border);
          });
        } else {
          slide.bullets.forEach((bullet, i) => {
            rect(margin + 0.2, 2.04 + i * 0.92, 0.11, 0.11, colors.primary);
            text(bullet, margin + 0.55, 1.86 + i * 0.92, usable - 0.8, 0.64);
          });
        }
        break;
      case 'three_cards': {
        const w = (usable - 2 * gap) / 3;
        slide.cards.forEach((card, i) => {
          const x = margin + i * (w + gap);
          const y = theme.styleId === 'dark' ? 2.08 + (i === 1 ? 0.3 : 0) : theme.styleId === 'warm' ? 2.18 : 2.02;
          const h = theme.styleId === 'classic' ? 3.78 : 3.65;
          rect(x, y, w, h);
          rect(x, y, w, 0.09, colors.primary);
          text(card.heading, x + 0.3, y + (theme.styleId === 'classic' ? 0.43 : 0.5), w - 0.6, 0.6, 23, true);
          text(card.body, x + 0.3, y + (theme.styleId === 'classic' ? 1.33 : 1.39), w - 0.6, 1.85, 17);
        });
        break;
      }
      case 'comparison': {
        const stacked = theme.styleId === 'warm';
        const w = stacked ? usable : (usable - gap) / 2;
        [slide.left, slide.right].forEach((side, i) => {
          const x = stacked ? margin : margin + i * (w + gap);
          const y = stacked ? 2 + i * 2.36 : theme.styleId === 'dark' ? 2.12 : 1.95;
          const h = stacked ? 2.1 : theme.styleId === 'dark' ? 4.22 : 4.5;
          rect(x, y, w, h);
          rect(x, y, stacked ? 0.09 : w, stacked ? h : 0.09, i === 0 ? colors.muted : colors.primary);
          text(side.heading, x + 0.3, stacked ? y + 0.28 : y + 0.32, stacked ? 2.55 : w - 0.6, 0.62, 23, true);
          side.items.forEach((item, j) => text(`•  ${item}`, x + (stacked ? 3.05 : 0.3), stacked ? y + 0.18 + j * 0.54 : y + 1.18 + j * 0.88, stacked ? w - 3.35 : w - 0.6, stacked ? 0.5 : 0.72, 17));
        });
        break;
      }
      case 'process': {
        const columns = theme.styleId === 'dark' ? Math.ceil(slide.steps.length / 2) : slide.steps.length;
        const w = (usable - (columns - 1) * gap) / columns;
        slide.steps.forEach((step, i) => {
          const x = margin + (i % columns) * (w + gap);
          const y = theme.styleId === 'dark' ? 2.12 + Math.floor(i / columns) * 2.2 : theme.styleId === 'warm' ? 2.15 + (i % 2) * 0.35 : 2.15;
          const h = theme.styleId === 'dark' ? 2 : theme.styleId === 'warm' ? 3.55 : 3.6;
          rect(x, y, w, h);
          text(String(i + 1).padStart(2, '0'), x + 0.22, y + 0.29, w - 0.44, 0.6, 25, true, colors.primary);
          text(step.heading, x + 0.22, y + (theme.styleId === 'dark' ? 0.78 : 1.16), w - 0.44, 0.66, 19, true);
          text(step.detail, x + 0.22, y + (theme.styleId === 'dark' ? 1.35 : 2.12), w - 0.44, theme.styleId === 'dark' ? 0.55 : 1.12, 15, false, colors.muted);
          if (theme.styleId === 'classic' && i < slide.steps.length - 1) {
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
