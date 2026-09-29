import { describe, expect, it } from 'vitest';
import { outlineSchema } from './outline';

const opening = { id: 'cover', role: 'opening', layout: 'title', title: '封面', keyMessage: '项目概述' };
const point = { id: 'point', role: 'point', layout: 'title_body', title: '论点', keyMessage: '现状需要改变' };
const timeline = { id: 'history', role: 'evidence', layout: 'timeline', title: '历程', keyMessage: '持续推进', sourceQuotes: ['2022年项目启动', '2024年项目交付'] };

const parse = (slides: unknown[]) => outlineSchema.safeParse({ title: '报告', slides }).success;

describe('editable outline', () => {
  it('accepts a short presentation with one fixed cover', () => {
    expect(parse([opening])).toBe(true);
    expect(parse([opening, point, timeline])).toBe(true);
  });

  it('rejects a moved cover, a duplicate id and overly long edits', () => {
    expect(parse([point, opening])).toBe(false);
    expect(parse([opening, { ...point, id: opening.id }])).toBe(false);
    expect(parse([opening, { ...point, title: '长'.repeat(61) }])).toBe(false);
    expect(parse([opening, { ...point, keyMessage: '长'.repeat(111) }])).toBe(false);
    expect(parse([opening, { ...point, layout: 'title' }])).toBe(false);
    expect(parse([opening, { ...point, x: 1 }])).toBe(false);
  });

  it('requires distinct evidence for evidence slides but no speculative quotes on points', () => {
    expect(parse([opening, { ...timeline, sourceQuotes: [] }])).toBe(false);
    expect(parse([opening, { ...timeline, sourceQuotes: ['2022年项目启动', '2022年项目启动'] }])).toBe(false);
    expect(parse([opening, { ...timeline, sourceQuotes: [...timeline.sourceQuotes].reverse() }])).toBe(false);
    expect(parse([opening, { ...timeline, sourceQuotes: ['2022年项目启动', '项目交付'] }])).toBe(false);
    expect(parse([opening, { ...point, role: 'evidence' }])).toBe(false);
    expect(parse([opening, { ...point, sourceQuotes: ['依据'] }])).toBe(false);
    expect(parse([opening, { ...point, role: 'evidence', sourceQuotes: ['有实际依据'] }])).toBe(true);
    expect(parse([opening, { ...timeline, layout: 'data_highlight', sourceQuotes: ['10%'] }])).toBe(false);
    expect(parse([opening, { ...timeline, layout: 'data_highlight', sourceQuotes: ['增长率达到10%'] }])).toBe(true);
  });
});
