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
- **Overshoot:** over all pixels within 6 output px of the feature (step and line: without the border rows, see above) (of the edge, of the line, of
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
- **Limits:** synthetic edges at one contrast (175 bytes), one 400×300 size, one disc size, `fast` in this part (`high` is in the section below).
  Natural product photos have softer edges; `high` mode is in the section below. Check with crops
  before drawing any conclusion for real photos.


## `high` mode (BK9)

`node bench/edges.js --quality high` (CPU, tiled Remacri, 6 runs in about 1.5 minutes on 4 vCPU, same border rule as
above). The shipped `high` pipeline has no Lanczos mix. Date: 2026-11-15.

Tile seams: `high` cuts the input into 192 px tiles with a 16 px pad, so the seams are at input x = 192 and 384
and y = 192. The step edge and the line (x = 200) and the disc (x 194 to 206) all lie in the second tile column, 8 px
past the seam and inside the 16 px pad of that tile; none sits on a seam, and the disc and the horizontal profile
rows (y = 150, disc y 144 to 156) are above the y = 192 seam. So these numbers measure the model's edge
behaviour, not a seam artefact at x = 192. The step and the line run the full image height, so their overshoot
windows also cross the horizontal seam at input y = 192; a check by the BK9 adversary that skipped the rows within 24 input px of y = 192 gave the same 12 rows, so the horizontal seam does not drive these numbers.

| feature | factor | method | below 40 | above 215 | overshoot | width (output px) |
|---|---|---|---|---|---|---|
| step | 1.5 | high | 4 | 12 | 12 | 0.84 |
| step | 1.5 | lanczos | 10 | 10 | 10 | 1.44 |
| step | 2.5 | high | 10 | 14 | 14 | 0.83 |
| step | 2.5 | lanczos | 13 | 13 | 13 | 1.81 |
| line | 1.5 | high | 20 | 24 | 24 | 1.40 |
| line | 1.5 | lanczos | 0 | 11 | 11 | 1.74 |
| line | 2.5 | high | 40 | 25 | 40 | 2.12 |
| line | 2.5 | lanczos | 0 | 13 | 13 | 2.76 |
| disc | 1.5 | high | 26 | 31 | 31 | 0.87 |
| disc | 1.5 | lanczos | 20 | 18 | 20 | 1.44 |
| disc | 2.5 | high | 40 | 40 | 40 | 0.84 |
| disc | 2.5 | lanczos | 23 | 20 | 23 | 1.81 |

**Reading: yes, `high` overshoots more than plain Lanczos in every row** (step +2 / +1, line +13 / +27, disc +11 / +17 bytes at
factor 1.5 / 2.5), **and it is not better than `fast`**: against the `fast` table above it is about the same on the step
(12 / 14 vs 12 / 17) and the disc (31 / 40 vs 34 / 37, within 3 bytes), and clearly worse on the 1 px line (24 / 40 vs 13 / 31, +11 / +9).
Its step and disc edges are the sharpest of the three (0.83 to 0.87 px against 0.97 to 0.99 for `fast` on the step and 1.44 to 1.81 for Lanczos).
An overshoot of 40 in the `high` rows (line 2.5 below, disc 2.5 both sides) means a byte reached 0 or 255, so it is a lower bound there; the real overshoot is at least that, which only strengthens "not better than `fast`". Its line is narrowest at factor 1.5 (1.40 vs 1.64 for `fast`) but not at 2.5 (2.12 vs 2.04).
Same limits as above: synthetic edges, one contrast, one size; `high` was run on CPU (a GPU gives the same model, but the result was
not compared).

## Real photos (CV2)

Command (needs `bash bench/fetch_testset.sh`; about 16 s on the 4 vCPU container, 2026-11-17):

```
node bench/edges-real.js          # --dir bench/out/sub20 --limit 20
```

Per image of `bench/out/sub20` (20 images, 13 ABO + 7 Lamoda): reference = source resized to 800 px on its longest
side (lanczos3), input = reference downscaled to 400 px (cubic), JPEG q85, decoded (as `bench/pad.js`); `fast` at
factor 2.0 (shipped settings, CPU) and plain lanczos3 of the input to the same size. Edge pixels = the 200 pixels
with the largest Sobel gradient of the reference luma whose 9×9 neighbourhood spans at least 80 levels, at least
4 px from the border. Overshoot at such a pixel = how far the output luma lies beyond the min/max of the reference's
9×9 neighbourhood (0 when inside it). Images used: 20 of 20, 200 edge pixels each (4000 per method).

| method | mean overshoot (levels) | share with overshoot > 4 | edge pixels with any overshoot | largest overshoot (levels) |
| --- | --- | --- | --- | --- |
| `fast` | 0.001 | 0.0 % | 3 of 4000 | 1.98 |
| Lanczos | 0.000 | 0.0 % | 1 of 4000 | 1.84 |

Reading: on the strongest edges of real product photos neither method leaves the range of the reference's
neighbourhood by more than 2 levels, so the 12 to 37 byte overshoots of the synthetic table above do not show up
here. Do not read this as "no ringing on photos": the measure is different. The synthetic features are ideal
(a flat 40 / 215 step, a 1 px line) and overshoot is measured against the flat feature levels; here the reference is
itself a lanczos3 downscale, so its edges are soft and a 9×9 window around a strong edge already spans the whole
dark-to-light range, which leaves little room to overshoot. Edges that are one pixel wide in the reference
(hairlines, text) are the case the synthetic `line` row stresses, and the 200 largest gradients are mostly wider edges.
### Beside the edge, with a positive control (CV3)

The measure above samples on the edge, where ringing lobes are not (they sit 1 to 2 px beside it). CV3 also scores the
pixels 2 px to each side of every edge pixel along the Sobel gradient (direction rounded to the nearest of 8 steps),
against the 13×13 window of the reference centred on the **edge pixel** (so the window still spans dark to light and
the lobe pixel is judged against it). A sample whose window would leave the image is skipped and counted.

Positive control (the script runs it first): an 800×600 ideal step (dark 40 | light 215, edge between x = 399 and 400),
degraded as the photos are (cubic halving, JPEG q85, decode), then `fast` at factor 2.0 and Lanczos; the 200 edge pixels are
picked from rows 100 to 499 only (an ideal step has the same gradient in every row, so the border rows would take all
the ties). Decision rule, printed by the script: if `fast` reads below 4 levels beside the edge on the control, the
measure cannot see the 12 to 17 byte overshoot that `bench/edges.js` shows on a clean step, and the real-photo result is
"inconclusive". (That figure is a largest value on an un-degraded step; the rule compares a mean on a JPEG-degraded step,
so "inconclusive" was an expected outcome.)

| data | samples | method | mean overshoot (levels) | share with overshoot > 4 | samples with any overshoot | largest overshoot (levels) | samples skipped |
| --- | --- | --- | --- | --- | --- | --- | --- |
| control | on the edge | `fast` | 0.000 | 0.0 % | 0 of 200 | 0.00 | - |
| control | beside the edge | `fast` | 2.049 | 25.0 % | 200 of 400 | 6.59 | 0 |
| control | on the edge | Lanczos | 0.000 | 0.0 % | 0 of 200 | 0.00 | - |
| control | beside the edge | Lanczos | 2.500 | 0.0 % | 300 of 400 | 4.00 | 0 |
| real photos | on the edge | `fast` | 0.001 | 0.0 % | 3 of 4000 | 1.98 | - |
| real photos | beside the edge | `fast` | 0.024 | 0.3 % | 68 of 7946 | 8.97 | 54 |
| real photos | on the edge | Lanczos | 0.000 | 0.0 % | 1 of 4000 | 1.84 | - |
| real photos | beside the edge | Lanczos | 0.057 | 0.5 % | 175 of 7946 | 11.74 | 54 |

Reading (2026-11-17, `node bench/edges-real.js`, about 20 s):

- **The control reads 2.05 levels for `fast`, below 4, so the real-photo result is inconclusive** by the rule above. The
  on-edge samples of an ideal step read 0 by construction (the pixel on the edge is inside the window's range); only the
  beside-edge set can show overshoot, and it shows about 2 levels for both methods (Lanczos 2.50, `fast` 2.05).
- On the control `fast` has the larger tail (25 % of samples above 4 levels, largest 6.59) and Lanczos the larger
  mean (2.50, largest 4.00). The measure is therefore not blind beside the edge, but it does not separate the methods the
  way the clean synthetic step does (there `fast` overshoots more than Lanczos).
- On real photos, beside the edge, `fast` is at 0.024 levels on average (0.3 % of samples above 4, largest 8.97) and
  Lanczos at 0.057 (0.5 %, largest 11.74). Both are small; `fast` is not worse than Lanczos here. This is reported for
  completeness only: the control did not pass, so it is not evidence that there are no halos on real photos.
- 54 of 8000 beside-edge samples (27 edge pixels within 6 px of the border) were skipped.
- Factor 2.0, 400 px inputs, 20 images of `bench/out/sub20`. A measure that separates `fast` from Lanczos on the degraded
  step would need a different design (for example the signed lobe amplitude against a matched, un-degraded reference);
  thin features (hairlines, text) are still not measured.


## Thin real features (BL78)

Question: does `fast` undershoot thin dark features of real product photos (stitching, text strokes, chains, hair)
the way it does the synthetic 1 px line (31 levels below the dark level at factor 2.5, table above)? Date: 2026-11-28.
Script: `node bench/thin-real.js [--dir bench/out/sub20] [--limit 20] [--size 400|600|800]` (CPU, `fast` only, about 30 s per size).

- **Data:** the 20 images of `bench/out/sub20`; reference = `bench/groundtruth.js` `loadGt` (1000 px longest side), input =
  `inputAt(gt, size)` (cubic, JPEG q85, decoded), as `bench/bench.js` builds them. Two factors: 1.0 (reference = the 1000 px
  reference resized to the input size, lanczos3) and 1000 / size (2.5 at 400 px, reference = the 1000 px reference). Methods: the shipped
  `fast` pipeline (20 % Lanczos mix included) and plain sharp lanczos3 of the input to the same size. Reference and output
  are clipped to the area they share (1 px differences), top-left aligned.
- **Rule (stated before the run):** on the luma of the reference, a feature pixel is a pixel of a run of 1 to 3
  consecutive pixels (horizontal or vertical) that are all at least 40 levels darker than **both** pixels 2 px beyond the
  run's ends; the pixel between a run and each of those two is not compared with them (the edge's own blur), but must be at least 10 levels
  lighter than the run's brightest pixel (a wider bar is not cut into thin runs). Dark level of a feature pixel = the
  darkest pixel of its run. Undershoot = dark level − output luma (0 when not below).
- **Positive control:** a 1 px vertical line of 40 on a 215 patch (21 × 200 px) pasted into the 400 px input of the first image
  (the construction of `bench/edges.js`). It must read at least 15 levels below 40 for `fast` at the larger factor, else the result is
  inconclusive. At 400 px (factor 2.5) it reads **31.0** (mean over the line's rows; the same 31 as the synthetic table), Lanczos 0.0, so the measure can see the effect there; at 600 and 800 px (factors 1.67, 1.25) and at factor 1.0 it reads 0.0 (see below).

400 px input (1.0 and 2.5):

| factor | method | feature pixels | undershoot > 8 | > 16 | > 24 | largest (levels) |
| --- | --- | --- | --- | --- | --- | --- |
| 1.0 | `fast` | 44455 | 5.57 % (2477) | 0.70 % (309) | 0.05 % (21) | 29.7 |
| 1.0 | Lanczos | 44455 | 0.81 % (358) | 0.02 % (9) | 0.00 % (0) | 18.5 |
| 2.5 | `fast` | 218178 | 5.80 % (12650) | 2.89 % (6295) | 1.38 % (3002) | 119.0 |
| 2.5 | Lanczos | 218178 | 0.56 % (1214) | 0.32 % (692) | 0.17 % (381) | 74.2 |

Other input sizes (same rule; the larger factor is 1000 / size):

600 px input:

| factor | method | feature pixels | undershoot > 8 | > 16 | > 24 | largest (levels) |
| --- | --- | --- | --- | --- | --- | --- |
| 1.0 | `fast` | 92978 | 6.67 % (6202) | 1.05 % (978) | 0.08 % (76) | 34.6 |
| 1.0 | Lanczos | 92978 | 0.86 % (795) | 0.02 % (23) | 0.00 % (0) | 23.0 |
| 1.67 | `fast` | 218178 | 8.42 % (18370) | 3.57 % (7790) | 1.29 % (2805) | 82.3 |
| 1.67 | Lanczos | 218178 | 1.05 % (2280) | 0.36 % (793) | 0.16 % (343) | 90.0 |

800 px input:

| factor | method | feature pixels | undershoot > 8 | > 16 | > 24 | largest (levels) |
| --- | --- | --- | --- | --- | --- | --- |
| 1.0 | `fast` | 153541 | 6.89 % (10585) | 0.99 % (1517) | 0.08 % (116) | 47.8 |
| 1.0 | Lanczos | 153541 | 0.83 % (1270) | 0.02 % (25) | 0.00 % (0) | 20.1 |
| 1.25 | `fast` | 218178 | 7.63 % (16654) | 2.07 % (4511) | 0.42 % (920) | 66.9 |
| 1.25 | Lanczos | 218178 | 2.65 % (5777) | 0.94 % (2056) | 0.46 % (996) | 79.8 |

**Reading (400 px input, factor 2.5, the only rows the control validates): yes, on real thin dark features `fast` goes below the
reference's dark level much more often than plain Lanczos.** 5.8 % of 218 178 feature pixels are more than 8 levels below the dark level
for `fast` against 0.56 % for Lanczos, 2.9 % against 0.32 % are more than 16 below, and 1.4 % against 0.17 % more than 24 below. In levels the
effect is mostly 8 to 16 (a few percent of thin pixels) with a short tail; the largest values (119, Lanczos 74) are single pixels, partly
misalignment of a 1 px feature by a fraction of a pixel, which hits both methods.

**The other rows are not validated by the control.** At 600 and 800 px the larger factors are 1.67 and 1.25, and at factor 1.0 there is nothing to
overshoot with: the control reads **0.0** for `fast` in all of those runs (the script prints INCONCLUSIVE for 600 and 800 px), as the synthetic
1 px line does at factors up to 1.5 in the table above (0 levels). By the rule of this task those tables are therefore inconclusive on their own: they
show the same direction (`fast` above Lanczos in the share above 8: 5.6 % against 0.8 % at 1.0 and 400 px; 8.4 % against 1.1 % at 600 px / 1.67;
7.6 % against 2.7 % at 800 px / 1.25), but the deep tail (> 24) is a tie at 800 px / 1.25 (0.42 % against 0.46 %) and the largest undershoot is
lower for `fast` at 600 px (82.3 against 90.0). Read them as "the effect shrinks with a smaller factor and is mostly small", not as a measured size.

Limits: the reference is a lanczos3 downscale of the source, so a thin feature in it is already slightly soft and its dark level is
that of the soft version (a reference with a sharper feature would be darker, which lowers the measured undershoot of both methods). The
rule finds dark-on-light lines only (no light-on-dark), and the shares are over feature pixels pooled over images (images with many thin features,
such as textured fabric, weigh more). No visual check of individual crops was made; T1a (text) is a separate, blocked task.

### By Lanczos mix (BL80)

Question: is the undershoot of `fast` a property of the model or of the 20 % Lanczos mix? Date: 2026-11-28.
`node bench/thin-real.js --mix 0,0.2,0.4` runs `fast` once per Lanczos share through the `lanczosMix` option of `_run` (no change to `src/`;
0.2 is the shipped share and reproduces the BL78 figures exactly). Same data, rule and control as above: `bench/out/sub20`, 400 px input, CPU.

| factor | method | feature pixels | undershoot > 8 | > 16 | > 24 | largest (levels) |
| --- | --- | --- | --- | --- | --- | --- |
| 1.0 | `fast` (mix 0) | 44455 | 8.86 % (3939) | 1.75 % (777) | 0.24 % (105) | 37.0 |
| 1.0 | `fast` (mix 0.2) | 44455 | 5.57 % (2477) | 0.70 % (309) | 0.05 % (21) | 29.7 |
| 1.0 | `fast` (mix 0.4) | 44455 | 3.02 % (1344) | 0.21 % (93) | 0.00 % (1) | 24.7 |
| 1.0 | Lanczos | 44455 | 0.81 % (358) | 0.02 % (9) | 0.00 % (0) | 18.5 |
| 2.5 | `fast` (mix 0) | 218178 | 9.94 % (21685) | 5.94 % (12960) | 3.38 % (7374) | 136.9 |
| 2.5 | `fast` (mix 0.2) | 218178 | 5.80 % (12650) | 2.89 % (6295) | 1.38 % (3002) | 119.0 |
| 2.5 | `fast` (mix 0.4) | 218178 | 2.64 % (5749) | 1.08 % (2364) | 0.49 % (1077) | 101.4 |
| 2.5 | Lanczos | 218178 | 0.56 % (1214) | 0.32 % (692) | 0.17 % (381) | 74.2 |

Positive control at factor 2.5 (mean levels below 40 of the pasted 1 px line): mix 0 **40.0** (the dark level is reached, so this is a lower bound), mix 0.2
**31.0**, mix 0.4 **22.0**, Lanczos 0.0; all at least 15, so the factor 2.5 rows are a result. At factor 1.0 the control reads 0.0 for every row, so those rows are
inconclusive on their own (as above).

**Reading (factor 2.5): the undershoot belongs to the model; the mix only dilutes it (and mix 0 is clearly worse than 0.2).** The model alone (mix 0) puts 9.9 % of the feature pixels more than 8
levels below the dark level and 3.4 % more than 24 below, against 5.8 % and 1.4 % at the shipped 0.2 and 2.6 % and 0.5 % at 0.4; the shares fall faster than the model's weight (1 − mix) would give (the thresholds are fixed, so blending shrinks the depth of the undershoot and
more pixels drop under them), while the control line's depth falls about in proportion (40, 31, 22; the 40 is a lower bound, the dark level is reached). Even at mix 0.4 `fast` is still above Lanczos (0.56 % and 0.17 %). Factor 1.0 shows the same order
(8.9 %, 5.6 %, 3.0 % above 8 against Lanczos 0.8 %) but is not validated by the control. This measures one side only: a larger
mix costs sharpness and quality scores (for example PSNR −0.17 dB and GMSD +0.0020 at 400 px for 0.4 against 0.2, [COLOR.md](COLOR.md) "Cost of a larger Lanczos mix"), and
whether it is worth it is the owner's decision ([OWNER_DECISIONS.md](OWNER_DECISIONS.md) row 13). No change of the default is proposed here.


### High mode (BL81)

Question: does `high` (Remacri, 192 px tiles, no Lanczos mix) undershoot thin real features as much as `fast`? The synthetic 1 px line says it overshoots more
([High mode (BK9)](#high-mode-bk9)); this is the real-photo counterpart. Date: 2026-11-28.
`node bench/thin-real.js --quality high --limit 10` (CPU, `PUSHUP_QUALITY=high PUSHUP_DEVICE=cpu`; about 6 min for 10 images and both factors) and
`node bench/thin-real.js --limit 10` for `fast` and Lanczos on the same images: the first 10 images of `bench/out/sub20` in file-name order, 400 px input,
same rule and control as above (10 images, not 20, because of the run time of `high`; the `fast` rows therefore differ a little from the 20-image table above).

| factor | method | feature pixels | undershoot > 8 | > 16 | > 24 | largest (levels) |
| --- | --- | --- | --- | --- | --- | --- |
| 1.0 | `fast` | 35629 | 5.60 % (1995) | 0.74 % (265) | 0.05 % (18) | 29.7 |
| 1.0 | `high` | 35629 | 10.98 % (3912) | 1.94 % (692) | 0.22 % (78) | 38.7 |
| 1.0 | Lanczos | 35629 | 0.88 % (314) | 0.02 % (8) | 0.00 % (0) | 18.5 |
| 2.5 | `fast` | 190674 | 5.11 % (9750) | 2.62 % (5004) | 1.33 % (2529) | 119.0 |
| 2.5 | `high` | 190674 | 14.29 % (27246) | 9.28 % (17690) | 5.80 % (11064) | 141.6 |
| 2.5 | Lanczos | 190674 | 0.58 % (1104) | 0.33 % (623) | 0.18 % (346) | 74.2 |

Positive control at factor 2.5 (mean levels below 40 of the pasted 1 px line): `high` **39.8** (the dark level is reached, so this is a lower bound), `fast` 31.0, Lanczos 0.0; all at least 15, so the factor 2.5 rows
are a result. At factor 1.0 the control reads 0.0 for every row, so those rows are not validated by it (as above).

**Reading (factor 2.5): yes, `high` goes below the dark level of thin real features clearly more often than `fast`, and far more often than Lanczos.** 14.3 % of
190 674 feature pixels are more than 8 levels below the dark level for `high` against 5.1 % for `fast` and 0.58 % for Lanczos; more than 24 levels: 5.8 % against 1.3 % and 0.18 %; the largest values are 141.6, 119.0 and 74.2. The direction
agrees with the synthetic line (BK9). Factor 1.0 shows the same order (11.0 % and 5.6 % above 8) but is not validated by the control. `fast` has the 20 % Lanczos mix and `high` has none, and
BL80 found that the mix dilutes the undershoot, so part of the difference may come from the mix and not from the model; this was not separated here. On a GPU the default is `high`
([README](../README.md#quality-modes-and-gpu)), so GPU users get the larger undershoot unless they set `PUSHUP_QUALITY=fast`. No change of a default is proposed here.
