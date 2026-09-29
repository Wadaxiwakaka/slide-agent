import { z } from 'zod';
import { renderDeck } from '../presentation/render';
import { LayoutOverflowError } from '../presentation/layout';
import { themeForStyle } from '../domain/theme';
import { outlineSchema } from '../domain/outline';
import { assertEvidence, EvidenceError } from './evidence';
import { ModelApiError } from './model-api';
import { activeModel, ModelManagementError } from './manage-models';
import { generationRequestSchema, InvalidDeckError, planDeck } from './planner';

export async function createGenerateResponse(body: unknown, filePath: string, fetcher: typeof fetch, env: NodeJS.ProcessEnv): Promise<Response> {
  try {
    const confirmed = body && typeof body === 'object' && 'input' in body
      ? z.strictObject({ input: generationRequestSchema, outline: outlineSchema }).parse(body) : null;
    const input = confirmed?.input ?? generationRequestSchema.parse(body);
    if (confirmed) {
      if (confirmed.outline.slides.length !== input.slideCount) return Response.json({ error: '大纲页数与目标页数不一致，请重新生成大纲' }, { status: 400 });
      assertEvidence(confirmed.outline, `${input.topic}\n${input.sourceText}`);
    }
    const { config, key } = await activeModel(filePath, env);
    const { deck, suggestedStyle } = await planDeck(input, config, key, fetcher, confirmed?.outline);
    const styleId = input.styleChoice === 'auto' ? suggestedStyle ?? 'classic' : input.styleChoice;
    const fallback = input.styleChoice === 'auto' && !suggestedStyle;
    const bytes = await renderDeck(deck, themeForStyle(styleId));
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': 'attachment; filename="slide-agent-generated.pptx"',
        'Content-Length': String(bytes.length),
        'Cache-Control': 'no-store',
        'X-SlideAgent-Style': styleId,
        ...(fallback ? { 'X-SlideAgent-Style-Fallback': '1' } : {}),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: '生成请求格式无效，请检查输入长度和页数（1–10）' }, { status: 400 });
    if (error instanceof ModelManagementError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof EvidenceError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof ModelApiError) return Response.json({ error: error.message }, { status: 502 });
    if (error instanceof InvalidDeckError) return Response.json({ error: error.message }, { status: 422 });
    if (error instanceof LayoutOverflowError) return Response.json({ error: '页面文字过多，请缩短内容或增加页数后重试' }, { status: 422 });
    return Response.json({ error: '生成失败，请检查本地配置或排版约束' }, { status: 500 });
  }
}
