import { z } from 'zod';
import { activeModel, ModelManagementError } from './manage-models';
import { ModelApiError } from './model-api';
import { InvalidOutlineError, planOutline } from './outline';
import { generationRequestSchema } from './planner';

export async function createOutlineResponse(body: unknown, filePath: string, fetcher: typeof fetch, env: NodeJS.ProcessEnv): Promise<Response> {
  try {
    const input = generationRequestSchema.parse(body);
    const { config, key } = await activeModel(filePath, env);
    const outline = await planOutline(input, config, key, fetcher);
    return Response.json({ outline }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: '大纲请求格式无效，请检查输入长度和页数（1–10）' }, { status: 400 });
    if (error instanceof ModelManagementError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof InvalidOutlineError) return Response.json({ error: error.message }, { status: 422 });
    if (error instanceof ModelApiError || (error instanceof Error && /^(模型连接失败|模型请求超时)/.test(error.message))) {
      return Response.json({ error: '模型连接或响应失败，请检查本地地址、密钥和网络' }, { status: 502 });
    }
    return Response.json({ error: '大纲生成失败，请检查本地模型配置' }, { status: 500 });
  }
}
