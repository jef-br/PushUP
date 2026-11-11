'use strict';
// L1: the lockfile's root entry must agree with package.json. When it drifts (e.g. `engines`),
// every plain `npm install` rewrites package-lock.json and runs keep reverting it.
// L2: also every dependency field npm copies into the root entry, so adding e.g. a
// devDependency to package.json without updating the lockfile fails here.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const lock = require(path.join(root, 'package-lock.json'));

test('package-lock.json top level matches package.json name and version', () => {
  assert.strictEqual(lock.name, pkg.name);
  assert.strictEqual(lock.version, pkg.version);
});

// npm writes `bin` to the lockfile in its normalized form: a string becomes { <name>: path }
// and a leading "./" is dropped (checked with npm 10.9). Compare against that form.
function normalizeBin(bin, name) {
  if (bin === undefined) return undefined;
  const obj = typeof bin === 'string' ? { [name]: bin } : bin;
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, String(v).replace(/^\.\//, '')]));
}

test('normalizeBin matches what npm writes to the lockfile', () => {
  assert.deepStrictEqual(normalizeBin('./src/index.js', 'pushup'), { pushup: 'src/index.js' });
  assert.deepStrictEqual(normalizeBin({ a: 'x.js' }, 'pushup'), { a: 'x.js' });
  assert.strictEqual(normalizeBin(undefined, 'pushup'), undefined);
});

test('package-lock.json root entry matches package.json', () => {
  const entry = lock.packages && lock.packages[''];
  assert.ok(entry, 'package-lock.json has no root entry (packages[""])');
  for (const field of ['name', 'version', 'license', 'dependencies', 'engines',
    'devDependencies', 'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta', 'bin']) {
    // deepStrictEqual: absent on both sides (undefined === undefined) passes; absent on one side fails.
    const want = field === 'bin' ? normalizeBin(pkg.bin, pkg.name) : pkg[field];
    assert.deepStrictEqual(entry[field], want,
      `package-lock.json packages[""].${field} differs from package.json; run npm install --package-lock-only`);
  }
});
