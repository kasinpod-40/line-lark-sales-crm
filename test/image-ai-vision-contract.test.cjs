const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/ai/image-ai.service.ts'), 'utf8');
const envSource = fs.readFileSync(path.join(root, 'src/config/env.ts'), 'utf8');
const validation = fs.readFileSync(path.join(root, 'src/config/validation.ts'), 'utf8');
const wranglerExample = fs.readFileSync(path.join(root, 'wrangler.jsonc.example'), 'utf8');

test('payment-slip image analysis uses Gemini 3.7 Flash multimodal structured output', () => {
  assert.match(source, /gemini-3\.7-flash/);
  assert.match(source, /LEGACY_GEMINI_IMAGE_MODEL\s*=\s*"gemini-2\.5-flash"/);
  assert.match(source, /configured === LEGACY_GEMINI_IMAGE_MODEL/);
  assert.match(source, /generativelanguage\.googleapis\.com\/v1beta\/models/);
  assert.match(source, /"x-goog-api-key": apiKey/);
  assert.match(source, /inlineData/);
  assert.match(source, /mimeType: normalizedMime/);
  assert.match(source, /data: arrayBufferToBase64\(bytes\)/);
  assert.match(source, /thinkingConfig:\s*\{\s*thinkingLevel:\s*"low"\s*\}/);
  assert.match(source, /responseFormat:\s*\{/);
  assert.match(source, /mimeType:\s*"application\/json"/);
  assert.match(source, /schema:\s*IMAGE_ANALYSIS_JSON_SCHEMA/);
  assert.match(source, /slip_amount/);
  assert.match(source, /ห้ามใช้เลขบัญชี เลขอ้างอิง วันที่ เวลา หรือข้อมูลใน QR code เป็น slip_amount/);
  assert.doesNotMatch(source, /temperature:\s*0|candidateCount|thinkingBudget/);
  assert.doesNotMatch(source, /env\.AI!?\.run|@cf\/moondream|@cf\/meta\/llama-3\.2-11b-vision-instruct/);
});

test('Gemini image secret and current model are explicit reusable install configuration', () => {
  assert.match(envSource, /GEMINI_API_KEY\?: string/);
  assert.match(envSource, /GEMINI_IMAGE_MODEL\?: string/);
  assert.match(wranglerExample, /"GEMINI_IMAGE_MODEL": "gemini-3\.7-flash"/);
  assert.doesNotMatch(wranglerExample, /AI_VISION_MODEL/);
  assert.match(validation, /gemini_image_ai/);
  assert.match(validation, /GEMINI_IMAGE_AI_NOT_CONFIGURED/);
});

test('Gemini fallback diagnostics never log secret or image bytes', () => {
  assert.match(source, /provider:\s*"gemini"/);
  assert.match(source, /stage:\s*"vision_inference_or_parse"/);
  const fallbackStart = source.indexOf('console.warn("AI_IMAGE_FALLBACK"');
  const fallbackEnd = source.indexOf('}));', fallbackStart);
  assert.ok(fallbackStart >= 0 && fallbackEnd > fallbackStart, 'fallback diagnostic block must exist');
  const fallbackBlock = source.slice(fallbackStart, fallbackEnd + 4);
  assert.doesNotMatch(fallbackBlock, /apiKey|bytes|base64|inlineData/);
});
