import type { SlideSpec } from '../domain/deck';
import type { Theme } from '../domain/theme';
import { layoutSlide, LayoutOverflowError } from './layout';

export function paginateDetailedSlide(slide: SlideSpec, theme: Theme, keyMessage: string): SlideSpec[] {
  const fits = (page: SlideSpec): boolean => {
    try { layoutSlide(page, theme, { minBodySize: 16 }); return true; }
    catch (error) { if (error instanceof LayoutOverflowError) return false; throw error; }
  };
  if (fits(slide)) return [slide];
  const pages: SlideSpec[] = [];
  const title = () => pages.length ? (slide.title.length <= 57 ? `${slide.title}（续）` : slide.title) : slide.title;
  if (slide.layout === 'title_body' || slide.layout === 'process') {
    let offset = 0;
    const length = slide.layout === 'title_body' ? slide.bullets.length : slide.steps.length;
    while (offset < length) {
      let accepted: SlideSpec | undefined;
      let count = length - offset;
      for (; count >= (slide.layout === 'process' ? 2 : 1); count--) {
        if (slide.layout === 'process' && length - offset - count === 1) continue;
        const candidate: SlideSpec = slide.layout === 'title_body'
          ? { ...slide, title: title(), bullets: slide.bullets.slice(offset, offset + count) }
          : { ...slide, title: title(), steps: slide.steps.slice(offset, offset + count) };
        if (fits(candidate)) { accepted = candidate; break; }
      }
      if (!accepted) throw new LayoutOverflowError('页面无法在语义边界无损拆分，请缩短单条解释');
      pages.push(accepted); offset += count;
    }
  } else if (slide.layout === 'comparison') {
    // ponytail: paired semantic groups only; asymmetric exhausted sides require user replanning, not invented filler.
    let left = 0, right = 0;
    while (left < slide.left.items.length && right < slide.right.items.length) {
      let accepted: Extract<SlideSpec, { layout: 'comparison' }> | undefined;
      for (let n = Math.min(slide.left.items.length - left, slide.right.items.length - right); n >= 1; n--) {
        const candidate = { ...slide, title: title(), left: { ...slide.left, items: slide.left.items.slice(left, left + n) }, right: { ...slide.right, items: slide.right.items.slice(right, right + n) } };
        if (fits(candidate)) { accepted = candidate; break; }
      }
      if (!accepted) throw new LayoutOverflowError('对比内容无法无损拆页，请调整大纲');
      pages.push(accepted); left += accepted.left.items.length; right += accepted.right.items.length;
    }
    if (left !== slide.left.items.length || right !== slide.right.items.length) throw new LayoutOverflowError('对比两侧无法成组拆页，请调整内容');
  } else throw new LayoutOverflowError('该页面不能无损拆分，请调整大纲或缩短内容');
  const first = pages[0];
  if (!layoutSlide(first, theme, { minBodySize: 16 }).some(e => e.kind === 'text' && e.value.includes(keyMessage))) throw new LayoutOverflowError('核心观点无法完整保留在原页，请调整内容');
  return pages;
}
