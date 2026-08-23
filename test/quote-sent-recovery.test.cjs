const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('completed quote callback only repairs the card and does not resend LINE', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'card-action.service.ts'), 'utf8');
  const start = source.indexOf('case "confirm_quote"');
  const end = source.indexOf('case "open_qr_form"', start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);

  assert.match(block, /completedQuoteDraft\(draftId\)/);
  assert.match(block, /buildQuoteSentCard\(completed\.payload\)/);

  const recoveryStart = block.indexOf('if (!draft)');
  const newSend = block.indexOf('pushLineMessages', recoveryStart);
  const recoveryBreak = block.indexOf('break;', recoveryStart);
  assert.ok(recoveryBreak >= 0);
  assert.ok(newSend < 0 || recoveryBreak < newSend);
});
