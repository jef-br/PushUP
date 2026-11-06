'use strict';
// Full-reference image metrics on the luma (Y) channel of packed RGB buffers.

function luma(rgb, n) {
  const y = new Float64Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 3) y[i] = 0.299 * rgb[j] + 0.587 * rgb[j + 1] + 0.114 * rgb[j + 2];
  return y;
}

function psnr(a, b, w, h) {
  const n = w * h, ya = luma(a, n), yb = luma(b, n);
  let se = 0;
  for (let i = 0; i < n; i++) { const d = ya[i] - yb[i]; se += d * d; }
  return 10 * Math.log10((255 * 255) / (se / n));
}

// Separable Gaussian blur (sigma 1.5, 11 taps), edges clamped.
const K = (() => { const k = []; let s = 0; for (let i = -5; i <= 5; i++) { const v = Math.exp(-(i * i) / 4.5); k.push(v); s += v; } return k.map((v) => v / s); })();
function blur(src, w, h) {
  const tmp = new Float64Array(w * h), out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0; for (let k = -5; k <= 5; k++) s += K[k + 5] * src[y * w + Math.min(w - 1, Math.max(0, x + k))];
    tmp[y * w + x] = s;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0; for (let k = -5; k <= 5; k++) s += K[k + 5] * tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
    out[y * w + x] = s;
  }
  return out;
}

function ssim(a, b, w, h) {
  const n = w * h, x = luma(a, n), y = luma(b, n);
  const xx = new Float64Array(n), yy = new Float64Array(n), xy = new Float64Array(n);
  for (let i = 0; i < n; i++) { xx[i] = x[i] * x[i]; yy[i] = y[i] * y[i]; xy[i] = x[i] * y[i]; }
  const mx = blur(x, w, h), my = blur(y, w, h), sxx = blur(xx, w, h), syy = blur(yy, w, h), sxy = blur(xy, w, h);
  const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const vx = sxx[i] - mx[i] * mx[i], vy = syy[i] - my[i] * my[i], cxy = sxy[i] - mx[i] * my[i];
    s += ((2 * mx[i] * my[i] + C1) * (2 * cxy + C2)) / ((mx[i] ** 2 + my[i] ** 2 + C1) * (vx + vy + C2));
  }
  return s / n;
}

// GMSD (Xue et al. 2014): std-dev of gradient-magnitude similarity. Lower is better.
function gmsd(a, b, w, h) {
  const n = w * h, x = luma(a, n), y = luma(b, n);
  const grad = (im) => {
    const g = new Float64Array(n);
    for (let r = 1; r < h - 1; r++) for (let c = 1; c < w - 1; c++) {
      const i = r * w + c;
      const gx = (im[i - w + 1] + im[i + 1] + im[i + w + 1] - im[i - w - 1] - im[i - 1] - im[i + w - 1]) / 3;
      const gy = (im[i + w - 1] + im[i + w] + im[i + w + 1] - im[i - w - 1] - im[i - w] - im[i - w + 1]) / 3;
      g[i] = Math.sqrt(gx * gx + gy * gy);
    }
    return g;
  };
  const gx = grad(x), gy = grad(y), T = 170;
  let sum = 0, sum2 = 0, m = 0;
  for (let r = 1; r < h - 1; r++) for (let c = 1; c < w - 1; c++) {
    const i = r * w + c;
    const v = (2 * gx[i] * gy[i] + T) / (gx[i] ** 2 + gy[i] ** 2 + T);
    sum += v; sum2 += v * v; m++;
  }
  const mean = sum / m;
  return Math.sqrt(Math.max(0, sum2 / m - mean * mean));
}

module.exports = { psnr, ssim, gmsd };
