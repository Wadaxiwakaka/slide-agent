import { handleJobRequest } from '../../../../../../server/longform/http';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleJobRequest(request, 'download', (await context.params).id);
}
