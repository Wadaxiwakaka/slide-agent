import { handleJobRequest } from '../../../../../server/longform/http';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context): Promise<Response> {
  return handleJobRequest(request, 'get', (await context.params).id);
}
export async function DELETE(request: Request, context: Context): Promise<Response> {
  return handleJobRequest(request, 'delete', (await context.params).id);
}
