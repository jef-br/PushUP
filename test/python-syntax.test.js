'use strict';
// BL25: the Python build tools (tools/, bench/, scripts/) are build-time only and no other test touches them, so a
// syntax error would only show when someone needs the tool. This test only parses them (`ast.parse`): nothing is
// imported or run, so no Python package (numpy, torch) is needed and nothing is written.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const PARSE = 'import ast,sys; ast.parse(open(sys.argv[1], encoding="utf-8").read(), sys.argv[1])';
const hasPython = spawnSync('python3', ['--version'], { encoding: 'utf8' }).status === 0;
const skip = hasPython ? false : 'python3 is not on the PATH (the Python tools are build-time only)';

// Returns null when `file` parses, else the interpreter's message.
function parseProblem(file) {
  const r = spawnSync('python3', ['-I', '-c', PARSE, file], { encoding: 'utf8', timeout: 20000 });
  return r.status === 0 ? null : `${file}: ${(r.stderr || '').trim().split(/\r\n|\r|\n/).slice(-3).join(' | ') || `exit ${r.status}`}`;
}

// Generated or vendored directories are not ours: bench/out (the test set, and the venv bench/fetch_testset.sh may create
// there, with thousands of third-party files), node_modules, caches and hidden directories.
const SKIP_DIRS = new Set(['out', 'node_modules', 'venv', '__pycache__']);

function pyFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) out.push(...pyFiles(p)); }
    else if (e.name.endsWith('.py')) out.push(p);
  }
  return out;
}

const files = ['tools', 'bench', 'scripts'].flatMap((d) => pyFiles(path.join(root, d))).sort();

test('there are Python build tools to check', () => {
  assert.ok(files.length >= 8, `found ${files.length} .py files: ${files.join(', ')}`);
});

test('every .py file under tools/, bench/ and scripts/ parses', { skip }, () => {
  const problems = files.map(parseProblem).filter(Boolean);
  assert.deepStrictEqual(problems, [], `${problems.length} of ${files.length} Python files do not parse`);
});

test('pyFiles skips generated and vendored directories (bench/out, venv, node_modules) and finds nested tools', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-pyfiles-'));
  try {
    for (const f of ['a.py', 'sub/b.py', 'out/venv/lib/c.py', 'venv/d.py', 'node_modules/e.py', '.hidden/f.py', '__pycache__/g.py', 'sub/notes.txt']) {
      fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
      fs.writeFileSync(path.join(tmp, f), '');
    }
    assert.deepStrictEqual(pyFiles(tmp).map((f) => path.relative(tmp, f)).sort(), ['a.py', path.join('sub', 'b.py')]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('parseProblem reports a syntax error and accepts a good file', { skip }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pushup-pysyntax-'));
  try {
    const good = path.join(tmp, 'good.py'), bad = path.join(tmp, 'bad.py'), missing = path.join(tmp, 'missing.py');
    fs.writeFileSync(good, 'def f(x):\n    return x + 1\n');
    fs.writeFileSync(bad, 'def f(x)\n    return x +\n');
    assert.strictEqual(parseProblem(good), null);
    assert.match(parseProblem(bad), /bad\.py.*SyntaxError/);
    assert.match(parseProblem(missing), /missing\.py/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
