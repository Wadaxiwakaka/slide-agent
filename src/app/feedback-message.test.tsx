import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import FeedbackMessage from './feedback-message';

it('highlights errors in red and announces them immediately', () => {
  const html = renderToStaticMarkup(createElement(FeedbackMessage, { kind: 'error', text: '请设置环境变量' }));
  expect(html).toContain('role="alert"');
  expect(html).toContain('text-red-');
  expect(html).toContain('请设置环境变量');
});

it('shows a green check and readable confirmation for successful connection', () => {
  const html = renderToStaticMarkup(createElement(FeedbackMessage, { kind: 'success', text: '连接成功' }));
  expect(html).toContain('role="status"');
  expect(html).toContain('text-emerald-');
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('✓');
  expect(html).toContain('连接成功');
});

it('does not style in-progress work as a failure', () => {
  const html = renderToStaticMarkup(createElement(FeedbackMessage, { kind: 'progress', text: '正在规划并生成 PPTX' }));
  expect(html).toContain('role="status"');
  expect(html).not.toContain('text-red-');
  expect(html).toContain('正在规划并生成 PPTX');
});
