# Ringing and halos on hard edges (BK7)

Question: does `fast` mode produce dark or bright halos next to hard edges (garment on white,
text, thin lines)? The sub20 metrics (PSNR, SSIM, GMSD) do not isolate this. Date: 2026-11-15.

**Answer: yes, `fast` overshoots more than plain Lanczos, by 2 to 18 bytes on a 175-byte contrast
(about 1 to 10 %), and its edges are sharper.** The worst case is the dark side of a
small dark feature (a 1 px line at factor 2.5: 31 bytes below the dark level, where Lanczos has none; a 12 px disc: 34 to 37 bytes below it, Lanczos
20 to 23). The halo is visible only on crops of such edges, not in the aggregate scores.
Whether it is a defect or just "crisper" is an owner judgement; no code change is proposed.

## Method

`node bench/edges.js` (six model runs, a few seconds each on 4 vCPU; `--factors 1.5,2.5` is the default).
The step and line windows skip the 40 output rows at the top and bottom of the image, where the feature
meets the image border (BK8); `--include-border` keeps them (the first version of this table, BK7).

- Three synthetic 400×300 images with **mid-level** values (dark 40, light 215), so overshoot is
  not hidden by the 0/255 clamp of the output bytes: a vertical step edge (dark left of x = 200),
  a 1 px dark line (column 200), a 12 px-diameter dark disc (centre 200, 150).
- Each is upscaled by the shipped `fast` pipeline (CPU, 20 % Lanczos mix included) and, for the
  comparison, resized by plain `sharp` lanczos3 to the same output size.
- **Overshoot:** over all pixels within 6 output px of the feature (of the edge, of the line, of
  the disc's circumference) and all three channels: `below 40` = how far the lowest byte is under the
  dark level, `above 215` = how far the highest is over the light level; `overshoot` is the larger of the two.
  The Lanczos values are separate rows, not subtracted.
- **Width:** along the row through the feature's centre (channel 0): step = 10 to 90 % rise distance;
  disc = 90 to 10 % fall distance at its left edge; line = full width at half maximum of the dark dip.
  Linear interpolation; output pixels.

## Results

| feature | factor | method | below 40 | above 215 | overshoot | width (output px) |
|---|---|---|---|---|---|---|
| step | 1.5 | fast | 12 | 7 | 12 | 0.99 |
| step | 1.5 | lanczos | 10 | 10 | 10 | 1.44 |
| step | 2.5 | fast | 17 | 7 | 17 | 0.97 |
| step | 2.5 | lanczos | 13 | 13 | 13 | 1.81 |
| line | 1.5 | fast | 0 | 13 | 13 | 1.64 |
| line | 1.5 | lanczos | 0 | 11 | 11 | 1.74 |
| line | 2.5 | fast | 31 | 9 | 31 | 2.04 |
| line | 2.5 | lanczos | 0 | 13 | 13 | 2.76 |
| disc | 1.5 | fast | 34 | 31 | 34 | 0.88 |
| disc | 1.5 | lanczos | 20 | 18 | 20 | 1.44 |
| disc | 2.5 | fast | 37 | 34 | 37 | 0.87 |
| disc | 2.5 | lanczos | 23 | 20 | 23 | 1.81 |

(Two runs gave identical numbers: the pipeline is deterministic.)

## Reading

- **Overshoot:** `fast` is worse than Lanczos in every row: step +2 / +4 (factor 1.5 / 2.5),
  line +2 / +18, disc +14 / +14. The dark side is the larger one for `fast` on the step (12 vs 7, 17 vs 7) and the line at 2.5 (31 vs 9); on the disc the two sides are close (34/31, 37/34). On the 1 px line at 1.5 the dip stays above the dark level
  for both methods, so only the light side overshoots there.
- **Sharpness:** `fast` edges are sharper: step 0.97 to 0.99 px against 1.44 to 1.81 for Lanczos,
  disc 0.87 against 1.44 to 1.81. In these synthetic cases `fast` is both sharper and has a larger halo
  (same order as Lanczos's own ringing); the data do not show that one causes the other.
- **Image borders:** with the border rows included (`--include-border`, the first version of this doc) the
  `fast` step overshoot was 14 / 21 instead of 12 / 17 and the line's light side at 2.5 was 14 instead of 9, so
  the step excess over Lanczos was +4 / +8. Lanczos and disc rows do not change. The ranking (`fast` worse in
  every row) holds either way, and so does the 2 to 18 byte range.
- **Mixed comparison:** the `fast` rows are the shipped pipeline (model + 20 % Lanczos mix), the
  Lanczos rows are a plain resize of the original, not of the 4x output.
- **Limits:** synthetic edges at one contrast (175 bytes), one 400×300 size, one disc size, `fast` only.
  Natural product photos have softer edges; `high` mode was not measured. Check with crops
  before drawing any conclusion for real photos.
