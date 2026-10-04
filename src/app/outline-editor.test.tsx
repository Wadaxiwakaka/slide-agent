import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { outlineSchema } from '../domain/outline';
import OutlineEditor from './outline-editor';

it('offers editable messages and accessible order controls while the cover remains fixed', () => {
  const outline = outlineSchema.parse({ title: '项目', slides: [
    { id: 'cover', role: 'opening', layout: 'title', title: '项目封面', keyMessage: '介绍项目' },
    { id: 'point', role: 'point', layout: 'title_body', title: '核心论点', keyMessage: '行动', },
    { id: 'facts', role: 'evidence', layout: 'timeline', title: '里程碑', keyMessage: '持续推进', sourceQuotes: ['2022年项目启动', '2024年项目交付'] },
  ] });
  const html = renderToStaticMarkup(createElement(OutlineEditor, { outline, onChange: () => {}, onRegenerate: () => {}, onConfirm: () => {}, busy: false }));
  expect(html).toContain('value="项目封面"');
  expect(html).toContain('介绍项目');
  expect(html).toContain('2022年项目启动');
  expect(html).toContain('时间轴');
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>上移<\/button>/);
  expect(html).toContain('aria-label="下移第 2 页"');
  expect(html).toContain('maxLength="110"');
  expect(html).toContain('确认大纲并生成 PPTX');
  expect(html).toContain('重新生成大纲');
  expect(html).not.toContain('移除第');
  const longHtml = renderToStaticMarkup(createElement(OutlineEditor, { outline, onChange: () => {}, onRegenerate: () => {}, onConfirm: () => {}, busy: false, persistent: true }));
  expect(longHtml).toContain('aria-label="移除第 2 页"');
  expect(longHtml).not.toContain('aria-label="移除第 1 页"');
});
