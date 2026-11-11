#!/usr/bin/env bash
# Smoke-test the published package (task K1): pack this repo, install the tarball into a
# fresh temp directory outside the repo, and run one upscale there against the contract.
#
# Usage: bash scripts/pack-smoke.sh
# Env:   PUSHUP_SMOKE_NPM_ARGS  extra arguments for `npm install` in the temp dir, e.g.
#        PUSHUP_SMOKE_NPM_ARGS=--onnxruntime-node-install-cuda=skip when the CUDA download is
#        blocked (sandbox).
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/pushup-pack-smoke.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT

cd "$repo"
tgz="$(npm pack --ignore-scripts --silent --pack-destination "$tmp" | tail -n 1)"
echo "packed $tgz"

cd "$tmp"
npm init -y >/dev/null
echo "npm install extra args: ${PUSHUP_SMOKE_NPM_ARGS:-(none)}"
# shellcheck disable=SC2086
npm install --no-audit --no-fund ${PUSHUP_SMOKE_NPM_ARGS:-} "./$tgz"

cat > smoke.js <<'JS'
'use strict';
const assert = require('node:assert');
const path = require('node:path');
const resolved = require.resolve('pushup');
assert.ok(resolved.startsWith(path.join(__dirname, 'node_modules') + path.sep),
  `pushup resolved outside the temp install: ${resolved}`);
const { upscale } = require('pushup');
const w = 400, h = 300;
const arr = new Uint8Array(w * h * 3);
for (let i = 0; i < arr.length; i++) arr[i] = (i * 7) & 255;
upscale(arr, w * 3, 1.5).then(([out, stride]) => {
  assert.ok(out instanceof Uint8Array, 'arr_out is not a byte array');
  assert.strictEqual(stride, 1800);
  assert.strictEqual(out.length, 600 * 450 * 3);
  console.log(`pack-smoke OK: ${resolved} -> ${out.length} bytes, stride ${stride}`);
}).catch((err) => { console.error(err); process.exit(1); });
JS
node smoke.js
