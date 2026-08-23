const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(process.cwd(), 'src/services/card-action.service.ts'), 'utf8');

test('new quote always resets to exactly one item', () => {
  assert.match(
    source,
    /buildQuoteFormCard\(route\.case_id, asNumber\(this\.env\.QUOTE_DEFAULT_VAT_RATE, 7\), 1, \{\}\)/,
  );
});

test('quote form uses one remembered message per case instead of replying every time', () => {
  assert.match(source, /ui:quote-card:\$\{caseId\}/);
  assert.match(source, /await this\.lark\.patchCard\(existingMessageId, card\)/);
  assert.match(source, /await this\.rememberQuoteCardMessageId\(route\.case_id, operatorOpenId, messageId\)/);
});

test('quote preview replaces the active form card instead of creating a second active quote card', () => {
  assert.match(source, /await this\.lark\.patchCard\(event\.messageId, preview\)/);
  assert.match(source, /await this\.rememberQuoteCardMessageId\(route\.case_id, event\.operatorOpenId, event\.messageId\)/);
});
