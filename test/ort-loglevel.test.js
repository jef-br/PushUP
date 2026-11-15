'use strict';
// F-2026-11-15-0733: onnxruntime creates its environment once, at first use, with `env.logLevel` (default 'warning'),
// and start-up warnings (device discovery on some VMs, seen on GitHub runners) went to stderr. src/index.js lowers the
// level to 'error' while it still has its default; a level the application chose is kept.
// Each case runs in a child process, because the level is read once per process.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const SRC = path.join(root, 'src', 'index.js');

// Child: optionally set a level before requiring src, then create one session (this starts the ORT environment).
const CHILD = `
const ort = require(${JSON.stringify(path.join(root, 'node_modules', 'onnxruntime-node'))});
if (process.argv[1]) ort.env.logLevel = process.argv[1];
const { _MODES, _sessionOptions } = require(${JSON.stringify(SRC)});
ort.InferenceSession.create(_MODES.fast.modelPath, _sessionOptions(['cpu'])).then(() => console.log('level=' + ort.env.logLevel));
`;

function run(level) {
  const r = spawnSync(process.execPath, ['-e', CHILD, level], { encoding: 'utf8', timeout: 30000 });
  assert.strictEqual(r.status, 0, r.stderr);
  return r;
}

test('the default ORT log level becomes "error" once src is loaded, and nothing is written to stderr', () => {
  const r = run('');
  assert.strictEqual(r.stdout.trim(), 'level=error');
  assert.strictEqual(r.stderr, '');
});

test('a log level the application chose is kept, and it really controls the ORT start-up log', () => {
  const r = run('verbose');
  assert.strictEqual(r.stdout.split('\n').find((l) => l.startsWith('level=')), 'level=verbose');
  // The start-up logger (device discovery, the source of the CI warning) writes through env.logLevel.
  assert.match(r.stderr + r.stdout, /device_discovery/, 'verbose level shows the device discovery log lines');
});

test('"fatal" chosen by the application is kept too', () => {
  const r = run('fatal');
  assert.strictEqual(r.stdout.trim(), 'level=fatal');
});
