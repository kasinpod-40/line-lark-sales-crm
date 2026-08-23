const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/ai/image-ai.service.ts'), 'utf8');
const cardSource = fs.readFileSync(path.join(root, 'src/providers/lark/payment-slip.card.ts'), 'utf8');
const envSource = fs.readFileSync(path.join(root, 'src/config/env.ts'), 'utf8');
const validation = fs.readFileSync(path.join(root, 'src/config/validation.ts'), 'utf8');
const wranglerExample = fs.readFileSync(path.join(root, 'wrangler.jsonc.example'), 'utf8');

test('payment-slip image analysis uses Gemini multimodal structured output with minimal thinking on 3.6', () => {
  assert.match(source, /DEFAULT_GEMINI_IMAGE_MODEL\s*=\s*"gemini-3\.6-flash"/);
  assert.match(source, /FALLBACK_GEMINI_IMAGE_MODEL\s*=\s*"gemini-3\.7-flash"/);
  assert.match(source, /LEGACY_GEMINI_IMAGE_MODEL\s*=\s*"gemini-2\.5-flash"/);
  assert.match(source, /configured === LEGACY_GEMINI_IMAGE_MODEL/);
  assert.match(source, /generativelanguage\.googleapis\.com\/v1beta\/models/);
  assert.match(source, /"x-goog-api-key": apiKey/);
  assert.match(source, /inlineData/);
  assert.match(source, /mimeType: normalizedMime/);
  assert.match(source, /data: encodedImage/);
  assert.match(source, /function thinkingLevelForModel\(model: string\): "minimal" \| "low"/);
  assert.match(source, /model === FALLBACK_GEMINI_IMAGE_MODEL \? "low" : "minimal"/);
  assert.match(source, /thinkingConfig:\s*\{\s*thinkingLevel:\s*thinkingLevelForModel\(model\)\s*\}/);
  assert.match(source, /maxOutputTokens:\s*256/);
  assert.match(source, /responseMimeType:\s*"application\/json"/);
  assert.match(source, /responseJsonSchema:\s*IMAGE_ANALYSIS_JSON_SCHEMA/);
  assert.doesNotMatch(source, /responseFormat:\s*\{/);
  assert.match(source, /slip_amount/);
  assert.match(source, /ห้ามใช้เลขบัญชี เลขอ้างอิง วันที่ เวลา หรือข้อมูลใน QR code เป็น slip_amount/);
  assert.doesNotMatch(source, /temperature:\s*0|candidateCount|thinkingBudget/);
  assert.doesNotMatch(source, /env\.AI!?\.run|@cf\/moondream|@cf\/meta\/llama-3\.2-11b-vision-instruct/);
});

test('Gemini image capacity errors fail over immediately instead of sleeping and retrying the same model', () => {
  assert.match(source, /RETRYABLE_GEMINI_STATUSES\s*=\s*new Set\(\[429, 500, 502, 503, 504\]\)/);
  assert.match(source, /AI_IMAGE_FAILOVER/);
  assert.match(source, /from_model/);
  assert.match(source, /to_model/);
  assert.match(source, /AI_IMAGE_SUCCESS/);
  assert.match(source, /elapsed_ms/);
  assert.doesNotMatch(source, /function sleep|retryDelayMs|attempt < 2|AI_IMAGE_RETRY/);
});

test('payment slip fast-path card is a neutral progress state and final buttons fit narrow Lark cards', () => {
  assert.match(cardSource, /template:\s*"blue"/);
  assert.match(cardSource, /กำลังตรวจหลักฐานการชำระเงิน/);
  assert.match(cardSource, /"⚠️ ยืนยันรับเงิน"/);
  assert.match(cardSource, /"✅ ยืนยันรับเงิน"/);
  assert.doesNotMatch(cardSource, /ตรวจแล้ว ยืนยันรับชำระ|ตรวจเองแล้ว ยืนยันรับชำระ/);
});

test('Gemini image secret and current model are explicit reusable install configuration', () => {
  assert.match(envSource, /GEMINI_API_KEY\?: string/);
  assert.match(envSource, /GEMINI_IMAGE_MODEL\?: string/);
  assert.match(wranglerExample, /"GEMINI_IMAGE_MODEL": "gemini-3\.6-flash"/);
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
