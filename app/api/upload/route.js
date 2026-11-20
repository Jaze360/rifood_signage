import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { get, head } from '@vercel/blob';
import { handleUpload } from '@vercel/blob/client';
import { adminAllowed, playerAllowed, sameOrigin } from '../../../lib/auth';
import { cloud, folder, readState, screens, updateState } from '../../../lib/store';
import { maxSize, mediaTypes } from '../../../lib/media';

export const dynamic = 'force-dynamic';
const json = (data, status = 200) => Response.json(data, { status });

export async function POST(req) {
  try {
    const admin = sameOrigin(req) && await adminAllowed();
    const type = req.headers.get('content-type') || '';
    if (cloud && type.includes('application/json')) {
      const body = await req.json();
      if (body.type === 'blob.generate-client-token' || body.type === 'blob.upload-completed') {
        if (body.type === 'blob.generate-client-token' && !admin) return json({ error: 'Geen toegang.' }, 403);
        return json(await handleUpload({
          body, request: req,
          onBeforeGenerateToken: async path => {
            if (!admin || !/^media\/[0-9a-f-]{36}$/.test(path)) throw new Error('Ongeldig bestandspad.');
            return { allowedContentTypes: mediaTypes, maximumSizeInBytes: maxSize, addRandomSuffix: false, allowOverwrite: false };
          },
          onUploadCompleted: async () => {}
        }));
      }
      if (!admin) return json({ error: 'Geen toegang.' }, 403);
      if (!/^[0-9a-f-]{36}$/.test(body.id)) return json({ error: 'Ongeldig bestand.' }, 400);
      const blob = await head('media/' + body.id);
      if (!mediaTypes.includes(blob.contentType) || blob.size > maxSize) return json({ error: 'Ongeldig bestand.' }, 400);
      await updateState(data => {
        if (!data.media.some(item => item.id === body.id)) data.media.push({
          id: body.id, type: blob.contentType, size: blob.size, name: String(body.name || 'Media').slice(0, 140)
        });
      });
      return json({ ok: true });
    }
    if (!admin || cloud) return json({ error: 'Geen toegang.' }, 403);
    if (Number(req.headers.get('content-length')) > maxSize + 8192) return json({ error: 'Bestand is te groot.' }, 413);
    const file = (await req.formData()).get('file');
    if (!(file instanceof File) || !mediaTypes.includes(file.type) || !file.size || file.size > maxSize) {
      return json({ error: 'Kies een ondersteund bestand van maximaal 64 MB.' }, 400);
    }
    const id = randomUUID();
    await mkdir(join(folder, 'media'), { recursive: true });
    await writeFile(join(folder, 'media', id), Buffer.from(await file.arrayBuffer()));
    await updateState(data => data.media.push({ id, name: file.name.slice(0, 140), type: file.type, size: file.size }));
    return json({ ok: true });
  } catch (error) {
    console.error(error);
    return json({ error: 'Upload mislukt.' }, 500);
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const screen = searchParams.get('screen');
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Ongeldig bestand.' }, 404);
  const admin = await adminAllowed();
  if (!admin && !(screens.includes(screen) && playerAllowed(req, screen))) return json({ error: 'Geen toegang.' }, 403);
  const state = await readState();
  const media = state.media.find(item => item.id === id);
  if (!media || (!admin && !state.releases[screen]?.items.some(item => item.id === id))) return json({ error: 'Bestand niet gevonden.' }, 404);
  const headers = { 'Content-Type': media.type, 'Content-Length': String(media.size), 'Cache-Control': 'private, no-store' };
  if (!cloud) return new Response(await readFile(join(folder, 'media', id)), { headers });
  const result = await get('media/' + id, { access: 'private' });
  return result?.statusCode === 200 ? new Response(result.stream, { headers }) : json({ error: 'Bestand niet gevonden.' }, 404);
}
