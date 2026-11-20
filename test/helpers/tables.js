'use strict';
// Shared by test/doc-tables.test.js: find markdown tables and count their cells.

// Cells of a table line: split on `|` that is not escaped (`\|`), outer pipes dropped.
// GitHub splits on a pipe even inside an inline code span unless it is escaped, so this does too.
function cellsOf(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/);
}

const isSeparator = (line) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line) && line.includes('|');

// Returns { tables, rows, bad } for one file's text. A table is a header line containing `|`, directly
// followed by a separator line, then every following line that starts with `|`. Fenced blocks are skipped.
function checkTables(rel, text) {
  const lines = text.split('\n');
  const bad = [];
  let tables = 0, rows = 0, fence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) { fence = !fence; continue; }
    if (fence || !lines[i].includes('|') || i + 1 >= lines.length || !isSeparator(lines[i + 1])) continue;
    const want = cellsOf(lines[i]).length;
    tables++;
    const sepN = cellsOf(lines[i + 1]).length;
    if (sepN !== want) bad.push(`${rel}:${i + 2} separator has ${sepN} cells, header has ${want}`);
    let j = i + 2;
    while (j < lines.length && /^\s*\|/.test(lines[j])) {
      rows++;
      const n = cellsOf(lines[j]).length;
      if (n !== want) bad.push(`${rel}:${j + 1} row has ${n} cells, expected ${want}`);
      j++;
    }
    i = j - 1;
  }
  return { tables, rows, bad };
}

module.exports = { cellsOf, checkTables };
