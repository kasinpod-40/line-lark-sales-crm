const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('LINE queue consumer is configured for interactive CRM latency', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'wrangler.jsonc.example'), 'utf8'));
  const consumer = config.queues?.consumers?.find((item) => item.queue === 'line-lark-sales-crm-events');
  assert.ok(consumer, 'missing LINE queue consumer');
  assert.equal(consumer.max_batch_size, 1);
  assert.equal(consumer.max_batch_timeout, 1);
  assert.equal(consumer.max_concurrency, 5);
  assert.equal(consumer.max_retries, 5);
  assert.equal(consumer.dead_letter_queue, 'line-lark-sales-crm-events-dlq');
});

test('LINE inbound hot path overlaps profile and route reads with AI work', () => {
  const source = fs.readFileSync(path.join(root, 'src/services/case.service.ts'), 'utf8');
  assert.match(source, /const profilePromise = getLineUserProfile/);
  assert.match(source, /const activeRoutePromise = this\.operational\.findActiveCaseByLineUserId/);
  assert.match(source, /Promise\.all\(\[profilePromise, activeRoutePromise\]\)/);
});
