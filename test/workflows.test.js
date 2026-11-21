'use strict';
// BL23: every .github/workflows/*.yml is read-only (top-level `permissions: contents: read` and nothing more),
// never uses `pull_request_target` or `secrets.`, and pins every action to a version. Text only, no network.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', '.github', 'workflows');

// A workflow that needs more than `contents: read` goes here, by file name, with the reason (empty today).
const MORE_PERMISSIONS = new Map([]);

// Returns the list of problems in one workflow's text (empty when it is fine).
function workflowProblems(text, file = 'workflow.yml') {
  const problems = [];
  const lines = text.split('\n').map((l) => (/^#/.test(l) ? '' : l.replace(/\s+#.*$/, '')).replace(/\s+$/, '')); // a column-0 comment is a blank line
  const at = lines.findIndex((l) => /^permissions:/.test(l));
  if (at < 0) problems.push(`${file}: no top-level "permissions:" block`);
  else if (!MORE_PERMISSIONS.has(file)) {
    const entries = [];
    for (let i = at + 1; i < lines.length && (/^\s+\S/.test(lines[i]) || lines[i] === ''); i++) if (lines[i]) entries.push(lines[i].trim());
    if (lines[at] !== 'permissions:' || entries.length !== 1 || entries[0] !== 'contents: read') {
      problems.push(`${file}: top-level permissions must be exactly "contents: read", got ${JSON.stringify([lines[at], ...entries])}`);
    }
  }
  if (/pull_request_target/.test(text)) problems.push(`${file}: uses pull_request_target`);
  if (/secrets\./.test(text)) problems.push(`${file}: uses secrets.`);
  for (const l of lines) {
    const m = /^\s*(?:-\s+)?uses:\s*(\S+)/.exec(l);
    if (!m || m[1].startsWith('./')) continue;
    if (!/@(v\d+(\.\d+){0,2}|[0-9a-f]{40})$/.test(m[1])) problems.push(`${file}: action "${m[1]}" has no pinned version (@v<digits> or a full SHA)`);
  }
  return problems;
}

const files = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort();

test('there are workflow files to check (ci.yml and slow-tests.yml)', () => {
  assert.ok(files.includes('ci.yml') && files.includes('slow-tests.yml'), `found ${files.join(', ')}`);
});

for (const f of files) {
  test(`${f} is read-only, has no pull_request_target or secrets, and pins its actions`, () => {
    assert.deepStrictEqual(workflowProblems(fs.readFileSync(path.join(dir, f), 'utf8'), f), []);
  });
}

test('workflowProblems reports each problem and accepts a good workflow', () => {
  const good = ['name: x', 'on:', '  push:', 'permissions:', '  contents: read', 'jobs:', '  a:', '    steps:', '      - uses: actions/checkout@v4', `      - uses: foo/bar@${'a'.repeat(40)}`, '      - uses: ./local-action', ''].join('\n');
  assert.deepStrictEqual(workflowProblems(good), []);
  const no = (text) => workflowProblems(text);
  assert.match(no(good.replace('permissions:\n  contents: read\n', ''))[0], /no top-level "permissions:"/);
  assert.match(no(good.replace('contents: read', 'contents: read\n# a comment at column 0\n  issues: write'))[0], /must be exactly "contents: read"/); // a comment must not hide later entries
  assert.match(no(good.replace('contents: read', 'contents: write'))[0], /must be exactly "contents: read"/);
  assert.match(no(good.replace('contents: read', 'contents: read\n  pull-requests: write'))[0], /must be exactly "contents: read"/);
  assert.match(no(good.replace('permissions:\n  contents: read', 'permissions: write-all'))[0], /must be exactly "contents: read"/);
  assert.match(no(`${good}# on: pull_request_target`).join('\n'), /uses pull_request_target/);
  assert.match(no(`${good}      - run: echo \${{ secrets.TOKEN }}\n`).join('\n'), /uses secrets\./);
  assert.match(no(good.replace('checkout@v4', 'checkout@main'))[0], /actions\/checkout@main" has no pinned version/);
  assert.match(no(good.replace('checkout@v4', 'checkout'))[0], /actions\/checkout" has no pinned version/);
  assert.match(no(good.replace('@v4', '@v4-beta'))[0], /no pinned version/);
});
