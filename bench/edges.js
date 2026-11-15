'use strict';
// Ringing and halos on hard edges: overshoot and edge width of `fast` mode vs plain Lanczos (BK7).
// Usage: node bench/edges.js [--factors 1.5,2.5] [--include-border]
//   Synthetic 400x300 images with mid-level values (dark 40, light 215, so overshoot is not hidden
//   by the 0/255 clamp of the output bytes): a vertical step, a 1 px dark line, a 12 px dark disc.
//   Each is upscaled with the shipped `fast` pipeline (CPU) and resized with plain sharp lanczos3
//   to the same size. Prints a markdown table; results are in docs/EDGES.md.
//   The step and line windows skip the 40 output rows at the top and bottom, where the feature meets the
//   image border (BK8); --include-border keeps them. The disc never reaches the border.
const sharp = require('sharp');

process.env.PUSHUP_QUALITY = 'fast';
process.env.PUSHUP_DEVICE = 'cpu';
const { upscale } = require('../src/index.js');

const fi = process.argv.indexOf('--factors');
const factorsRaw = fi > 0 ? process.argv[fi + 1] : '1.5,2.5'; // undefined: --factors without a value
const factors = typeof factorsRaw === 'string' ? factorsRaw.split(',').map(Number) : [];
if (!factors.length || factors.some((f) => !(f > 0))) {
  console.error('--factors must be a comma-separated list of numbers > 0');
  process.exit(1);
}
const includeBorder = process.argv.includes('--include-border');
const BORDER = 40; // output rows skipped at the top and bottom for the step and line

const W = 400, H = 300, DARK = 40, LIGHT = 215, NEAR = 6; // NEAR: output px around the feature
const CX = 200, CY = 150, R = 6; // disc: centre, radius (12 px diameter)

function build(kind) {
  const a = Buffer.alloc(W * H * 3, LIGHT);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let dark = false;
      if (kind === 'step') dark = x < CX;
      else if (kind === 'line') dark = x === CX;
      else dark = Math.hypot(x + 0.5 - CX, y + 0.5 - CY) <= R;
      if (dark) a.fill(DARK, (y * W + x) * 3, (y * W + x) * 3 + 3);
    }
  }
  return a;
}

// Position (output px) where the profile crosses `level` going up (dir +1) or down (dir -1),
// first crossing at or after index `from`, linear interpolation; null if there is none.
function crossing(p, level, dir, from) {
  for (let i = Math.max(from, 1); i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    if (dir > 0 ? a < level && b >= level : a > level && b <= level) return i - 1 + (level - a) / (b - a);
  }
  return null;
}

const lvl = (pct) => DARK + (LIGHT - DARK) * pct;

// feature geometry in output px for factor f: [centre x, row y, a predicate "within NEAR of the feature"]
function geometry(kind, f) {
  const row = Math.round(CY * f);
  if (kind === 'step') return { cx: CX * f, row, near: (x) => Math.abs(x + 0.5 - CX * f) <= NEAR };
  if (kind === 'line') return { cx: (CX + 0.5) * f, row, near: (x) => Math.abs(x + 0.5 - (CX + 0.5) * f) <= NEAR };
  return { cx: CX * f, row, near: null };
}

function measure(kind, out, ow, oh, f) {
  const g = geometry(kind, f);
  let min = 255, max = 0;
  for (let y = 0; y < oh; y++) {
    if (kind !== 'disc' && !includeBorder && (y < BORDER || y >= oh - BORDER)) continue;
    for (let x = 0; x < ow; x++) {
      let near;
      if (kind === 'disc') near = Math.abs(Math.hypot(x + 0.5 - CX * f, y + 0.5 - CY * f) - R * f) <= NEAR;
      else near = g.near(x);
      if (!near) continue;
      for (let k = 0; k < 3; k++) {
        const v = out[(y * ow + x) * 3 + k];
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  const below = Math.max(0, DARK - min), above = Math.max(0, max - LIGHT);
  // profile along the row through the feature centre (channel 0), +-20 output px around it
  const lo = Math.max(0, Math.floor(g.cx - 20 - (kind === 'disc' ? R * f : 0))), hi = Math.min(ow - 1, Math.ceil(g.cx + 20));
  const p = [];
  for (let x = lo; x <= hi; x++) p.push(out[(g.row * ow + x) * 3]);
  let width = null;
  if (kind === 'step') {
    const a = crossing(p, lvl(0.1), +1, 1), b = a === null ? null : crossing(p, lvl(0.9), +1, Math.floor(a));
    if (a !== null && b !== null) width = b - a;
  } else if (kind === 'disc') {
    // left edge: falls from light (outside) to dark (inside), 90 % -> 10 %
    const a = crossing(p, lvl(0.9), -1, 1), b = a === null ? null : crossing(p, lvl(0.1), -1, Math.floor(a));
    if (a !== null && b !== null) width = b - a;
  } else {
    // line: full width at half maximum of the dark dip
    let mi = 0;
    p.forEach((v, i) => { if (v < p[mi]) mi = i; });
    const half = (LIGHT + p[mi]) / 2;
    let l = null, r = null;
    for (let i = mi; i > 0; i--) if (p[i - 1] >= half) { l = i - 1 + (half - p[i - 1]) / (p[i] - p[i - 1]); break; }
    for (let i = mi; i < p.length - 1; i++) if (p[i + 1] >= half) { r = i + (half - p[i]) / (p[i + 1] - p[i]); break; }
    if (l !== null && r !== null) width = r - l;
  }
  return { below, above, overshoot: Math.max(below, above), width };
}

(async () => {
  const fmt = (v) => (v === null ? 'n/a' : Number.isInteger(v) ? String(v) : v.toFixed(2));
  console.log('| feature | factor | method | below 40 | above 215 | overshoot | width (output px) |');
  console.log('|---|---|---|---|---|---|---|');
  for (const kind of ['step', 'line', 'disc']) {
    const input = build(kind);
    for (const f of factors) {
      const [model, stride] = await upscale(new Uint8Array(input), W * 3, f);
      const ow = stride / 3, oh = model.length / stride;
      const lanczos = await sharp(input, { raw: { width: W, height: H, channels: 3 } })
        .resize(ow, oh, { kernel: 'lanczos3' }).raw().toBuffer();
      for (const [name, out] of [['fast', model], ['lanczos', lanczos]]) {
        const m = measure(kind, out, ow, oh, f);
        console.log(`| ${kind} | ${f} | ${name} | ${m.below} | ${m.above} | ${m.overshoot} | ${fmt(m.width)} |`);
      }
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
