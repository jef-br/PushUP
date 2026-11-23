'use strict';
// BL32: test/package.test.js only lists the files `npm pack --dry-run` would pack. This test packs for real,
// unpacks the tarball outside the repo and runs it, so a file that src/index.js needs but `files` leaves out
// (a model, a helper module) fails here. Dependencies are not reinstalled (no network): NODE_PATH points at this
// repo's node_modules, which is what `npm install pushup` would put next to the package.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const hasTar = spawnSync('tar', ['--version'], { stdio: 'ignore' }).status === 0;

test('the packed tarball, unpacked outside the repo, loads and upscales a 400x300 image',
  { skip: hasTar ? false : 'tar is not available' }, () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-pack-'));
    try {
      const out = execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', tmp], {
        cwd: root, encoding: 'utf8', shell: process.platform === 'win32',
      });
      const tgz = path.join(tmp, JSON.parse(out)[0].filename);
      assert.ok(fs.existsSync(tgz), `no tarball at ${tgz}`);
      execFileSync('tar', ['-xzf', tgz, '-C', tmp]);
      const pkgDir = path.join(tmp, 'package');
      const main = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).main;
      const entry = path.join(pkgDir, main);
      assert.ok(fs.existsSync(entry), `main ${main} is not in the tarball`);

      const code = `
        const { upscale } = require(${JSON.stringify(entry)});
        const w = 400, h = 300, stride = w * 3, arr = new Uint8Array(stride * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = y * stride + x * 3;
          arr[i] = x % 256; arr[i + 1] = y % 256; arr[i + 2] = (x + y) % 256;
        }
        upscale(arr, stride, 1).then(([out, s]) => console.log(JSON.stringify({ len: out.length, s })));
      `;
      const r = spawnSync(process.execPath, ['-e', code], {
        cwd: pkgDir,
        encoding: 'utf8',
        timeout: 60000,
        env: { ...process.env, NODE_PATH: path.join(root, 'node_modules'), PUSHUP_DEVICE: 'cpu', PUSHUP_QUALITY: 'fast' },
      });
      assert.strictEqual(r.status, 0, `child failed: ${r.stderr}`);
      const { len, s } = JSON.parse(r.stdout.trim().split('\n').pop());
      assert.strictEqual(s, 400 * 3, 'stride_out is out_width * 3 (400 px wide)');
      assert.strictEqual(len, s * 300, 'output length is stride_out * out_height (300 rows)');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
