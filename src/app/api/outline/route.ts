import { settingsFile } from '../../../server/model-config';
import { checkJsonRequest, configError, parseJsonRequest } from '../../../server/manage-models';
import { createOutlineResponse } from '../../../server/create-outline';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const invalid = checkJsonRequest(request);
  if (invalid) return invalid;
  try { return await createOutlineResponse(await parseJsonRequest(request), settingsFile, fetch, process.env); }
  catch (error) { return configError(error); }
}
