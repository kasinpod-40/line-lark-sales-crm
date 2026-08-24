const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeLarkMediaLocator, parseLarkMediaLocator } = require('../.tmp-test/services/media-asset.service.js');

test('Lark media locator round-trips message/resource identifiers safely', () => {
  const locator = {
    messageId: 'om_message:with/slash',
    resourceKey: 'img_key:%/abc',
    resourceType: 'image',
  };
  const encoded = encodeLarkMediaLocator(locator);
  assert.deepEqual(parseLarkMediaLocator(encoded), locator);
});

test('Lark media locator rejects legacy or malformed object keys', () => {
  assert.equal(parseLarkMediaLocator('case-media/case_1/token/file.pdf'), null);
  assert.equal(parseLarkMediaLocator('lark:image::missing-key'), null);
  assert.equal(parseLarkMediaLocator('lark:video:message:key'), null);
});
