import { z } from 'zod';
import { renderDeck } from '../presentation/render';
import { ModelApiError } from './model-api';
import { activeModel, ModelManagementError } from './manage-models';
import { generationRequestSchema, InvalidDeckError, planDeck } from './planner';

export async function createGenerateResponse(body: unknown, filePath: string, fetcher: typeof fetch, env: NodeJS.ProcessEnv): Promise<Response> {
  try {
    const input = generationRequestSchema.parse(body);
    const { config, key } = await activeModel(filePath, env);
    const { deck } = await planDeck(input, config, key, fetcher);
    const bytes = await renderDeck(deck);
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': 'attachment; filename="slide-agent-generated.pptx"',
        'Content-Length': String(bytes.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: '生成请求格式无效，请检查输入长度和页数（1–10）' }, { status: 400 });
    if (error instanceof ModelManagementError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof ModelApiError) return Response.json({ error: error.message }, { status: 502 });
    if (error instanceof InvalidDeckError) return Response.json({ error: error.message }, { status: 422 });
    return Response.json({ error: '生成失败，请检查本地配置或排版约束' }, { status: 500 });
  }
}
