import type { DeckSpec } from './deck';

export const demoDeck: DeckSpec = {
  title: '人工智能与时间序列预测',
  slides: [
    { layout: 'title', title: '人工智能与时间序列预测', subtitle: '从历史数据中理解变化，辅助未来决策' },
    { layout: 'title_body', title: '什么是时间序列预测？', bullets: [
      '时间序列是按时间顺序记录的观测数据。',
      '预测模型从趋势、周期和异常中学习规律。',
      '目标是为未来决策提供可检验的参考。',
    ] },
    { layout: 'three_cards', title: '预测能解决哪些问题？', cards: [
      { heading: '能源', body: '预测用电负荷，优化供给与调度。' },
      { heading: '交通', body: '预判流量高峰，降低拥堵风险。' },
      { heading: '商业', body: '估计需求变化，合理安排库存。' },
    ] },
    { layout: 'comparison', title: '传统方法与 AI 方法',
      left: { heading: '传统方法', items: ['规则清晰，容易解释', '依赖预先定义的模型假设'] },
      right: { heading: 'AI 方法', items: ['适合复杂的非线性模式', '需要更多数据与持续验证'] },
    },
    { layout: 'process', title: '一个可靠的预测流程', steps: [
      { heading: '收集数据', detail: '整理来源与时间粒度' },
      { heading: '清洗数据', detail: '处理缺失与异常值' },
      { heading: '训练模型', detail: '从历史窗口学习模式' },
      { heading: '评估迭代', detail: '回测效果并持续更新' },
    ] },
  ],
};
