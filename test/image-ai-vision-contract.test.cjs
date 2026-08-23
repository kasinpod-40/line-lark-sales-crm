const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/ai/image-ai.service.ts'), 'utf8');
const wranglerExample = fs.readFileSync(path.join(root, 'wrangler.jsonc.example'), 'utf8');

test('payment-slip vision defaults to OCR-focused Moondream native Workers AI contract', () => {
  assert.match(source, /@cf\/moondream\/moondream3\.1-9B-A2B/);
  assert.match(source, /task:\s*["']query["']/);
  assert.match(source, /image:\s*dataUri/);
  assert.match(source, /question/);
  assert.match(source, /stream:\s*false/);
  assert.match(source, /asString\(value\.answer\)/);
  assert.match(source, /slip_amount/);
  assert.match(source, /Do not guess unreadable fields/);
});

test('legacy Meta vision default is upgraded without requiring local config mutation', () => {
  assert.match(source, /LEGACY_META_VISION_MODEL/);
  assert.match(source, /configured === LEGACY_META_VISION_MODEL/);
  assert.match(source, /return DEFAULT_VISION_MODEL/);
  assert.match(wranglerExample, /"AI_VISION_MODEL": "@cf\/moondream\/moondream3\.1-9B-A2B"/);
});

test('vision fallback diagnostics never include image bytes or data URI', () => {
  assert.match(source, /stage:\s*"vision_inference_or_parse"/);
  assert.match(source, /model,/);
  assert.match(source, /message\.slice\(0, 240\)/);
  const fallbackStart = source.indexOf('console.warn("AI_IMAGE_FALLBACK"');
  const fallbackBlock = source.slice(fallbackStart, fallbackStart + 500);
  assert.doesNotMatch(fallbackBlock, /dataUri|bytes|base64/);
});
