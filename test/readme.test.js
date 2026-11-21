'use strict';
// R2: the usage example in README.md must keep working.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('the README upscale example runs and returns the documented shape', async () => {
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  const blocks = [...readme.matchAll(/```js\r?\n([\s\S]*?)```/g)].map((m) => m[1]);
  const code = blocks.find((b) => b.includes('upscale('));
  assert.ok(code, 'README.md has no ```js block that calls upscale( - update this test if the example moved');

  // The example uses top-level await and assumes `arr` and `stride` exist, then leaves
  // `arr_out` and `stride_out` as locals: wrap it so we can feed and read those.
  const fn = new Function(
    'arr', 'stride', 'require',
    `return (async () => {\n${code}\nreturn [arr_out, stride_out];\n})();`,
  );
  const fakeRequire = (name) => {
    assert.strictEqual(name, 'pushup', `README example requires unexpected module ${name}`);
    return require('../src');
  };

  const saved = { q: process.env.PUSHUP_QUALITY, d: process.env.PUSHUP_DEVICE };
  process.env.PUSHUP_QUALITY = 'fast';
  process.env.PUSHUP_DEVICE = 'cpu';
  try {
    const w = 400, h = 300;
    const arr = new Uint8Array(w * h * 3);
    for (let i = 0; i < arr.length; i++) arr[i] = (i * 7) & 255;
    const [arr_out, stride_out] = await fn(arr, w * 3, fakeRequire);
    assert.strictEqual(stride_out, 1800, 'stride_out for 400x300 at factor 1.5');
    assert.strictEqual(arr_out.length, 1800 * 450);
  } finally {
    if (saved.q === undefined) delete process.env.PUSHUP_QUALITY; else process.env.PUSHUP_QUALITY = saved.q;
    if (saved.d === undefined) delete process.env.PUSHUP_DEVICE; else process.env.PUSHUP_DEVICE = saved.d;
  }
});

// BL24: the README "Development" section names every npm script of package.json, so a new script is not left undocumented.
// npm lifecycle hooks (they run by themselves, nobody types them) are exempt: the fixed names below, and `pre<x>` / `post<x>`
// of another script <x>.
const LIFECYCLE = new Set(['prepublishOnly', 'prepublish', 'prepare', 'prepack', 'postpack', 'preinstall', 'install', 'postinstall', 'preversion', 'version', 'postversion']);

// Names of `scripts` that the text of the "Development" section does not mention as `npm run <name>` (or `npm test` for `test`).
function undocumentedScripts(scripts, dev) {
  const names = Object.keys(scripts);
  const hook = (n) => LIFECYCLE.has(n) || /^(pre|post)(.+)/.test(n) && names.includes(n.replace(/^(pre|post)/, ''));
  const mentioned = (n) => (n === 'test'
    ? /\bnpm (run )?test(?![\w:-])/.test(dev)
    : new RegExp(`\\bnpm run ${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w:-])`).test(dev));
  return names.filter((n) => !hook(n) && !mentioned(n));
}

test('README "Development" names every npm script in package.json', () => {
  const root = path.join(__dirname, '..');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const dev = readme.split(/^## /m).find((s) => s.startsWith('Development'));
  assert.ok(dev, 'README has no "## Development" section');
  const { scripts } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.deepStrictEqual(undocumentedScripts(scripts, dev), [], 'npm scripts that README "Development" does not mention (add `npm run <name>` there)');
});

test('undocumentedScripts reports a missing script, and accepts a documented one and the exempt hooks', () => {
  const scripts = { test: 'x', 'test:slow': 'x', bench: 'x', build: 'x', pretest: 'x', prepublishOnly: 'x' };
  const dev = 'npm test\nnpm run test:slow\nnpm run bench -- a';
  assert.deepStrictEqual(undocumentedScripts(scripts, dev), ['build']);
  assert.deepStrictEqual(undocumentedScripts(scripts, `${dev}\nnpm run build`), []);
  // `npm run test:slow` is not a mention of `test`, and `npm run benchmark` is not a mention of `bench`
  assert.deepStrictEqual(undocumentedScripts({ test: 'x', bench: 'x' }, 'npm run test:slow\nnpm run benchmark'), ['test', 'bench']);
  assert.deepStrictEqual(undocumentedScripts({ test: 'x' }, 'npm run test'), []);
});
