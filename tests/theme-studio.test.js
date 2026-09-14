import test from 'node:test';
import assert from 'node:assert/strict';
import { HEY_THEMES } from '../src/lib/themes.js';
import { themeTokens, contrast, validAccent } from '../src/lib/themeTokens.js';
import { validateGeneration } from '../supabase/functions/hey-studio/validation.js';

test('all 27 themes have accessible action labels and coherent surface tokens', () => {
  for (const [id, theme] of Object.entries(HEY_THEMES)) {
    const tokens = themeTokens(theme);
    assert.ok(contrast(tokens['--accent'], tokens['--on-accent']) >= 4.5, id);
    assert.ok(contrast(theme.text, theme.bg) >= 4.5, `${id} body text`);
    assert.equal(tokens['--surface-elevated'], theme.surface);
    assert.ok(tokens['--field-bg']);
    assert.ok(tokens['--glass-highlight']);
  }
});
test('custom accents reject invalid CSS and retain readable action labels', () => {
  assert.equal(validAccent('url(https://example.com)'), '#B9C6FF');
  for (const accent of ['#000000','#FFFFFF','#888888','#FF0000','#00FF00','#0000FF']) {
    const tokens = themeTokens(HEY_THEMES.custom, accent);
    assert.ok(contrast(accent, tokens['--on-accent']) >= 4.5, accent);
  }
});
test('creative brief preserves exact requested text and does not inject an unselected art style', () => {
  const brief = validateGeneration({ type: 'image', prompt: 'Two red cups. Label reads "HEY".' });
  assert.ok(brief.composedPrompt.startsWith('Two red cups. Label reads "HEY".'));
  assert.ok(!brief.composedPrompt.includes('Art direction:'));
  assert.ok(brief.composedPrompt.includes('exact quoted text'));
});
test('video briefs carry continuity guidance and reject invalid formats or oversized input', () => {
  const brief = validateGeneration({ type: 'video', prompt: 'A bird in flight.', style: 'cinematic', ratio: '16:9' });
  assert.ok(brief.composedPrompt.includes('consistent over time'));
  assert.ok(brief.composedPrompt.includes('cinematic composition'));
  for (const input of [null, {}, { type:'music',prompt:'song' }, {type:'image',prompt:' '}, {type:'image',prompt:'a'.repeat(4001)}, {type:'image',prompt:'cup',style:'invalid'}, {type:'image',prompt:'cup',ratio:'16:9'}, {type:'video',prompt:'cup',quality:'invalid'}]) {
    assert.throws(() => validateGeneration(input));
  }
});
