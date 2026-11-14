'use strict';
// D3: the README "Benchmark" commands must point at files and flags that exist.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

test('every bench/<file> path mentioned in README.md exists', () => {
  const paths = [...new Set([...readme.matchAll(/\bbench\/[\w./-]*\.(?:js|sh|py)\b/g)].map((m) => m[0]))];
  assert.ok(paths.includes('bench/bench.js') && paths.includes('bench/gate.js') && paths.includes('bench/fetch_testset.sh'),
    `README should mention bench.js, gate.js and fetch_testset.sh; found ${paths.join(', ')}`);
  for (const p of paths) assert.ok(fs.existsSync(path.join(root, p)), `README mentions ${p}, which does not exist`);
});

test('every flag used with bench/bench.js in README.md is in its usage line', () => {
  const src = fs.readFileSync(path.join(root, 'bench', 'bench.js'), 'utf8');
  const usage = src.split('\n').find((l) => /^\/\/ Usage: node bench\/bench\.js/.test(l));
  assert.ok(usage, 'bench/bench.js has no "// Usage: node bench/bench.js" line');
  const lines = readme.split('\n').filter((l) => /node bench\/bench\.js/.test(l));
  assert.ok(lines.length > 0, 'README has no `node bench/bench.js` command');
  // Flags given on a command line, plus flags named in backticks in the prose (`--json`).
  const flags = new Set([
    ...lines.flatMap((l) => [...l.matchAll(/\s(--[a-z][\w-]*)/g)].map((m) => m[1])),
    ...[...readme.matchAll(/`(--[a-z][\w-]*)`/g)].map((m) => m[1]),
  ]);
  assert.ok(flags.has('--json') && flags.has('--by-source'), `README should mention --json and --by-source; found ${[...flags].join(' ')}`);
  for (const f of flags) {
    assert.ok(new RegExp(`\\[${f}\\b`).test(usage), `README uses ${f} but the bench.js usage line does not list it: ${usage}`);
  }
});

// D6: the README "Development" commands must point at scripts that exist.
test('every scripts/<file> path mentioned in README.md exists', () => {
  const paths = [...new Set([...readme.matchAll(/\bscripts\/[\w./-]*\.(?:js|sh|py)\b/g)].map((m) => m[0]))];
  assert.ok(paths.includes('scripts/pack-smoke.sh'), `README should mention scripts/pack-smoke.sh; found ${paths.join(', ')}`);
  for (const p of paths) assert.ok(fs.existsSync(path.join(root, p)), `README mentions ${p}, which does not exist`);
});

test('README "Development" lists the dev scripts and the CUDA-skip install flag', () => {
  const dev = readme.split(/^## /m).find((s) => s.startsWith('Development'));
  assert.ok(dev, 'README has no "## Development" section');
  for (const cmd of ['npm test', 'bash scripts/pack-smoke.sh', 'node bench/profile.js', 'node bench/cold.js',
    'node bench/threads.js', '--onnxruntime-node-install-cuda=skip', 'docs/PERF.md']) {
    assert.ok(dev.includes(cmd), `README "Development" does not mention ${cmd}`);
  }
});

// DOC6: every runnable bench script (one with a "// Usage:" comment near its top) is named in the
// README by its full path. Library modules without a command line are exempt.
test('README names every runnable bench/*.js script by its full path', () => {
  const exempt = new Map([
    ['metrics.js', 'library: PSNR/SSIM/GMSD functions used by bench.js, no command line'],
    ['aspect.js', 'library: aspect-group helper used by bench.js, no command line'],
  ]);
  const files = fs.readdirSync(path.join(root, 'bench')).filter((f) => f.endsWith('.js'));
  const runnable = files.filter((f) => {
    if (exempt.has(f)) return false;
    const head = fs.readFileSync(path.join(root, 'bench', f), 'utf8').split('\n').slice(0, 15);
    return head.some((l) => /^\/\/ Usage:/.test(l));
  });
  assert.ok(runnable.length >= 9, `expected at least 9 runnable bench scripts, found ${runnable.join(', ')}`);
  for (const f of files) {
    if (!exempt.has(f) && !runnable.includes(f)) {
      assert.fail(`bench/${f} has no "// Usage:" line in its first 15 lines and is not on the exempt list; add one or exempt it with a reason`);
    }
  }
  for (const f of runnable) {
    assert.ok(readme.includes(`bench/${f}`), `README does not name bench/${f}`);
  }
});

