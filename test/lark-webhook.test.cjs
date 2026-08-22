const test = require('node:test');
const assert = require('node:assert/strict');
const { handleLarkWebhook } = require('../.tmp-test/routes/lark/webhook.route.js');

function ctx() {
  return {
    waitUntil() {},
  };
}

function request(payload) {
  return new Request('https://example.com/webhooks/lark', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

test('Lark URL verification challenge is echoed immediately without runtime token validation', async () => {
  const response = await handleLarkWebhook(
    request({ challenge: 'challenge-123', token: 'console-token', type: 'url_verification' }),
    { LARK_VERIFICATION_TOKEN: 'different-runtime-token' },
    ctx(),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { challenge: 'challenge-123' });
});

test('non-challenge Lark callbacks still require the configured verification token', async () => {
  const response = await handleLarkWebhook(
    request({
      header: { event_type: 'im.message.receive_v1', token: 'wrong-token' },
      event: {},
    }),
    { LARK_VERIFICATION_TOKEN: 'expected-token' },
    ctx(),
  );

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.message, 'Invalid Lark verification token');
});
