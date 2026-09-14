import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validateGeneration } from './validation.js';

const headers = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_URL') || 'http://localhost:5173',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

async function providerFetch(url: string, key: string, body?: unknown) {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(body ? 115_000 : 20_000),
  });
  const data = await response.json();
  if (!response.ok) {
    console.error('Studio provider request failed', response.status);
    throw new Error(response.status === 429 ? 'The creation provider is busy. Try again later.' : 'The creation provider could not complete this request. Check your brief or provider configuration.');
  }
  return data;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sign in to create with HEY.' }, 401);
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !secret) return json({ error: 'Studio needs server configuration.' }, 503);
  const client = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: authError } = await client.auth.getUser(token);
  if (authError || !user) return json({ error: 'Your session expired. Sign in again.' }, 401);
  const admin = createClient(url, secret, { auth: { persistSession: false } });
  let input;
  try {
    const raw = await request.text();
    if (raw.length > 12000) return json({ error: 'Creative brief is too large.' }, 413);
    input = JSON.parse(raw);
    if (!input || typeof input !== 'object') throw new Error();
  } catch { return json({ error: 'Invalid request.' }, 400); }
  const imageKey = Deno.env.get('OPENAI_API_KEY');
  const videoKey = Deno.env.get('LUMA_API_KEY');
  if (input.operation === 'status') return json({ image: Boolean(imageKey), video: Boolean(videoKey) });

  async function present(job: Record<string, any>) {
    if (job.result?.path) {
      const { data, error } = await admin.storage.from('hey-creations').createSignedUrl(job.result.path, 3600);
      if (error || !data?.signedUrl) throw new Error('Could not open the saved image. Try again.');
      return { ...job, result: { ...job.result, images: [data.signedUrl] } };
    }
    return job;
  }

  try {
    if (input.operation === 'list') {
      const { data, error } = await admin.from('hey_generation_jobs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(12);
      if (error) return json({ error: 'Creation history needs the Studio database migration.' }, 503);
      return json({ jobs: await Promise.all((data || []).map(present)) });
    }
    if (input.operation === 'get') {
      if (!uuid(input.id)) return json({ error: 'Invalid creation ID.' }, 400);
      const { data: job, error } = await admin.from('hey_generation_jobs').select('*').eq('id', input.id).eq('user_id', user.id).maybeSingle();
      if (error || !job) return json({ error: 'Creation not found.' }, 404);
      if (job.status === 'processing' && job.kind === 'video' && job.provider_id && videoKey) {
        const data = await providerFetch(`https://api.lumalabs.ai/dream-machine/v1/generations/${encodeURIComponent(job.provider_id)}`, videoKey);
        if (data.state === 'completed' && /^https:\/\//.test(data.assets?.video || '')) {
          job.status = 'completed'; job.result = { video: data.assets.video, provider: 'luma' };
        } else if (data.state === 'failed') { job.status = 'failed'; job.error = 'The provider could not generate this video. Try a revised brief.'; }
        const { error: updateError } = await admin.from('hey_generation_jobs').update({ status: job.status, result: job.result, error: job.error }).eq('id', job.id).eq('user_id', user.id);
        if (updateError) throw new Error('Could not save creation progress. Check again.');
      } else if (job.status === 'processing' && Date.now() - Date.parse(job.created_at) > 20 * 60_000) {
        job.status = 'failed'; job.error = 'The request ended before its result was saved. Check provider usage before retrying.';
        await admin.from('hey_generation_jobs').update({ status: job.status, error: job.error }).eq('id', job.id).eq('user_id', user.id);
      }
      return json({ job: await present(job) });
    }
    if (input.operation !== 'create') return json({ error: 'Unknown operation.' }, 400);
    if (!uuid(input.requestId)) return json({ error: 'A request ID is required.' }, 400);
    let brief;
    try { brief = validateGeneration(input); } catch (error) { return json({ error: String((error as Error).message) }, 400); }
    const key = brief.type === 'image' ? imageKey : videoKey;
    if (!key) return json({ error: `${brief.type === 'image' ? 'Image' : 'Video'} generation needs a provider key on the server.` }, 503);
    const { data: reservation, error: quotaError } = await admin.rpc('hey_reserve_generation', { p_user: user.id, p_request: input.requestId, p_kind: brief.type, p_prompt: brief.prompt });
    if (quotaError || !reservation?.job) return json({ error: quotaError?.message?.includes('limit') ? 'Daily creation limit reached. Try again tomorrow.' : quotaError?.message?.includes('requires') ? 'Video generation requires Pro or Elite.' : 'Studio could not reserve this creation. Check the database configuration.' }, 403);
    const job = reservation.job;
    if (!reservation.created) {
      if (job.prompt !== brief.prompt || job.kind !== brief.type) return json({ error: 'This request ID belongs to another brief.' }, 409);
      return json({ job: await present(job) });
    }
    try {
      if (brief.type === 'image') {
        const model = Deno.env.get('OPENAI_IMAGE_MODEL') || 'gpt-image-1.5';
        const size = ({ '1:1': '1024x1024', '3:2': '1536x1024', '2:3': '1024x1536' } as Record<string,string>)[brief.ratio];
        const data = await providerFetch('https://api.openai.com/v1/images/generations', key, { model, prompt: brief.composedPrompt, n: 1, size, quality: brief.quality, output_format: 'png' });
        const encoded = data.data?.[0]?.b64_json;
        if (!encoded) throw new Error('The provider returned no image.');
        const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
        const path = `${user.id}/${job.id}.png`;
        const { error } = await admin.storage.from('hey-creations').upload(path, bytes, { contentType: 'image/png', upsert: false });
        if (error) throw new Error('The image was generated but could not be saved. Check storage before retrying.');
        job.status = 'completed'; job.result = { path, model, provider: 'openai', size };
      } else {
        const data = await providerFetch('https://api.lumalabs.ai/dream-machine/v1/generations', key, { model: Deno.env.get('LUMA_VIDEO_MODEL') || 'ray-2', prompt: brief.composedPrompt, resolution: '720p', duration: '5s', aspect_ratio: brief.ratio });
        if (!data.id) throw new Error('The provider returned no video request ID.');
        job.provider_id = data.id;
      }
      const { error } = await admin.from('hey_generation_jobs').update({ status: job.status, result: job.result, provider_id: job.provider_id }).eq('id', job.id).eq('user_id', user.id);
      if (error) throw new Error('The provider accepted this request, but progress could not be saved. Check provider usage before retrying.');
      return json({ job: await present(job) });
    } catch (error) {
      const message = (error as Error).name === 'TimeoutError' ? 'The provider timed out. Check provider usage before retrying.' : (error as Error).message;
      await admin.from('hey_generation_jobs').update({ status: 'failed', error: message }).eq('id', job.id).eq('user_id', user.id);
      return json({ error: message, job: { id: job.id, status: 'failed' } }, 502);
    }
  } catch { return json({ error: 'Studio could not complete the request. Please try again.' }, 502); }
});
