'use strict';
// HP7: bench/throughput.js (task P5) stops its model children when one fails and on SIGTERM / SIGINT.
// (a)/(b) P5_FAIL_CHILD=load|run: the parent exits 1 with a message. These two cases cover the failure path
//   (the `catch` that calls killAll()) and the exit code. They do NOT prove that killAll() works: the failing
//   child is the only one forked in the first configuration (1 x N), so there is no survivor to stop.
// (c)/(d) SIGTERM / SIGINT after the children exist: exit code 143 / 130 and every child that was alive just
//   before the signal is gone afterwards (these two prove the children are killed).
// Measured limit (mutation by hand): removing the signal handlers fails (c) and (d) (wrong exit code, children
// left behind), but emptying the body of killAll() does NOT fail any case: forked children exit on their own when
// the parent's IPC channel closes, so killAll() is a belt-and-braces stop that this test cannot tell apart.
// Child discovery uses `ps --ppid` and /proc (Linux); the signal cases are skipped elsewhere.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bench', 'throughput.js');
const ARGS = [SCRIPT, '--seconds', '1', '--sizes', '400'];
const linux = process.platform === 'linux';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = (extra = {}) => ({ ...process.env, PUSHUP_DEVICE: 'cpu', ...extra });

function childrenOf(pid) {
  const r = spawnSync('ps', ['-o', 'pid=', '--ppid', String(pid)], { encoding: 'utf8' });
  return r.stdout.split('\n').map((s) => s.trim()).filter(Boolean).map(Number);
}
// A zombie (state Z) is dead for our purposes: only its parent's reaping is missing.
function alive(pid) {
  try { return fs.readFileSync(`/proc/${pid}/stat`, 'utf8').replace(/^.*\) /, '')[0] !== 'Z'; } catch { return false; }
}

for (const mode of ['load', 'run']) {
  test(`P5_FAIL_CHILD=${mode}: the parent exits 1 with a message`, () => {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, ARGS, { encoding: 'utf8', timeout: 120000, env: env({ P5_FAIL_CHILD: mode }) });
    console.log(`throughput.js P5_FAIL_CHILD=${mode}: ${Date.now() - t0} ms`);
    assert.strictEqual(r.status, 1, `signal=${r.signal} stderr=${r.stderr}`);
    assert.match(r.stderr, /forced crash|child exited/);
  });
}

for (const [sig, code] of [['SIGTERM', 143], ['SIGINT', 130]]) {
  test(`${sig} during the run: exit ${code} and no child left`, { skip: linux ? false : 'needs ps --ppid and /proc (Linux)' }, async () => {
    const p = spawn(process.execPath, ARGS, { env: env(), stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    const exited = new Promise((resolve) => p.once('exit', (c, s) => resolve({ c, s })));
    await new Promise((resolve) => p.stdout.once('data', resolve)); // the header: children are forked right after
    let kids = [];
    for (let i = 0; i < 50 && !kids.length; i++) { kids = childrenOf(p.pid); if (!kids.length) await sleep(100); }
    assert.ok(kids.length >= 1, 'no child process found before the signal');
    assert.ok(kids.every(alive), 'a child was already dead before the signal');
    p.kill(sig);
    const { c, s } = await Promise.race([exited, sleep(20000).then(() => { p.kill('SIGKILL'); throw new Error('the parent did not exit within 20 s of ' + sig); })]);
    assert.strictEqual(c, code, `code=${c} signal=${s} stderr=${err}`);
    for (let i = 0; i < 50 && kids.some(alive); i++) await sleep(100);
    assert.deepStrictEqual(kids.filter(alive), [], 'children still alive 5 s after the parent exited');
  });
}
