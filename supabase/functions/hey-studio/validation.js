const styles = {
  natural: '',
  editorial: 'Art direction: editorial photography, intentional framing, natural texture, controlled light.',
  illustration: 'Art direction: a coherent illustration, deliberate shapes, a balanced palette, clean edges.',
  product: 'Art direction: studio product photography, accurate materials, crisp silhouette, controlled reflections.',
  cinematic: 'Art direction: cinematic composition, motivated lighting, a clear focal subject and depth.',
};
export function validateGeneration(input) {
  if (!input || typeof input !== 'object') throw new Error('A creative brief is required.');
  const type = input.type;
  if (!['image', 'video'].includes(type)) throw new Error('Choose image or video.');
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  if (!prompt || prompt.length > 4000) throw new Error('Use a prompt between 1 and 4,000 characters.');
  const style = input.style || 'natural';
  if (!Object.hasOwn(styles, style)) throw new Error('Choose an available style.');
  const ratio = input.ratio || (type === 'video' ? '16:9' : '1:1');
  if (!(type === 'image' ? ['1:1', '3:2', '2:3'] : ['1:1', '16:9', '9:16']).includes(ratio)) throw new Error('Choose an available aspect ratio.');
  const quality = input.quality || 'high';
  if (!['medium', 'high'].includes(quality)) throw new Error('Choose medium or high quality.');
  const direction = type === 'video'
    ? 'Keep subject identity, materials, and lighting consistent over time. Use physically coherent motion and smooth camera movement. Preserve the requested action.'
    : 'Preserve the requested subjects, counts, exact quoted text, and composition. Use coherent lighting and deliberate detail. Avoid extra objects or text unless requested.';
  return { type, prompt, style, ratio, quality, composedPrompt: [prompt, styles[style], direction].filter(Boolean).join('\n\n') };
}
