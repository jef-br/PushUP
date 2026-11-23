'use strict';
// Two small pure helpers of the benchmark scripts, kept apart so a test can require them (BL22) without
// starting a benchmark: `bench/colors-real.js` and `bench/edges.js` run on load and have no exports.

// 99th percentile of a 256-bin histogram `h` of `n` values: the smallest bin whose running count reaches
// ceil(n * 0.99). Returns 255 when the counts never reach it (n > 0 and the bins add up to less than n);
// n = 0 gives 0 (want is 0 at once).
function p99(h, n) {
  const want = Math.ceil(n * 0.99);
  let seen = 0;
  for (let v = 0; v < 256; v++) { seen += h[v]; if (seen >= want) return v; }
  return 255;
}

// Position (index into `p`) where the profile crosses `level` going up (dir +1) or down (dir -1),
// first crossing at or after index `from`, linear interpolation; null if there is none.
function crossing(p, level, dir, from) {
  for (let i = Math.max(from, 1); i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    if (dir > 0 ? a < level && b >= level : a > level && b <= level) return i - 1 + (level - a) / (b - a);
  }
  return null;
}

module.exports = { p99, crossing };
