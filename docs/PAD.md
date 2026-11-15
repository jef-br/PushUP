# Does mirror-padding the model input help at the image border? (BK11)

Question: `docs/COLOR.md` (BK10) found that most of `fast`'s flat-colour error sits within about 8 px of the image border, and that on
uniform images mirror-padding the input by 16 px before the model and cropping afterwards removes it. Does that help on real
product photos? Date: 2026-11-15.

**Answer: no. On the 20-image `sub20` set the padded variant scores the same as the plain one (differences of 0.001 dB PSNR, 0.00003 SSIM,
0.00015 GMSD, in the noise), also in the border band. Recommendation: drop; there is nothing to propose to the owner.**

## Method

`node bench/pad.js` (needs `bench/out/sub20`: `bash bench/fetch_testset.sh`; about 45 s for the 20 images and the runtime check on 4 vCPU;
two runs gave identical scores, the runtime line differs).

- Reference: the source image resized to 800 px on its longest side (lanczos3). Input: that reference downscaled to 400 px (cubic), JPEG q85, decoded (as `bench/bench.js` degrades, at 400 px instead of the 1000 px reference).
- Two runs of the shipped `fast` pipeline (CPU) at factor 2.0: **as is** (400 px in, 800 px out); **padded**: the input mirror-padded by 16 px on every side
  (432 px in, 864 px out, under the 1000 px output cap), then cropped by 32 px on every side. The crop is exactly the as-is size for every aspect ratio
  (2 × (n + 32) − 64 = 2n); the script stops if it is not. Factor 2.0 is used because the shipped 2.5 on a 432 px input would hit the cap.
- Scores against the reference with `bench/metrics.js` (unchanged), means over the 20 images: **whole** image; **interior** (32 px left out on every side); **border band**
  = four strips of 32 px (top and bottom full width, left and right between them), SSIM and GMSD averaged by pixel count, PSNR from the pooled squared error of the four strips.
  SSIM and GMSD treat the edges of each cropped buffer differently (blur clamp, GMSD skips the outer pixel), so interior and border-band values compare the two variants
  but not with the whole-image values.
- Sources: 13 ABO + 7 Lamoda images, none under 800 px on the longest side; none skipped.

## Results

| variant | whole PSNR | whole SSIM | whole GMSD | interior PSNR | interior SSIM | interior GMSD | border PSNR | border SSIM | border GMSD |
|---|---|---|---|---|---|---|---|---|---|
| as is | 32.518 | 0.91451 | 0.09155 | 31.964 | 0.90462 | 0.09703 | 39.373 | 0.95629 | 0.04057 |
| padded 16 px | 32.517 | 0.91450 | 0.09158 | 31.964 | 0.90462 | 0.09703 | 39.374 | 0.95626 | 0.04072 |
| padded - as is | -0.001 | -0.00000 | 0.00003 | -0.000 | -0.00000 | -0.00000 | 0.001 | -0.00003 | 0.00015 |

Gate (playbook §2, whole image): PSNR drop ≤ 0.02 dB, SSIM drop ≤ 0.001, GMSD rise ≤ 0.001: **PASS** (differences −0.001 dB, −0.00000, +0.00003).
Border band: better on 1 of 3 metrics (PSNR +0.001 dB), worse on 2 (SSIM −0.00003, GMSD +0.00015). All three differences are far below any visible size.
Rule of the task ("propose to the owner" only if the gate passes and the border band improves on at least two metrics and gets worse on none): **drop**.

Runtime at 400 px in (median of 5, one image, includes padding and cropping): as is about 0.66 to 0.69 s, padded about 0.74 to 0.78 s, ratio 1.08 and 1.18 in two runs (about 1.1 to 1.2×).

## Reading

- The uniform-image result (padding removes the band) does not carry over to these photos: about half of their borders are plain background (flat in 9 of the 20 images, textured in 11, measured on the reference), and probably the model's border effect there is
  smaller than the JPEG and resampling error the scores include (not tested separately). The border band of the plain variant even scores better than the interior (39.4 dB vs 32.0 dB PSNR), which
  is what a plain background gives, not a sign of a model border problem.
- So BK10's flat-colour border band is real on synthetic uniform colours but not measurable on this set. A set with saturated, flat colours up to the image edge (blue or
  magenta backgrounds) could still show it; none is in `sub20`.
- The padded outputs do differ from the plain ones on images with content at the edge: the largest per-pixel differences within 8 px of the border reach 26 to 80 levels (of 255) on the five
  most affected images (a check by the BK11 adversary), and are 3 or less on flat borders. The differences average out against the reference, which is why the scores do not move; the
  experiment shows no gain in score, not that padding changes nothing.
- Limits: factor 2.0 on 400 px inputs, not the shipped 2.5 and not 800 px; `fast` only; one set of 20 images. The quality gate for a default change would be `bench/bench.js
  --sizes 400,800`; since the effect is nil, nothing needs it.
