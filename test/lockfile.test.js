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

// npm writes these fields to the lockfile in a normalized form (checked with npm 10.9.9,
// `npm install --package-lock-only`): an empty object may be dropped (e.g. `optionalDependencies: {}`)
// or kept (`devDependencies: {}`), so empty counts as absent on both sides; and `bin` given as a
// string becomes { <name without @scope/>: path }, with "\" turned into "/" and a leading "./" dropped.
function normalizeBin(bin, name) {
  if (bin === undefined) return undefined;
  const obj = typeof bin === 'string' ? { [name.replace(/^@[^/]+\//, '')]: bin } : bin;
  return Object.fromEntries(Object.entries(obj)
    .map(([k, v]) => [k, String(v).replace(/\\/g, '/').replace(/^\.\//, '')]));
}
function normalize(field, value, name) {
  if (field === 'bin') value = normalizeBin(value, name);
  if (value && typeof value === 'object' && Object.keys(value).length === 0) return undefined;
  return value;
}

test('normalize matches what npm writes to the lockfile', () => {
  assert.deepStrictEqual(normalize('bin', './src/index.js', 'pushup'), { pushup: 'src/index.js' });
  assert.deepStrictEqual(normalize('bin', './a\\b.js', '@sc/pk'), { pk: 'a/b.js' });
  assert.deepStrictEqual(normalize('bin', { a: 'x.js' }, 'pushup'), { a: 'x.js' });
  assert.strictEqual(normalize('bin', undefined, 'pushup'), undefined);
  assert.strictEqual(normalize('optionalDependencies', {}, 'pushup'), undefined);
  assert.deepStrictEqual(normalize('devDependencies', { a: '1' }, 'pushup'), { a: '1' });
});

test('package-lock.json root entry matches package.json', () => {
  const entry = lock.packages && lock.packages[''];
  assert.ok(entry, 'package-lock.json has no root entry (packages[""])');
  for (const field of ['name', 'version', 'license', 'dependencies', 'engines',
    'devDependencies', 'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta', 'bin']) {
    // deepStrictEqual: absent on both sides (undefined === undefined) passes; absent on one side fails.
    assert.deepStrictEqual(normalize(field, entry[field], pkg.name), normalize(field, pkg[field], pkg.name),
      `package-lock.json packages[""].${field} differs from package.json; run npm install --package-lock-only`);
  }
});
