import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import Home from './page';

it('renders a locally gated generation form and keeps the demo available', () => {
  const html = renderToStaticMarkup(createElement(Home));
  for (const field of ['topic', 'sourceText', 'audience', 'purpose', 'slideCount', 'styleChoice', 'density']) expect(html).toContain(`name="${field}"`);
  for (const style of ['auto', 'classic', 'dark', 'warm']) expect(html).toContain(`value="${style}"`);
  expect(html).toMatch(/<option value="auto" selected="">自动<\/option>/);
  expect(html).toContain('普通听众');
  expect(html).toContain('介绍主题');
  expect(html).toContain('M2 · 内容大纲');
  expect(html).toContain('max="100"');
  expect(html).toContain('maxLength="200000"');
  expect(html).toContain('详细');
  expect(html).toContain('断点恢复');
  expect(html).toContain('Generate Demo PPT');
  expect(html).toContain('管理模型配置');
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*生成大纲/);
  expect(html).toContain('可能产生两次调用费用');
});
