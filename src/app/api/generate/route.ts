import { settingsFile } from '../../../server/model-config';
import { checkJsonRequest, configError, parseJsonRequest } from '../../../server/manage-models';
import { createGenerateResponse } from '../../../server/generate';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const invalid = checkJsonRequest(request);
  if (invalid) return invalid;
  try { return await createGenerateResponse(await parseJsonRequest(request), settingsFile, fetch, process.env); }
  catch (error) { return configError(error); }
}
