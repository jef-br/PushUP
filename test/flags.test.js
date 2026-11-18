'use strict';
// BU1: bench/flags.js (checkFlags) and the four scripts that use it reject an unknown or misspelled flag
// (and the `--name=value` form, which the scripts do not parse) with one line, exit 1, empty stdout, < 5 s.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');
const { checkFlags } = require('../bench/flags.js');

const SPEC = { values: ['--sizes', '--limit'], switches: ['--json'] };

test('checkFlags: known flags and switches pass', () => {
  assert.strictEqual(checkFlags([], SPEC), null);
  assert.strictEqual(checkFlags(['--sizes', '400', '--json', '--limit', '3'], SPEC), null);
});
test('checkFlags: an unknown flag is reported with the allowed list', () => {
  assert.strictEqual(checkFlags(['--size', '400'], SPEC), 'unknown flag --size; allowed: --sizes, --limit, --json');
  assert.strictEqual(checkFlags(['--json', '--bogus'], SPEC), 'unknown flag --bogus; allowed: --sizes, --limit, --json');
});
test('checkFlags: the first unknown flag is the one reported', () => {
  assert.match(checkFlags(['--a', '--b'], SPEC), /^unknown flag --a;/);
});
test('checkFlags: the --name=value form is unknown and says how to write it', () => {
  assert.strictEqual(checkFlags(['--sizes=400'], SPEC), 'unknown flag --sizes=400; use "--sizes value"; allowed: --sizes, --limit, --json');
});
test('checkFlags: the token after a value flag is its value, even if it looks like a flag', () => {
  assert.strictEqual(checkFlags(['--sizes', '--json'], SPEC), null);
  assert.strictEqual(checkFlags(['--sizes', '--bogus'], SPEC), null);
  // a switch does not take a value: the next token is judged on its own
  assert.match(checkFlags(['--json', '--bogus'], SPEC), /^unknown flag --bogus/);
});
test('checkFlags: a value flag as the last token is accepted here (the script checks the missing value)', () => {
  assert.strictEqual(checkFlags(['--sizes'], SPEC), null);
});
test('checkFlags: plain words and negative numbers are not flags (allowed only as `positional`); an empty spec lists (none)', () => {
  assert.strictEqual(checkFlags(['dir', '-1', ''], { ...SPEC, positional: 3 }), null);
  assert.strictEqual(checkFlags(['--x'], {}), 'unknown flag --x; allowed: (none)');
});

// BU3: a stray word that no flag consumes.
const STRAY = 'a flag takes one value, write a list as "400,800" without spaces';
test('checkFlags: a stray word after a value is reported (--sizes 400 800)', () => {
  assert.strictEqual(checkFlags(['--sizes', '400', '800'], SPEC), `unexpected argument 800; ${STRAY}`);
});
test('checkFlags: a stray word after a switch has its own message', () => {
  assert.strictEqual(checkFlags(['--json', 'maybe'], SPEC), 'unexpected argument maybe after the switch --json');
});
test('checkFlags: a stray word first is reported with the generic hint', () => {
  assert.match(checkFlags(['400'], SPEC), /^unexpected argument 400;/);
});
test('checkFlags: an empty string is a value of a value flag, and a stray word if nothing consumes it', () => {
  assert.strictEqual(checkFlags(['--high-sizes', ''], { values: ['--high-sizes'] }), null);
  assert.strictEqual(checkFlags(['--json', ''], SPEC), 'unexpected argument  after the switch --json');
});
test('checkFlags: negative numbers are values of their flag', () => {
  assert.strictEqual(checkFlags(['--limit', '-1'], SPEC), null);
  assert.match(checkFlags(['--limit', '-1', '-2'], SPEC), /^unexpected argument -2;/);
});
test('checkFlags: `positional` words are allowed up to the count', () => {
  assert.strictEqual(checkFlags(['a', '--json', 'b'], { ...SPEC, positional: 2 }), null);
  assert.match(checkFlags(['a', 'b', 'c'], { ...SPEC, positional: 2 }), /^unexpected argument c;/);
});

