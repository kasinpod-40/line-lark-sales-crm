const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

for (const relative of [
  'scripts/reconcile-lark-base-lifecycle-options.mjs',
  'scripts/recover-failed-qr-case.mjs',
]) {
  test(`${relative} parses as valid Node ESM`, () => {
    const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
}
