const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../src/ai/image-ai.service.ts'), 'utf8');

test('Workers AI vision uses top-level image input instead of OpenAI image_url blocks', () => {
  assert.match(source, /image:\s*dataUri/);
  assert.match(source, /messages:\s*\[/);
  assert.doesNotMatch(source, /type:\s*["']image_url["']/);
  assert.match(source, /payment_slip/);
  assert.match(source, /slip_amount/);
  assert.match(source, /Do not guess unreadable payment data/);
});
