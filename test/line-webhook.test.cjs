const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { handleLineWebhook } = require('../.tmp-test/routes/line/webhook.route.js');

function signature(secret, body) {
  return createHmac('sha256', secret).update(body).digest('base64');
}

function envWithQueue(secret, sent) {
  return {
    LINE_CHANNEL_SECRET: secret,
    LINE_CHANNEL_ACCESS_TOKEN: 'unused',
    LINE_EVENTS_QUEUE: {
      async send(body) { sent.push(body); },
    },
  };
}

test('valid LINE webhook normalizes direct-user text into queue contract', async () => {
  const secret = 'test-secret';
  const sent = [];
  const body = JSON.stringify({
    destination: 'Ubot',
    events: [{
      type: 'message',
      webhookEventId: 'evt-1',
      timestamp: 1787350000000,
      deliveryContext: { isRedelivery: false },
      source: { type: 'user', userId: 'Ucustomer' },
      message: { id: 'm-1', type: 'text', text: 'ขอราคา' },
    }],
  });
  const request = new Request('https://example.com/webhooks/line', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-line-signature': signature(secret, body) },
    body,
  });
  const response = await handleLineWebhook(request, envWithQueue(secret, sent));
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.enqueued_events, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].channel, 'LINE');
  assert.equal(sent[0].webhook_event_id, 'evt-1');
  assert.equal(sent[0].user_id, 'Ucustomer');
  assert.equal(sent[0].message.type, 'text');
  assert.equal(sent[0].message.text, 'ขอราคา');
});

test('invalid LINE signature is rejected before queue send', async () => {
  const sent = [];
  const body = JSON.stringify({ destination: 'Ubot', events: [] });
  const request = new Request('https://example.com/webhooks/line', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-line-signature': 'invalid' },
    body,
  });
  const response = await handleLineWebhook(request, envWithQueue('test-secret', sent));
  assert.equal(response.status, 401);
  assert.equal(sent.length, 0);
});
