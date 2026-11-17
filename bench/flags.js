'use strict';
// Flag check shared by the bench scripts. Pure, so a test can require it.
//   checkFlags(argv, { values: ['--sizes', ...], switches: ['--json', ...], positional: 0 })
// argv = the arguments after the script name (without a directory argument the script takes first).
// Returns null when every `--...` token is a listed value flag or switch, otherwise a one-line
// message for the first unknown one. The token after a value flag is its value and is skipped,
// whatever it looks like (the script's own value check judges it). `--name=value` is not parsed
// by the scripts, so it is reported as unknown. A plain word that is not the value of a value flag
// is a stray argument (`--sizes 400 800` would silently drop the 800); `positional` is how many such
// words are allowed (default 0). A negative number is a plain word, so it is only valid as a value.
function checkFlags(argv, { values = [], switches = [], positional = 0 } = {}) {
  const allowed = [...values, ...switches];
  const list = allowed.length ? allowed.join(', ') : '(none)';
  let words = 0;
  for (let i = 0; i < argv.length; i++) {
    const tok = String(argv[i]);
    if (!tok.startsWith('--')) {
      if (++words > positional) {
        const prev = i > 0 ? String(argv[i - 1]) : '';
        if (switches.includes(prev)) return `unexpected argument ${tok} after the switch ${prev}`;
        return `unexpected argument ${tok}; a flag takes one value, write a list as "400,800" without spaces`;
      }
      continue;
    }
    if (values.includes(tok)) { i++; continue; }
    if (switches.includes(tok)) continue;
    const eq = tok.indexOf('=');
    if (eq > 2) return `unknown flag ${tok}; use "${tok.slice(0, eq)} value"; allowed: ${list}`;
    return `unknown flag ${tok}; allowed: ${list}`;
  }
  return null;
}

module.exports = { checkFlags };