let dir;
test.before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-flags-'));
  const raw = Buffer.alloc(300 * 200 * 3, 7);
  await sharp(raw, { raw: { width: 300, height: 200, channels: 3 } }).png().toFile(path.join(dir, 'a_1.png'));
});
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const B = (f) => path.join(__dirname, '..', 'bench', f);
const SCRIPTS = {
  'bench.js': { pre: () => [dir, '--methods', 'lanczos'], allowed: '--methods, --sizes, --limit, --save, --by-source, --by-aspect, --json' },
  'throughput.js': { pre: () => [], allowed: '--seconds, --sizes' },
  'memory.js': { pre: () => [], allowed: '--sizes, --factors, --high-sizes' },
  'memory-breakdown.js': { pre: () => [], allowed: '--sizes, --arena' },
};
for (const [script, { pre, allowed }] of Object.entries(SCRIPTS)) {
  for (const [bad, line] of [
    ['--size', `unknown flag --size; allowed: ${allowed}`],
    ['--sizes=400', `unknown flag --sizes=400; use "--sizes value"; allowed: ${allowed}`],
  ]) {
    test(`${script} ${bad} is rejected`, () => {
      const t0 = Date.now();
      const r = spawnSync(process.execPath, [B(script), ...pre(), bad, '400'], { encoding: 'utf8' });
      assert.ok(Date.now() - t0 < 5000, `took ${Date.now() - t0} ms`);
      assert.strictEqual(r.status, 1, r.stderr);
      assert.strictEqual(r.stdout, '');
      assert.strictEqual(r.stderr.split('\n')[0], line);
    });
  }
}
test('bench.js: a missing directory or a flag first is still the exit-2 usage error', () => {
  const r = spawnSync(process.execPath, [B('bench.js'), '--size', '400'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 2);
  assert.ok(r.stderr.startsWith('usage: node bench/bench.js'), r.stderr);
});
test('bench.js: `--sizes --json` gets the script\'s own --sizes message, not "unknown flag"', () => {
  const r = spawnSync(process.execPath, [B('bench.js'), dir, '--sizes', '--json'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stderr.split('\n')[0], '--sizes must be a comma list of integers from 100 to 4000');
});
test('bench.js: a valid run with every kind of flag still works', () => {
  const r = spawnSync(process.execPath, [B('bench.js'), dir, '--methods', 'lanczos', '--sizes', '200', '--limit', '1', '--by-source', '--by-aspect', '--json'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(JSON.parse(r.stdout).images, 1);
});

// BU3: every script that calls checkFlags rejects a stray word (a list typed with a space) before any model loads.
const STRAY_ARGV = [
  ['bench.js', () => [dir, '--limit', '1', '2'], '2'],
  ['arena.js', () => ['--runs', '1', '2'], '2'],
  ['cold.js', () => ['--sizes', '400', '800'], '800'],
  ['edges.js', () => ['--factors', '1.5', '2'], '2'],
  ['eventloop.js', () => ['--sizes', '400', '800'], '800'],
  ['memory-breakdown.js', () => ['--sizes', '400', '800'], '800'],
  ['memory-creep.js', () => ['--calls', '6', '7'], '7'],
  ['memory.js', () => ['--sizes', '400', '800'], '800'],
  ['pad.js', () => ['--limit', '1', '2'], '2'],
  ['profile.js', () => ['--sizes', '400', '800'], '800'],
  ['threads.js', () => ['--sizes', '400', '800'], '800'],
  ['throughput.js', () => ['--sizes', '400', '800'], '800'],
  ['worker.js', () => ['--sizes', '400', '800'], '800'],
];
for (const [script, argv, word] of STRAY_ARGV) {
  test(`${script} ${argv().slice(script === 'bench.js' ? 1 : 0).join(' ')}: stray word ${word} is rejected`, () => {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [B(script), ...argv()], { encoding: 'utf8' });
    assert.ok(Date.now() - t0 < 5000, `took ${Date.now() - t0} ms`);
    assert.strictEqual(r.status, 1, r.stderr);
    assert.strictEqual(r.stdout, '');
    assert.strictEqual(r.stderr.split('\n')[0], `unexpected argument ${word}; ${STRAY}`);
  });
}
test('memory-breakdown.js --arena maybe: a word after the switch is rejected', () => {
  const r = spawnSync(process.execPath, [B('memory-breakdown.js'), '--arena', 'maybe'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1, r.stderr);
  assert.strictEqual(r.stdout, '');
  assert.strictEqual(r.stderr.split('\n')[0], 'unexpected argument maybe after the switch --arena');
});
