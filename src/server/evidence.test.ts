import { describe, expect, it } from 'vitest';
import { demoDeck } from '../domain/demo';
import { outlineSchema } from '../domain/outline';
import { assertEvidence, EvidenceError } from './evidence';

const cover = { id: 'cover', role: 'opening', layout: 'title', title: '报告', keyMessage: '概述' };

describe('source evidence', () => {
  it('rejects a number embedded inside a longer number and forged excerpts', () => {
    const deck = { title: '报告', slides: [{ layout: 'data_highlight' as const, title: '数据', value: '10', label: '增长率', takeaway: '值得注意', sourceQuote: '增长率达到110' }] };
    expect(() => assertEvidence(deck, '增长率达到110')).toThrow(EvidenceError);
    expect(() => assertEvidence({ ...deck, slides: [{ ...deck.slides[0], value: '110' }] }, '增长率达到110')).not.toThrow();
    expect(() => assertEvidence({ ...deck, slides: [{ ...deck.slides[0], sourceQuote: '增长率达到10' }] }, '增长率达到110')).toThrow(EvidenceError);
  });

  it('does not reinterpret a negative number or incomplete year as supplied evidence', () => {
    const deck = { title: '报告', slides: [{ layout: 'data_highlight' as const, title: '数据', value: '10', label: '增量', takeaway: '增长', sourceQuote: '变化量为-10' }] };
    expect(() => assertEvidence(deck, '变化量为-10')).toThrow(EvidenceError);
    const outline = outlineSchema.parse({ title: '报告', slides: [cover, {
      id: 'point', role: 'point', layout: 'title_body', title: '2025年目标', keyMessage: '需要推进',
    }] });
    expect(() => assertEvidence(outline, '仅提到2025，没有年份单位')).toThrow(EvidenceError);
  });

  it('requires each displayed timeline date in its own original date-event excerpt', () => {
    const deck = { title: '报告', slides: [{ layout: 'timeline' as const, title: '时间', takeaway: '推进', events: [
      { date: '2022年', event: '启动', sourceQuote: '2022年启动' },
      { date: '2024年', event: '交付', sourceQuote: '2023年交付' },
    ] }] };
    expect(() => assertEvidence(deck, '2022年启动；2023年交付；其他来源2024年')).toThrow(EvidenceError);
    deck.slides[0].events[1].sourceQuote = '2024年交付';
    expect(() => assertEvidence(deck, '2022年启动；2024年交付')).not.toThrow();
  });

  it('rejects an unprovided number in an edited outline before a model call', () => {
    const outline = outlineSchema.parse({ title: '报告', slides: [cover, {
      id: 'point', role: 'point', layout: 'title_body', title: '论点', keyMessage: '到2025年达到目标',
    }] });
    expect(() => assertEvidence(outline, '用户原文：2024年提出目标')).toThrow(EvidenceError);
    expect(() => assertEvidence(outline, '用户原文：2025年提出目标')).not.toThrow();
  });

  it('rejects unquoted facts on old layouts and permits number-free legacy decks', () => {
    const deck = { title: '报告', slides: [{ layout: 'title_body' as const, title: '事实', bullets: ['预计2025年完成'] }] };
    expect(() => assertEvidence(deck, '来源仅有2024年')).toThrow(EvidenceError);
    expect(() => assertEvidence(deck, '来源：2025年完成')).not.toThrow();
    expect(() => assertEvidence(demoDeck, '人工智能与时间序列预测')).not.toThrow();
  });
});
