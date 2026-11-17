'use strict';
// Flag check shared by the bench scripts. Pure, so a test can require it.
//   checkFlags(argv, { values: ['--sizes', ...], switches: ['--json', ...] })
// argv = the arguments after the script name (without a directory argument the script takes first).
// Returns null when every `--...` token is a listed value flag or switch, otherwise a one-line
// message for the first unknown one. The token after a value flag is its value and is skipped,
// whatever it looks like (the script's own value check judges it). `--name=value` is not parsed
// by the scripts, so it is reported as unknown.
function checkFlags(argv, { values = [], switches = [] } = {}) {
  const allowed = [...values, ...switches];
  const list = allowed.length ? allowed.join(', ') : '(none)';
  for (let i = 0; i < argv.length; i++) {
    const tok = String(argv[i]);
    if (!tok.startsWith('--')) continue;
    if (values.includes(tok)) { i++; continue; }
    if (switches.includes(tok)) continue;
    const eq = tok.indexOf('=');
    if (eq > 2) return `unknown flag ${tok}; use "${tok.slice(0, eq)} value"; allowed: ${list}`;
    return `unknown flag ${tok}; allowed: ${list}`;
  }
  return null;
}

module.exports = { checkFlags };
