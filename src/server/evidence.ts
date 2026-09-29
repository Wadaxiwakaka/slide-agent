import type { DeckSpec } from '../domain/deck';
import type { Outline } from '../domain/outline';

export class EvidenceError extends Error {
  constructor() { super('日期、数字或依据片段未在原始材料中找到，请补充原文后重新生成大纲'); }
}

const numbers = /[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?%?|[-+]?\d+(?:\.\d+)?%?/g;
const dates = /\d{4}年(?:\d{1,2}月(?:\d{1,2}日)?)?|\d{4}[-/.]\d{1,2}(?:[-/.]\d{1,2})?/g;

function quoted(quote: string, source: string): void {
  if (!source.includes(quote)) throw new EvidenceError();
}

function exactIn(text: string, source: string): boolean {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![0-9.,+%-])${escaped}(?![0-9.,%])`).test(source);
}

export function assertEvidence(value: Outline | DeckSpec, source: string): void {
  const walk = (node: unknown, key = ''): void => {
    if (typeof node === 'string') {
      if (key === 'sourceQuote') quoted(node, source);
      else if (key !== 'id') {
        for (const match of node.replace(dates, '').matchAll(numbers)) if (!exactIn(match[0], source)) throw new EvidenceError();
        for (const match of node.matchAll(dates)) if (!exactIn(match[0], source)) throw new EvidenceError();
      }
    } else if (Array.isArray(node)) {
      node.forEach((item) => walk(item, key === 'sourceQuotes' ? 'sourceQuote' : ''));
    } else if (node && typeof node === 'object') {
      Object.entries(node).forEach(([field, item]) => walk(item, field));
    }
  };
  walk(value);
  for (const slide of value.slides) {
    if (slide.layout === 'timeline' && 'events' in slide) {
      for (const event of slide.events) if (!exactIn(event.date, event.sourceQuote)) throw new EvidenceError();
    } else if (slide.layout === 'data_highlight' && 'value' in slide && 'sourceQuote' in slide && !exactIn(slide.value, slide.sourceQuote)) {
      throw new EvidenceError();
    }
  }
}
