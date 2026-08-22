const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const helperUrl = pathToFileURL(path.resolve(__dirname, '../scripts/lark-eventual-reconcile.mjs')).href;

async function loadHelpers() {
  return import(helperUrl);
}

test('reconcileIfNeeded reads once before write and does not immediately read stale state again', async () => {
  const { reconcileIfNeeded } = await loadHelpers();
  let reads = 0;
  let writes = 0;
  const result = reconcileIfNeeded({
    read: () => {
      reads += 1;
      return { state: 'old' };
    },
    matches: (value) => value.state === 'new',
    write: () => {
      writes += 1;
      return { ok: true };
    },
  });
  assert.deepEqual(result, { changed: 1, unchanged: 0, noOpRecovered: 0 });
  assert.equal(reads, 1);
  assert.equal(writes, 1);
});

test('reconcileIfNeeded skips write when persisted state already matches', async () => {
  const { reconcileIfNeeded } = await loadHelpers();
  let writes = 0;
  const result = reconcileIfNeeded({
    read: () => ({ state: 'new' }),
    matches: (value) => value.state === 'new',
    write: () => {
      writes += 1;
      return { ok: true };
    },
  });
  assert.deepEqual(result, { changed: 0, unchanged: 1, noOpRecovered: 0 });
  assert.equal(writes, 0);
});

test('verifyEventually tolerates stale reads until Lark state converges', async () => {
  const { verifyEventually } = await loadHelpers();
  const states = ['old', 'old', 'new'];
  const sleeps = [];
  const result = verifyEventually({
    read: () => ({ state: states.shift() || 'new' }),
    matches: (value) => value.state === 'new',
    delaysMs: [0, 5, 10],
    sleep: (ms) => sleeps.push(ms),
  });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 3);
  assert.deepEqual(sleeps, [5, 10]);
});

test('verifyEventually returns the final observed state after bounded retries', async () => {
  const { verifyEventually } = await loadHelpers();
  const result = verifyEventually({
    read: () => ({ state: 'still-old' }),
    matches: (value) => value.state === 'new',
    delaysMs: [0, 1, 1],
    sleep: () => {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.attempts, 3);
  assert.deepEqual(result.last, { state: 'still-old' });
});
