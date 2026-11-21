'use strict';
// BL18: .github/workflows/slow-tests.yml runs the opt-in slow tests weekly and on demand. Reads the files as text.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const wf = path.join(__dirname, '..', '.github', 'workflows');
const slow = fs.readFileSync(path.join(wf, 'slow-tests.yml'), 'utf8');
const ci = fs.readFileSync(path.join(wf, 'ci.yml'), 'utf8');
const onBlock = (slow.match(/^on:\n((?:[ \t]+.*\n|[ \t]*\n)+)/m) || [])[1] || '';

test('slow-tests.yml triggers on workflow_dispatch and a weekly schedule only', () => {
  assert.match(onBlock, /^ {2}workflow_dispatch:/m);
  assert.match(onBlock, /^ {2}schedule:/m);
  assert.match(onBlock, /cron:\s*'[^']+'/);
  assert.doesNotMatch(onBlock, /^ {2}(push|pull_request|pull_request_target)\b/m);
  const triggers = [...onBlock.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]).sort();
  assert.deepStrictEqual(triggers, ['schedule', 'workflow_dispatch']);
  const cron = onBlock.match(/cron:\s*'([^']+)'/)[1].split(/\s+/);
  assert.strictEqual(cron.length, 5);
  assert.match(cron[4], /^\d$/, 'day-of-week is a single day, so it runs once a week');
});

test('slow-tests.yml runs npm run test:slow with a 30 minute timeout and read-only permissions', () => {
  assert.match(slow, /^ {6}- run: npm run test:slow\s*$/m);
  assert.match(slow, /timeout-minutes:\s*30\b/);
  assert.match(slow, /^permissions:\n {2}contents: read\n/m);
  assert.match(slow, /runs-on:\s*ubuntu-latest/);
  assert.match(slow, /node-version:\s*22\b/);
  assert.match(slow, /npm ci --onnxruntime-node-install-cuda=skip/);
  assert.strictEqual((slow.match(/^ {2}\w[\w-]*:\n {4}runs-on:/gm) || []).length, 1, 'exactly one job');
});

test('ci.yml does not run the slow tests', () => {
  assert.doesNotMatch(ci, /PUSHUP_SLOW_TESTS/);
  assert.doesNotMatch(ci, /test:slow/);
});
