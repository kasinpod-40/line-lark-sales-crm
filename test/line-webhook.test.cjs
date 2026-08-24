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

async function postWebhook(secret, payload, sent) {
  const body = JSON.stringify(payload);
  const request = new Request('https://example.com/webhooks/line', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-line-signature': signature(secret, body) },
    body,
  });
  return handleLineWebhook(request, envWithQueue(secret, sent));
}

test('valid LINE webhook normalizes direct-user text into queue contract', async () => {
  const secret = 'test-secret';
  const sent = [];
  const response = await postWebhook(secret, {
    destination: 'Ubot',
    events: [{
      type: 'message',
      webhookEventId: 'evt-1',
      timestamp: 1787350000000,
      deliveryContext: { isRedelivery: false },
      source: { type: 'user', userId: 'Ucustomer' },
      message: { id: 'm-1', type: 'text', text: 'ขอราคา' },
    }],
  }, sent);
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

test('LINE webhook normalizes SRS file audio and location metadata', async () => {
  const secret = 'test-secret';
  const sent = [];
  const response = await postWebhook(secret, {
    destination: 'Ubot',
    events: [
      {
        type: 'message', webhookEventId: 'evt-file', timestamp: 1787350000001,
        deliveryContext: { isRedelivery: false }, source: { type: 'user', userId: 'Ucustomer' },
        message: { id: 'm-file', type: 'file', fileName: 'proposal.pdf', fileSize: 12345 },
      },
      {
        type: 'message', webhookEventId: 'evt-audio', timestamp: 1787350000002,
        deliveryContext: { isRedelivery: false }, source: { type: 'user', userId: 'Ucustomer' },
        message: { id: 'm-audio', type: 'audio', duration: 4321, contentProvider: { type: 'line' } },
      },
      {
        type: 'message', webhookEventId: 'evt-location', timestamp: 1787350000003,
        deliveryContext: { isRedelivery: false }, source: { type: 'user', userId: 'Ucustomer' },
        message: { id: 'm-location', type: 'location', title: 'Office', address: 'Bangkok', latitude: 13.7, longitude: 100.5 },
      },
    ],
  }, sent);
  assert.equal(response.status, 200);
  assert.equal(sent.length, 3);
  assert.equal(sent[0].message.type, 'file');
  assert.equal(sent[0].message.file_name, 'proposal.pdf');
  assert.equal(sent[0].message.file_size, 12345);
  assert.equal(sent[1].message.type, 'audio');
  assert.equal(sent[1].message.duration_ms, 4321);
  assert.equal(sent[2].message.type, 'location');
  assert.equal(sent[2].message.latitude, 13.7);
  assert.equal(sent[2].message.longitude, 100.5);
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
