import { z } from 'zod';
import { settingsFile } from '../../../server/model-config';
import { checkJsonRequest, configError, createModel, editModel, listModels, parseJsonRequest, removeModel, selectModel } from '../../../server/manage-models';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try { return Response.json(await listModels(settingsFile)); }
  catch (error) { return configError(error); }
}

export async function POST(request: Request): Promise<Response> {
  const invalid = checkJsonRequest(request);
  if (invalid) return invalid;
  try {
    await createModel(settingsFile, await parseJsonRequest(request));
    return Response.json(await listModels(settingsFile), { status: 201 });
  } catch (error) { return configError(error); }
}

export async function PUT(request: Request): Promise<Response> {
  const invalid = checkJsonRequest(request);
  if (invalid) return invalid;
  try {
    const { id, config } = z.strictObject({ id: z.string(), config: z.unknown() }).parse(await parseJsonRequest(request));
    await editModel(settingsFile, id, config);
    return Response.json(await listModels(settingsFile));
  } catch (error) { return configError(error); }
}

export async function DELETE(request: Request): Promise<Response> {
  const invalid = checkJsonRequest(request);
  if (invalid) return invalid;
  try {
    const { id } = z.strictObject({ id: z.string() }).parse(await parseJsonRequest(request));
    await removeModel(settingsFile, id);
    return Response.json(await listModels(settingsFile));
  } catch (error) { return configError(error); }
}

export async function PATCH(request: Request): Promise<Response> {
  const invalid = checkJsonRequest(request);
  if (invalid) return invalid;
  try {
    const { activeId } = z.strictObject({ activeId: z.string().nullable() }).parse(await parseJsonRequest(request));
    await selectModel(settingsFile, activeId);
    return Response.json(await listModels(settingsFile));
  } catch (error) { return configError(error); }
}
