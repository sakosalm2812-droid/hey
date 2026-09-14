import { createAndWaitForAsset } from './studioClient.js';
export const GENERATION_CAPABILITIES = { image: 'image_generation', video: 'video_generation', audio: 'audio_generation', music: 'music_generation' };
export const GENERATION_PROVIDERS = {
  openai: { name: 'OpenAI', capabilities: ['image'], models: { image: ['server-configured'] }, requiresKey: true, envVar: 'OPENAI_API_KEY' },
  luma: { name: 'Luma', capabilities: ['video'], models: { video: ['server-configured'] }, requiresKey: true, envVar: 'LUMA_API_KEY' },
};
export function getAvailableGenerationProviders(capability) {
  return Object.entries(GENERATION_PROVIDERS).filter(([, item]) => item.capabilities.includes(capability))
    .map(([id,item]) => ({ id, ...item, models: item.models[capability] }));
}
export function getDefaultProvider(capability) { return getAvailableGenerationProviders(capability)[0] || null; }
export async function generateImage({ prompt, options = {} }) {
  const ratio = options.ratio || ({ '1536x1024': '3:2', '1024x1536': '2:3' }[options.size]) || '1:1';
  return createAndWaitForAsset('image', prompt, { ratio, style: options.style || 'natural', quality: options.quality === 'medium' ? 'medium' : 'high' });
}
export async function generateVideo({ prompt, image, options = {} }) {
  if (image) throw new Error('Reference-image video generation is not connected. Use a text brief in Studio.');
  return createAndWaitForAsset('video', prompt, { ratio: options.ratio || options.aspect_ratio || '16:9', style: options.style || 'natural' });
}
export async function generateAudio() { throw new Error('Audio file generation is not connected. Voice conversations use the configured speech service.'); }
export async function generateMusic() { throw new Error('Music generation is not connected.'); }
export default { GENERATION_CAPABILITIES, GENERATION_PROVIDERS, getAvailableGenerationProviders, getDefaultProvider, generateImage, generateVideo, generateAudio, generateMusic };
