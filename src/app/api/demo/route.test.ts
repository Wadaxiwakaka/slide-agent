import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { GET } from './route';

it('serves a downloadable editable PPTX with the expected filename', async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
  expect(response.headers.get('content-disposition')).toContain('slide-agent-demo.pptx');
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  expect(Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))).toHaveLength(5);
});
