const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash, createCipheriv } = require('node:crypto');
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

function encryptLikeLark(encryptKey, plaintext) {
  const key = createHash('sha256').update(encryptKey).digest();
  const iv = Buffer.from('0123456789abcdef', 'utf8');
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
  ]);
  return Buffer.concat([iv, encrypted]).toString('base64');
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

test('encrypted Lark URL verification challenge decrypts and echoes in Workers-compatible path', async () => {
  const encryptKey = 'lark-encrypt-key-for-test';
  const plaintext = JSON.stringify({
    challenge: 'encrypted-challenge-456',
    token: 'console-token',
    type: 'url_verification',
  });

  const response = await handleLarkWebhook(
    request({ encrypt: encryptLikeLark(encryptKey, plaintext) }),
    {
      LARK_ENCRYPT_KEY: encryptKey,
      LARK_VERIFICATION_TOKEN: 'different-runtime-token',
    },
    ctx(),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { challenge: 'encrypted-challenge-456' });
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
