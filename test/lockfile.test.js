'use strict';
// L1: the lockfile's root entry must agree with package.json. When it drifts (e.g. `engines`),
// every plain `npm install` rewrites package-lock.json and runs keep reverting it.
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

test('package-lock.json root entry matches package.json', () => {
  const entry = lock.packages && lock.packages[''];
  assert.ok(entry, 'package-lock.json has no root entry (packages[""])');
  for (const field of ['name', 'version', 'license', 'dependencies', 'engines']) {
    assert.deepStrictEqual(entry[field], pkg[field],
      `package-lock.json packages[""].${field} differs from package.json; run npm install --package-lock-only`);
  }
});
