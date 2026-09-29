import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import Home from './page';

it('renders a locally gated generation form and keeps the demo available', () => {
  const html = renderToStaticMarkup(createElement(Home));
  for (const field of ['topic', 'sourceText', 'audience', 'purpose', 'slideCount', 'styleChoice']) expect(html).toContain(`name="${field}"`);
  for (const style of ['auto', 'classic', 'dark', 'warm']) expect(html).toContain(`value="${style}"`);
  expect(html).toMatch(/<option value="auto" selected="">自动<\/option>/);
  expect(html).toContain('普通听众');
  expect(html).toContain('介绍主题');
  expect(html).toContain('M2 · Style Intelligence');
  expect(html).toContain('Generate Demo PPT');
  expect(html).toContain('管理模型配置');
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*生成 PPTX/);
});
