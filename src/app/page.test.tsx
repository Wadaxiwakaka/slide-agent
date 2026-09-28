import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import Home from './page';

it('renders a locally gated generation form and keeps the demo available', () => {
  const html = renderToStaticMarkup(createElement(Home));
  for (const field of ['topic', 'sourceText', 'audience', 'purpose', 'slideCount']) expect(html).toContain(`name="${field}"`);
  expect(html).toContain('普通听众');
  expect(html).toContain('介绍主题');
  expect(html).toContain('Generate Demo PPT');
  expect(html).toContain('管理模型配置');
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*生成 PPTX/);
});
