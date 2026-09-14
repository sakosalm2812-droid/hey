import { supabase } from './supabase.js';
export async function studioRequest(body, { signal } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in to create with HEY.');
  const url = import.meta.env.VITE_HEY_STUDIO_URL || `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hey-studio`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(130000)]) : AbortSignal.timeout(130000),
    });
  } catch (error) {
    throw new Error('Could not reach Studio. Check your connection. Your recent creations can show whether a request was accepted.', { cause: error });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || (response.status === 404 ? 'Studio has not been deployed yet.' : 'Studio is unavailable. Please try again.'));
  return data;
}

export async function createAndWaitForAsset(type, prompt, options = {}) {
  let { job } = await studioRequest({ operation: 'create', type, prompt, requestId: crypto.randomUUID(), ...options });
  const deadline = Date.now() + 10 * 60_000;
  while (job.status === 'processing' && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    ({ job } = await studioRequest({ operation: 'get', id: job.id }));
  }
  if (job.status !== 'completed') throw new Error(job.error || 'The creation is still processing. Open Studio to check its progress.');
  if (!job.result?.images?.length && !job.result?.video) throw new Error('The provider returned no usable asset.');
  return { ...job.result, jobId: job.id };
}
