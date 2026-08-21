const test = require('node:test');
const assert = require('node:assert/strict');
const { pushLineMessages } = require('../.tmp-test/providers/line/line.provider.js');

test('LINE 409 with retry key is treated as already-accepted success', async () => {
  const originalFetch = globalThis.fetch;
  let seenRetryKey = '';
  globalThis.fetch = async (_url, init) => {
    const headers = new Headers(init.headers);
    seenRetryKey = headers.get('X-Line-Retry-Key') || '';
    return new Response(JSON.stringify({ message: 'retry key already accepted' }), { status: 409, headers: { 'content-type': 'application/json' } });
  };
  try {
    await assert.doesNotReject(() => pushLineMessages(
      { LINE_CHANNEL_ACCESS_TOKEN: 'token' },
      'Ucustomer',
      [{ type: 'text', text: 'hello' }],
      '123e4567-e89b-12d3-a456-426614174000',
    ));
    assert.equal(seenRetryKey, '123e4567-e89b-12d3-a456-426614174000');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('LINE non-409 API error still rejects', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'bad request' }), { status: 400 });
  try {
    await assert.rejects(() => pushLineMessages(
      { LINE_CHANNEL_ACCESS_TOKEN: 'token' },
      'Ucustomer',
      [{ type: 'text', text: 'hello' }],
      '123e4567-e89b-12d3-a456-426614174000',
    ), /LINE API/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
