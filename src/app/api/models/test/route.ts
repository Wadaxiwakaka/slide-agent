import { settingsFile } from '../../../../server/model-config';
import { checkJsonRequest, configError, testModelConnection } from '../../../../server/manage-models';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const invalid = checkJsonRequest(request);
  if (invalid) return invalid;
  try {
    await testModelConnection(settingsFile);
    return Response.json({ ok: true });
  } catch (error) { return configError(error); }
}
