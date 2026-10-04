import { handleJobRequest } from '../../../../server/longform/http';
export const runtime = 'nodejs';
export async function POST(request: Request): Promise<Response> {
  return handleJobRequest(request, 'create', undefined);
}
