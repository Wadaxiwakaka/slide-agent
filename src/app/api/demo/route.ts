import { demoDeck } from '../../../domain/demo';
import { renderDeck } from '../../../presentation/render';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const bytes = await renderDeck(demoDeck);
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': 'attachment; filename="slide-agent-demo.pptx"',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'no-store',
    },
  });
}
