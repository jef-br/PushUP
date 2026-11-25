# Flat saturated colours through `fast` mode (BK10)

Question: BK4 found flat green and blue moving by 20 to 30 bytes through the `fast` pipeline (white 3, black 1 to 2).
Which step causes it, and how does it depend on the colour? Date: 2026-11-15.

**Answer: the model causes it, not the Lanczos mix** (a plain Lanczos resize returns every one of the 27 test colours exactly;
the 20 % mix only reduces the model's shift to about 0.8 of its size). **The largest deviations are a border effect:** away from the
image border (more than 16 px from every edge) the shift is much smaller (blue 24 → 4, magenta 36 → 6), except for
saturated green, which also shifts by 10 to 14 bytes in the interior.

## Method

`node bench/colors.js` (27 colours × 2 model runs at 400×300, factor 1; about 23 s on 4 vCPU; two runs gave identical output).

- 27 uniform 400×300 images, each channel in {0, 128, 255}.
- Three settings: the shipped `fast` pipeline (`upscale`, 20 % Lanczos mix); the model only (`_run` with `lanczosMix: 0`);
  a plain `sharp` lanczos3 resize to the same size (reference).
- Per setting, the largest absolute byte deviation from the input colour, per channel (R/G/B). For the model only also: the mean signed
  shift per channel over the whole image, and the largest deviation more than 16 px away from every border.
- Last column: largest-channel deviation, shipped divided by model-only.

## Results

| colour (R,G,B) | shipped max dev R/G/B | model-only max dev R/G/B | model-only mean shift R/G/B | model-only max dev away from the border R/G/B | lanczos max dev | shipped / model-only (largest channel) |
|---|---|---|---|---|---|---|
| 0,0,0 | 1/1/1 | 1/1/1 | 0.0/0.0/0.0 | 0/0/0 | 0 | 1.00 |
| 0,0,128 | 3/2/10 | 4/2/12 | 0.0/0.0/-2.1 | 0/0/2 | 0 | 0.83 |
| 0,0,255 | 8/2/19 | 10/3/24 | 1.0/0.0/-4.1 | 1/0/4 | 0 | 0.79 |
| 0,128,0 | 11/8/14 | 14/10/17 | 6.1/-5.1/8.1 | 6/5/8 | 0 | 0.82 |
| 0,128,128 | 9/5/6 | 11/6/8 | 3.0/-3.0/4.1 | 3/3/4 | 0 | 0.82 |
| 0,128,255 | 7/2/7 | 9/2/9 | 0.0/-1.0/-0.0 | 0/1/0 | 0 | 0.78 |
| 0,255,0 | 22/16/26 | 28/20/33 | 10.1/-11.1/14.1 | 10/11/14 | 0 | 0.79 |
| 0,255,128 | 16/13/18 | 20/16/23 | 8.1/-7.1/9.3 | 8/7/9 | 0 | 0.78 |
| 0,255,255 | 14/10/1 | 17/13/1 | 5.1/-6.0/-0.0 | 5/6/0 | 0 | 0.82 |
| 128,0,0 | 5/1/0 | 6/1/0 | -0.2/0.0/0.0 | 1/0/0 | 0 | 0.83 |
| 128,0,128 | 4/2/14 | 5/3/17 | 1.0/0.0/-4.1 | 1/0/4 | 0 | 0.82 |
| 128,0,255 | 6/4/22 | 8/5/28 | 1.9/0.0/-4.2 | 2/0/4 | 0 | 0.79 |
| 128,128,0 | 4/5/8 | 5/6/10 | 2.1/-3.0/4.1 | 2/3/4 | 0 | 0.80 |
| 128,128,128 | 2/1/2 | 2/1/2 | -0.1/-0.1/0.9 | 1/0/1 | 0 | 1.00 |
| 128,128,255 | 4/3/10 | 5/4/13 | -0.1/-1.0/-2.1 | 1/2/2 | 0 | 0.77 |
| 128,255,0 | 14/12/19 | 18/15/24 | 9.0/-7.1/12.1 | 9/7/12 | 0 | 0.79 |
| 128,255,128 | 10/8/12 | 13/10/15 | 7.0/-5.0/8.1 | 7/5/8 | 0 | 0.80 |
| 128,255,255 | 6/6/0 | 8/7/0 | 2.1/-3.0/0.0 | 2/3/0 | 0 | 0.75 |
| 255,0,0 | 7/2/0 | 9/3/0 | -0.1/0.0/0.0 | 0/0/0 | 0 | 0.78 |
| 255,0,128 | 4/3/19 | 5/4/24 | -0.0/0.0/-5.2 | 0/0/5 | 0 | 0.79 |
| 255,0,255 | 5/5/29 | 6/6/36 | -0.0/0.0/-6.3 | 0/0/6 | 0 | 0.81 |
| 255,128,0 | 6/2/5 | 7/2/6 | -1.0/-1.0/1.0 | 1/1/1 | 0 | 0.86 |
| 255,128,128 | 5/2/6 | 6/3/7 | -0.1/-1.0/-2.0 | 1/1/2 | 0 | 0.86 |
| 255,128,255 | 4/7/15 | 5/9/19 | -0.0/-3.0/-4.1 | 0/3/4 | 0 | 0.79 |
| 255,255,0 | 1/9/12 | 1/11/15 | -0.0/-5.1/7.1 | 0/5/7 | 0 | 0.80 |
| 255,255,128 | 0/6/7 | 0/8/9 | 0.0/-3.0/3.1 | 0/3/3 | 0 | 0.78 |
| 255,255,255 | 2/3/1 | 3/4/1 | -1.0/-1.0/-0.0 | 1/1/0 | 0 | 0.75 |

## Reading

- **Lanczos is exact** on all 27 colours (deviation 0 in every row), so the plain-resize part of the pipeline cannot shift a flat colour.
- **The mix helps by about a fifth, as expected:** shipped / model-only is 0.75 to 0.86 in every row with a model-only deviation of 5 or more
  (1.00 for black and grey, where rounding hides it).
- **Which channel:** in the shipped column the blue channel has the largest deviation in 17 of the 27 colours, red in 5, green in 1, two ties, and
  two colours (black, grey) stay within 2 bytes. The worst shipped colours: (255,0,255) 29 on blue, (0,255,0) 26 on blue (R 22, G 16), (128,0,255) 22,
  (255,0,128) 19, (128,255,0) 19, (0,0,255) 19. In the interior of flat saturated blue and magenta only blue moves, down (mean −4 to −6; at the border R and G move too); in green-heavy colours all
  three channels move toward grey (the 255 channel down by 11, the 0 channels up by 10 to 14: a desaturation).
- **Border effect:** the model-only maximum is far larger than the mean shift for blue and magenta, because it sits near the image border. Away from
  the border: (0,0,255) 24 → 4, (128,0,255) 28 → 4, (255,0,128) 24 → 5, (255,0,255) 36 → 6, (0,255,0) 33 → 14, (128,255,0) 24 → 12. So for
  most colours the visible error is a band around the edge of the image, for green a band plus a constant interior shift.
- **What it would take to fix (not implemented):** the border part could be removed by padding the input (mirror) by 16 px before the model and cropping
  the output afterwards; at best the error then drops to the "away from the border" column (blue 24 → 4, magenta 36 → 6, green 33 → 14). That
  is an upper bound from this table; a check by the BK10 adversary (mirror-pad 16 px, model only, crop back; also 32 px) on four colours gave
  exactly the "away from the border" values in every distance band (magenta 0/0/6, blue 1/0/4, green 10/11/14, (128,255,0) 9/7/12), and
  showed the border effect reaching about 8 px from the edge, so 16 px is enough. Uniform images only; textured photos were not tested. The change costs about 19 % more pixels through the model (432×332 vs 400×300, from the sizes, time
  not measured) and changes default output, so it needs a quality-gate run and an owner decision. The interior green shift would need a different model.
- **Limits:** synthetic uniform images (no texture, no gradient), one size, `fast` only; natural photos are measured in "Real photos (BL13)" below (the border band is not visible there; the bias is about −1 byte in R and G).

## Real photos (BL13)

The tables above use uniform images. `node bench/colors-real.js` (about 15 s for 20 images, CPU, `fast`) measures the same pipeline on the 20 real
product photos of `bench/out/sub20` (13 Amazon Berkeley Objects, 7 Lamoda; build with `bash bench/fetch_testset.sh`). Per image: reference = the
source resized to 1000 px on its longest side (Lanczos3), input = that reference downscaled to 400 px (cubic) and JPEG q85 (the way `bench/bench.js`
degrades at `--sizes 400`); outputs: the shipped `fast` pipeline and plain Lanczos3, both 1000 px. Per channel: bias = mean(output − reference),
mean absolute difference, and the 99th percentile of the absolute difference (from a 256-bin histogram over all pixels of all images). The last
column pair is the same over the pixels more than 16 px from every border. Run 2026-11-20:

| region | method | channel | bias | mean abs diff | 99th percentile abs diff |
| --- | --- | --- | --- | --- | --- |
| whole image | `fast` | R | −1.09 | 4.15 | 41 |
| whole image | `fast` | G | −0.96 | 4.23 | 45 |
| whole image | `fast` | B | −0.03 | 4.06 | 47 |
| whole image | Lanczos | R | −0.10 | 4.22 | 51 |
| whole image | Lanczos | G | −0.06 | 4.37 | 58 |
| whole image | Lanczos | B | −0.07 | 4.78 | 61 |
| more than 16 px from the border | `fast` | R | −1.10 | 4.27 | 42 |
| more than 16 px from the border | `fast` | G | −0.96 | 4.36 | 46 |
| more than 16 px from the border | `fast` | B | −0.04 | 4.23 | 48 |
| more than 16 px from the border | Lanczos | R | −0.10 | 4.40 | 52 |
| more than 16 px from the border | Lanczos | G | −0.06 | 4.56 | 59 |
| more than 16 px from the border | Lanczos | B | −0.07 | 5.00 | 62 |

The three images with the largest `fast` bias (R/G/B, bytes): `abo_1df379d8.png` −2.77/−1.43/−0.96, `abo_1d8c3146.png` −1.81/−2.18/−1.10,
`abo_69a18908.png` −0.62/−0.22/1.62.

- **Reading:** on real photos `fast` has a small negative bias in red and green (about −1 byte, 0.99 and 0.90 bytes below Lanczos), none in blue
  (0.04 above Lanczos). The largest bias of any single image is −2.8 bytes (red). Both the whole-image and the interior rows agree to within
  0.2 bytes, so the border band that dominates the uniform-colour result does not show here. The mean absolute difference is about the same as
  Lanczos (R and G) or smaller (B 4.06 vs 4.78), and the 99th percentile is 10 to 14 levels lower than Lanczos: `fast` is closer to the reference
  than Lanczos overall, and its colour offset is small next to the error it removes.
- **Decision rule of the task:** a `fast` bias that exceeds Lanczos by more than 2 bytes on any channel would be recorded as a finding and a new
  task. The largest excess is 0.99 bytes (R), so no follow-up task is added and nothing in the pipeline changes.
- **Limits:** 20 images at one input size (400 px; 600 and 800 px follow below), JPEG q85 degradation, one run (the script is deterministic); the reference is itself a
  resized photo, so a bias shared by both methods would not show. Saturated flat product backgrounds are in the set but not separated out.

### 800 px and 600 px input (BL17)

Same script, same 20 images, same degradation (the input is the 1000 px reference downscaled to the given size, cubic, JPEG q85), factor 1000/800 and
1000/600. Run 2026-11-20 (CPU, `fast`): `PUSHUP_DEVICE=cpu PUSHUP_QUALITY=fast node bench/colors-real.js --size 800` and `... --size 600` (about 15 s each).

| input | region | method | channel | bias | mean abs diff | 99th percentile abs diff |
| --- | --- | --- | --- | --- | --- | --- |
| 800 px | whole image | `fast` | R | −1.14 | 2.76 | 22 |
| 800 px | whole image | `fast` | G | −0.97 | 2.65 | 22 |
| 800 px | whole image | `fast` | B | −0.04 | 2.36 | 23 |
| 800 px | whole image | Lanczos | R | −0.03 | 3.39 | 44 |
| 800 px | whole image | Lanczos | G | 0.00 | 3.45 | 49 |
| 800 px | whole image | Lanczos | B | −0.01 | 3.71 | 50 |
| 800 px | more than 16 px from the border | `fast` | R | −1.15 | 2.84 | 23 |
| 800 px | more than 16 px from the border | `fast` | G | −0.96 | 2.72 | 22 |
| 800 px | more than 16 px from the border | `fast` | B | −0.05 | 2.47 | 24 |
| 800 px | more than 16 px from the border | Lanczos | R | −0.03 | 3.54 | 45 |
| 800 px | more than 16 px from the border | Lanczos | G | −0.00 | 3.60 | 50 |
| 800 px | more than 16 px from the border | Lanczos | B | −0.01 | 3.87 | 51 |
| 600 px | whole image | `fast` | R | −1.14 | 3.35 | 31 |
| 600 px | whole image | `fast` | G | −0.98 | 3.34 | 33 |
| 600 px | whole image | `fast` | B | −0.06 | 3.09 | 34 |
| 600 px | whole image | Lanczos | R | −0.04 | 3.57 | 44 |
| 600 px | whole image | Lanczos | G | −0.01 | 3.59 | 48 |
| 600 px | whole image | Lanczos | B | −0.01 | 3.90 | 50 |
| 600 px | more than 16 px from the border | `fast` | R | −1.15 | 3.44 | 31 |
| 600 px | more than 16 px from the border | `fast` | G | −0.98 | 3.44 | 33 |
| 600 px | more than 16 px from the border | `fast` | B | −0.07 | 3.22 | 35 |
| 600 px | more than 16 px from the border | Lanczos | R | −0.04 | 3.73 | 45 |
| 600 px | more than 16 px from the border | Lanczos | G | −0.01 | 3.75 | 49 |
| 600 px | more than 16 px from the border | Lanczos | B | −0.02 | 4.08 | 51 |

The three images with the largest `fast` bias (R/G/B, bytes). At 800 px: `abo_1df379d8.png` −2.72/−1.82/−1.35, `abo_002a7de9.png` −1.44/−0.68/−0.43,
`lamoda_Tshirts_11382.png` −1.32/−0.79/−0.01. At 600 px: `abo_1df379d8.png` −2.84/−1.70/−1.19, `abo_1d8c3146.png` −1.34/−1.48/−0.46,
`abo_002a7de9.png` −1.41/−0.64/−0.40.

- **Reading:** the bias does not depend on the input size: red −1.09 / −1.14 / −1.14 and green −0.96 / −0.97 / −0.98 at 400 / 600 / 800 px, blue −0.03 to −0.06; Lanczos stays
  at 0 to −0.1. The worst single image is the same one at every size (`abo_1df379d8.png`, red −2.7 to −2.8). The mean absolute difference of `fast`
  falls with the input size (red 4.15, 3.35, 2.76) and is below Lanczos at 600 and 800 px on all three channels; the 99th percentile is 13 to 27 levels
  lower than Lanczos. Whole-image and interior rows agree within 0.1 byte in the bias.
- **Decision rule of the task** (excess of the `fast` bias over Lanczos above 2 bytes on any channel): the largest excess is 1.11 bytes (red, 800 px;
  600 px: 1.10), so it is not exceeded at any size, no follow-up task is added and nothing changes.
- **Limits:** as above (20 images, JPEG q85 degradation, deterministic script, a bias shared with the reference would not show); three input sizes, not the whole 400–800 px range.

## Neutral greys (BL43, 2026-11-24)

Question: product shots on grey or white backdrops need R = G = B to stay equal. A few levels of colour cast in a grey backdrop shows.
The sections above measure flat saturated colours; this one measures greys.

`node bench/neutral.js` (no download, `fast`, CPU): synthetic 400×300 images with R = G = B everywhere (flat grey at 64, 128, 192 and 240; a
horizontal ramp 16 → 240; seeded grey noise 128 ± 8) at factors 1 and 1.5. Spread = max(R,G,B) − min(R,G,B) of an output pixel (0 for a neutral pixel);
"away from the border" = more than 16 px from every edge, as in `bench/colors.js`.

| case | factor | out | max spread (whole image) | mean spread (whole image) | max spread (away from the border) | mean spread (away from the border) |
|---|---|---|---|---|---|---|
| flat64 | 1 | 400x300 | 2 | 1.016 | 2 | 1.001 |
| flat64 | 1.5 | 600x450 | 2 | 1.000 | 1 | 1.000 |
| flat128 | 1 | 400x300 | 2 | 1.034 | 2 | 1.020 |
| flat128 | 1.5 | 600x450 | 3 | 1.000 | 1 | 1.000 |
| flat192 | 1 | 400x300 | 2 | 1.025 | 1 | 1.000 |
| flat192 | 1.5 | 600x450 | 3 | 0.999 | 1 | 1.000 |
| flat240 | 1 | 400x300 | 3 | 1.005 | 1 | 1.000 |
| flat240 | 1.5 | 600x450 | 2 | 1.000 | 1 | 1.000 |
| ramp | 1 | 400x300 | 3 | 1.470 | 2 | 1.481 |
| ramp | 1.5 | 600x450 | 3 | 1.317 | 3 | 1.317 |
| noise | 1 | 400x300 | 6 | 1.570 | 6 | 1.578 |
| noise | 1.5 | 600x450 | 8 | 1.720 | 7 | 1.727 |

- **Flat greys:** the output is never exactly neutral. Almost every pixel has a spread of exactly 1 level (mean 1.00–1.03; interior largest 1–2, whole
  image 2–3 including the border). One level between channels is not visible.
- **Ramp:** mean spread 1.3–1.5, largest 3.
- **Noisy grey:** the model turns grey noise into colour noise: mean spread 1.6–1.7, largest 6 at factor 1 and 8 (7 away from the border) at factor 1.5.
  A few isolated pixels reach 6–8 levels; the mean stays under 2.
- **Result:** greys stay neutral to within 1–2 levels on flat areas and 3 on ramps, but noisy grey areas get isolated pixels with a spread above 2
  levels (the task's threshold), so the finding is added to [OWNER_DECISIONS.md](OWNER_DECISIONS.md) (row 13). No change to `src/`. A test pins the flat-grey
  figure (`test/bench-run-neutral.test.js`: the measured largest spread plus 1), so a later model change that adds a cast fails it.
- **Limits:** synthetic images, one size, `fast` only, grey noise of one amplitude; no real photographs of grey backdrops.

## Neutral backdrops on real photos (BL46, 2026-11-24)

Question: the synthetic noisy grey of BL43 (row 13 of [OWNER_DECISIONS.md](OWNER_DECISIONS.md)) turned into colour noise. Does the same happen on the flat, near-neutral backdrops of real product photos?

`node bench/neutral-real.js` (needs `bench/out/sub20`, `fast`, CPU, about 11 s). Inputs are built as in `bench/colors-real.js` (source at 1000 px, downscaled to 400 px, JPEG q85). Regions are found in the **input**: 16×16 blocks on a grid starting 16 px from the left and top edge, at least 16 px from every edge, with a largest per-pixel channel spread (max(R,G,B) − min(R,G,B)) of at most 2 and a luma standard deviation between 0.5 and 8. Each block is measured in the `fast` output (factor 1000 / longest side) and in plain Lanczos to the same size, in the output box from ceil(x·f) to floor((x+16)·f) (f = 1000 / longest side), so the box lies inside the block's pixels.

20 images, 12 with a region, 317 blocks (no region: abo_002a7de9, abo_1d441bcb, abo_1d8c3146, abo_1df379d8, abo_69a18908, abo_69e928d0, lamoda_Jeans_39386, lamoda_Tshirts_5095).

| method | pixels | mean spread | 99th percentile spread | share of pixels with spread >= 3 (%) |
|---|---|---|---|---|
| `fast` | 507200 | 1.60 | 4 | 16.32 |
| Lanczos | 507200 | 0.64 | 2 | 0.17 |

- **Result:** yes. In near-neutral flat regions of real photos, 16.32% of `fast` output pixels have a channel spread of 3 or more against 0.17% for plain Lanczos (16.15 percentage points more, far above the 1 point of the task's rule); the mean spread is 1.60 against 0.64 and the 99th percentile 4 against 2. So the colour noise seen on synthetic grey noise is real on photos, but small in size (a spread of 3 to 4 levels at the 99th percentile); it is not measured whether it is visible.
- **Limits:** one input size (400 px), JPEG q85 degradation, 12 of 20 images have a qualifying region, the blocks are chosen on the input (a region where the input is already neutral), `fast` only, no visual judgement. No change to `src/`.

### Model alone against the Lanczos mix (BL47, 2026-11-24)

Question: how much of this comes from the model, and how much does the shipped 20% Lanczos mix already hide? `node bench/neutral-real.js --mix <share>` runs the internal `_run` with that Lanczos share (the same 12 images, 317 blocks and 507 200 pixels as above). `--mix 0.2` prints exactly the table above (checked with `diff`); without the flag the shipped `upscale` runs, so nothing else changes.

| Lanczos share in the output | mean spread | 99th percentile spread | share of pixels with spread >= 3 (%) |
|---|---|---|---|
| 0 (model only) | 1.64 | 4 | 17.19 |
| 0.2 (shipped) | 1.60 | 4 | 16.32 |
| 0.4 | 1.39 | 4 | 11.70 |
| 0.6 | 0.86 | 3 | 3.86 |
| 1 (plain Lanczos, from the table above) | 0.64 | 2 | 0.17 |

- **Result:** the share of pixels with spread ≥ 3 falls steadily as the mix grows (17.19 → 16.32 → 11.70 → 3.86 %), but the shipped 20% takes away only 0.87 points of the 17.19 the model alone produces. The effect comes from the model, not from the mix. A larger mix would lower it further, but what that costs in texture or sharpness is not measured here, and a mix change is a default change that needs the quality gate and the owner.

### 800 px and 600 px input (BL48, 2026-11-25)

Question: the BL46 figures are for 400 px input (a 2.5x upscale to 1000 px). Does the effect shrink with a smaller upscale factor? `node bench/neutral-real.js --size 600` and `--size 800` (same script, no change; the block rule is the same, the box scales with f = 1000 / longest side). More blocks qualify at larger input, so the pixel counts differ.

| input | images with a region | blocks | pixels per method | method | mean spread | 99th percentile spread | share of pixels with spread >= 3 (%) |
|---|---|---|---|---|---|---|---|
| 400 px (BL46) | 12 of 20 | 317 | 507200 | `fast` | 1.60 | 4 | 16.32 |
| 400 px (BL46) | 12 of 20 | 317 | 507200 | Lanczos | 0.64 | 2 | 0.17 |
| 600 px | 17 of 20 | 850 | 574600 | `fast` | 1.64 | 4 | 17.94 |
| 600 px | 17 of 20 | 850 | 574600 | Lanczos | 0.69 | 2 | 0.12 |
| 800 px | 18 of 20 | 1661 | 664400 | `fast` | 1.65 | 4 | 17.82 |
| 800 px | 18 of 20 | 1661 | 664400 | Lanczos | 0.71 | 2 | 0.17 |

- **Result:** the share of pixels with spread ≥ 3 in the `fast` output stays more than 1 point above Lanczos's at both sizes: 600 px yes (17.82 points above), 800 px yes (17.64 points above). It does not fall at 600 or 800 px in this set (the regions differ between sizes, so this is not a controlled trend).
- **Limits:** the sets of regions differ between sizes (more regions qualify at larger input), so the three rows are not the same pixels; JPEG q85 degradation, `fast` only, no visual judgement.


### `high` mode on CPU (BL49, 2026-11-25)

Question: row 13 of `docs/OWNER_DECISIONS.md` only knew the `fast` figures; `high` (Remacri) is what `auto` uses on a GPU. `PUSHUP_QUALITY=high PUSHUP_DEVICE=cpu` gives the same model and tiles as on a GPU, so `node bench/neutral-real.js --quality high` (new option, default `fast`, output unchanged without it) measures it on `bench/out/sub20` at 400 px input, all 20 images, same blocks as BL46 (12 of 20 images, 317 blocks, 507200 pixels per method). `high` mixes in no Lanczos.

| method | mean spread | 99th percentile spread | share of pixels with spread >= 3 (%) |
|---|---|---|---|
| `high` | 2.87 | 7 | 50.43 |
| Lanczos | 0.64 | 2 | 0.17 |
| `fast` (BL46, for comparison) | 1.60 | 4 | 16.32 |

- **Result:** yes, `high` has a share of pixels with spread >= 3 more than 1 point above Lanczos's: 50.27 points above (`fast`: 16.15). The effect is about three times as large in `high`.
- **Limits:** CPU run of the GPU model (same weights; GPU rounding may differ slightly), JPEG q85 inputs, 400 px input only, no visual judgement.

### Cost of a larger Lanczos mix (BL50, 2026-11-25)

Question: BL47 found that a 40% Lanczos mix cuts the share of neutral-backdrop pixels with spread >= 3 from 16.3% to 11.7% (60%: 3.9%), but what that costs in quality was not measured. `PUSHUP_QUALITY=fast PUSHUP_DEVICE=cpu node bench/bench.js bench/out/sub20 --sizes 400,800 --methods lanczos,sr-full@0,sr-full@0.2,sr-full@0.4,sr-full@0.6` (all 20 images, no `--limit`, about 4 min). The differences are to `sr-full@0.2`, the shipped mix.

| input | method | PSNR | SSIM | GMSD | PSNR diff | SSIM diff | GMSD diff |
|---|---|---|---|---|---|---|---|
| 400 px | Lanczos | 28.97 | 0.8785 | 0.1271 | -2.54 | -0.0156 | +0.0195 |
| 400 px | `sr-full@0` | 31.20 | 0.8898 | 0.1082 | -0.31 | -0.0043 | +0.0006 |
| 400 px | `sr-full@0.2` (shipped mix) | 31.51 | 0.8941 | 0.1076 | 0 | 0 | 0 |
| 400 px | `sr-full@0.4` | 31.34 | 0.8954 | 0.1096 | -0.17 | +0.0013 | +0.0020 |
| 400 px | `sr-full@0.6` | 30.80 | 0.8931 | 0.1140 | -0.71 | -0.0010 | +0.0064 |
| 800 px | Lanczos | 30.44 | 0.9226 | 0.0875 | -5.84 | -0.0317 | +0.0383 |
| 800 px | `sr-full@0` | 36.39 | 0.9537 | 0.0484 | +0.11 | -0.0006 | -0.0008 |
| 800 px | `sr-full@0.2` (shipped mix) | 36.28 | 0.9543 | 0.0492 | 0 | 0 | 0 |
| 800 px | `sr-full@0.4` | 35.05 | 0.9514 | 0.0568 | -1.23 | -0.0029 | +0.0076 |
| 800 px | `sr-full@0.6` | 33.54 | 0.9449 | 0.0666 | -2.74 | -0.0094 | +0.0174 |

- **Gate (PSNR down at most 0.02 dB, SSIM down at most 0.001, GMSD up at most 0.001):** a 40% mix passes at 400 px: no (PSNR -0.17, GMSD +0.0020; SSIM improves by 0.0013); at 800 px: no (PSNR -1.23, SSIM -0.0029, GMSD +0.0076). A 60% mix fails at both sizes too.
- **Reading:** at 400 px a 40% mix gives slightly higher SSIM but lower PSNR and worse GMSD; at 800 px every figure is worse, and the loss grows with the mix. The BL47 neutral-region gain from a 40% mix (4.6 points of pixels) is therefore paid for with a measurable quality loss, most at 800 px.
- **Limits:** CPU, `fast` only, JPEG q85 inputs, 20 images, PSNR/SSIM/GMSD are not texture judgements. `sr-full@0.2` is the shipped configuration by construction (whole image, mix 0.2, `src/index.js`); it was not compared byte for byte with `upscale`.

### Grey-preserving step, offline (BL51, 2026-11-25)

Question: option (b) of row 13 of `docs/OWNER_DECISIONS.md` is a post-step that pulls near-neutral output pixels to their channel mean. What would it do to quality and to the neutral-backdrop noise? `node bench/grey-step.js` (new, offline: nothing in `src/` changes) applies the step "every pixel whose channel spread (max - min of R, G, B) is at most T becomes its channel mean, rounded" to the shipped `fast` output for T = 2, 3 and 4. Inputs, blocks and boxes are as in BL46 (`bench/out/sub20`, 400 px, JPEG q85; 12 of 20 images, 317 blocks); PSNR, SSIM and GMSD are whole-image means over all 20 images, scored as `bench/bench.js` scores (`bench/groundtruth.js` is the construction `bench/bench.js` used inline, now shared; its output is unchanged, checked on 4 images at 400 and 800 px by a before/after comparison of `--json` rows without the time column).

| method | PSNR | SSIM | GMSD | mean spread (neutral blocks) | share of pixels with spread >= 3 (%) |
|---|---|---|---|---|---|
| Lanczos | 28.97 | 0.8785 | 0.1271 | 0.64 | 0.17 |
| `fast` (no step) | 31.51 | 0.8941 | 0.1076 | 1.60 | 16.32 |
| `fast` + step T=2 | 31.50 | 0.8940 | 0.1076 | 0.53 | 16.32 |
| `fast` + step T=3 | 31.50 | 0.8940 | 0.1076 | 0.15 | 3.73 |
| `fast` + step T=4 | 31.50 | 0.8940 | 0.1076 | 0.01 | 0.22 |

Differences to `fast` (no step), and the two questions per T:

- **T=2:** PSNR -0.014, SSIM -0.00010, GMSD -0.00003: passes the quality gate (PSNR down at most 0.02 dB, SSIM down at most 0.001, GMSD up at most 0.001). Share of spread >= 3 is 16.15 points above Lanczos: not within 1 point. (The share cannot move at T=2: the step only touches pixels with spread of 2 or less, which are not in the spread >= 3 share.)
- **T=3:** PSNR -0.012, SSIM -0.00013, GMSD -0.00004: passes the gate. 3.56 points above Lanczos: not within 1 point.
- **T=4:** PSNR -0.012, SSIM -0.00015, GMSD -0.00006: passes the gate. 0.06 points above Lanczos: within 1 point.
- **Result:** the smallest T that passes the gate and brings the share within 1 point of Lanczos's is T=4.
- **Limits:** the step acts on the whole image, not only on neutral regions, so it also flattens genuine slight tints with a spread of 4 or less (the metric cost above is small, a visual cost is not judged); `fast` only, 400 px input only (the 800 px result, which fails the gate, is in the next subsection), T = 2, 3 and 4 only (larger T not tried), 20 images, JPEG q85. Shipping it would change default output, so it is an owner decision (row 13, option (b)).

### Grey-preserving step at 800 px (BL53, 2026-11-25)

Question: the quality gate in `docs/OVERNIGHT_RUN.md` is "at each size" (400 and 800 px), and BL51 measured 400 px only. `node bench/grey-step.js --size 800` (new option `--size 400|800`, default 400, output unchanged without it; about 1 min) on `bench/out/sub20`: same step, same scoring, 800 px degraded input, output 1000 px. 18 of 20 images have a neutral region (1661 blocks), as in BL48.

| method | PSNR | SSIM | GMSD | mean spread (neutral blocks) | share of pixels with spread >= 3 (%) |
|---|---|---|---|---|---|
| Lanczos | 30.44 | 0.9226 | 0.0875 | 0.71 | 0.17 |
| `fast` (no step) | 36.28 | 0.9543 | 0.0492 | 1.65 | 17.82 |
| `fast` + step T=2 | 36.24 | 0.9542 | 0.0492 | 0.58 | 17.82 |
| `fast` + step T=3 | 36.24 | 0.9542 | 0.0492 | 0.19 | 4.71 |
| `fast` + step T=4 | 36.25 | 0.9542 | 0.0492 | 0.01 | 0.18 |

Differences to `fast` (no step), and the two questions per T:

- **T=2:** PSNR -0.042, SSIM -0.00005, GMSD +0.00001: fails the quality gate at 800 px (PSNR down more than 0.02 dB). Share 17.64 points above Lanczos: not within 1 point.
- **T=3:** PSNR -0.038, SSIM -0.00008, GMSD +0.00001: fails the gate at 800 px (PSNR). 4.54 points above Lanczos: not within 1 point.
- **T=4:** PSNR -0.035, SSIM -0.00011, GMSD +0.00004: fails the gate at 800 px (PSNR; SSIM and GMSD are within their limits). 0.01 points above Lanczos: within 1 point.
- **Result:** at 800 px no T passes the gate, because PSNR falls by 0.035 to 0.042 dB against a limit of 0.02 dB; at 400 px all three passed (BL51, drops of 0.012 to 0.014 dB). So T=4 does not pass at both sizes, and by the gate rule the step could not ship as a default. The share figures behave as at 400 px (T=4: 17.82% to 0.18%).
- **Limits:** the `fast` row equals the BL48 and BL50 800 px figures (36.28 / 0.9543 / 0.0492, 17.82%); `fast` only, 20 images, JPEG q85, no visual judgement. A step limited to near-neutral regions of the input (instead of the whole image) was not tried.

### Grey-preserving step on `high` (BL54, 2026-11-25)

Question: BL49 found the colour noise is three times larger in `high` (50.4% of neutral-block pixels with spread >= 3). Does the step of BL51 fix it there, and at what quality cost? `PUSHUP_DEVICE=cpu node bench/grey-step.js --quality high` (new option `--quality fast|high`, default `fast`, output unchanged without it; 5 min 20 s for T = 2, 3, 4 on all 20 images), then `--t 5` and `--t 6` as one more run each (about 5 min each; the task allowed it because no T of 2 to 4 reached the target). 400 px input, `bench/out/sub20`, 12 images with a region, 317 blocks; the `high` (no step) and Lanczos rows are identical in the three runs, and the `high` row equals BL49 (50.43%).

| method | PSNR | SSIM | GMSD | mean spread (neutral blocks) | share of pixels with spread >= 3 (%) |
|---|---|---|---|---|---|
| Lanczos | 28.97 | 0.8785 | 0.1271 | 0.64 | 0.17 |
| `high` (no step) | 31.12 | 0.8994 | 0.1018 | 2.87 | 50.43 |
| `high` + step T=2 | 31.12 | 0.8994 | 0.1018 | 2.48 | 50.43 |
| `high` + step T=3 | 31.12 | 0.8994 | 0.1018 | 2.36 | 46.49 |
| `high` + step T=4 | 31.12 | 0.8993 | 0.1018 | 1.91 | 35.16 |
| `high` + step T=5 | 31.11 | 0.8992 | 0.1018 | 0.75 | 11.94 |
| `high` + step T=6 | 31.10 | 0.8992 | 0.1018 | 0.22 | 3.11 |

Differences to `high` (no step), and the two questions per T:

- **T=2:** PSNR 0.000, SSIM -0.00000, GMSD -0.00001: passes the quality gate. Share 50.27 points above Lanczos (from the unrounded values; the rounded cells give 50.26): not within 1 point.
- **T=3:** PSNR -0.001, SSIM -0.00002, GMSD +0.00001: passes the gate. 46.32 points above Lanczos: not within 1 point.
- **T=4:** PSNR -0.005, SSIM -0.00007, GMSD +0.00001: passes the gate. 34.99 points above Lanczos: not within 1 point.
- **T=5:** PSNR -0.012, SSIM -0.00015, GMSD +0.00001: passes the gate. 11.77 points above Lanczos: not within 1 point.
- **T=6:** PSNR -0.019, SSIM -0.00013, GMSD +0.00003: passes the gate (PSNR 0.001 dB inside the 0.02 dB limit). 2.94 points above Lanczos: not within 1 point.
- **Result:** no T from 2 to 6 brings the share of pixels with spread >= 3 within 1 point of Lanczos's in `high` output. The step needs a larger T than in `fast` (where T=4 was enough) because the model's noise is larger (mean spread 2.87, 99th percentile 7), and at T=6 the PSNR cost is already at the gate limit (-0.019 dB), so a larger T would very likely fail it (not run). The step is cheap per point of share removed in `high` (T=4: 0.005 dB for 15.3 points; `fast` T=4: 0.012 dB for 16.1 points), but `high` needs a larger T, and that is what brings the PSNR drop to the limit.
- **Limits:** CPU run of the GPU model, 400 px input only (800 px, where the `fast` step failed the gate, was not run for `high`), T = 2 to 6 only, 20 images, JPEG q85, no visual judgement.

### What the grey-preserving step changes (BL55, 2026-11-25)

Question: the BL51 step acts on the whole image, so how many pixels does it change, and do those pixels end up closer to the ground truth, or did it flatten a real tint? `node bench/grey-step.js --changed` on `bench/out/sub20` (20 images, `fast`, 400 px input, 1000 px output, CPU) prints, after the BL51 table (unchanged), this table. "Changed" is any pixel whose output differs from the `fast` output after the step (this includes a change of one level by rounding the mean). "Real tint" is a ground-truth pixel with channel spread above T. Errors are mean absolute differences to the ground truth per channel (0-255), over the changed pixels only.

| T | pixels changed (% of all) | of those: ground truth spread > T (%) | mean abs error before | mean abs error after |
|---|---|---|---|---|
| 2 | 48.60 | 2.28 | 1.069 | 1.338 |
| 3 | 51.87 | 2.48 | 1.278 | 1.532 |
| 4 | 54.49 | 3.48 | 1.493 | 1.745 |

- **Result for T=4:** the step does not move the changed pixels closer to the ground truth on average (no: mean absolute error 1.493 before, 1.745 after), and 3.48% of the changed pixels had a real tint (spread above 4) in the ground truth.
- **Reading:** the step changes about half of all pixels (it reaches every pixel with spread of 4 or less, in smooth areas of any colour, not only backdrops), and on those pixels the grey mean is on average further from the ground truth than the model output was, although whole-image PSNR barely moves (-0.012 dB) because the errors involved are small (about 1.5 levels per channel). The ground truth is mostly not neutral where the step acts: it has spread up to T there too, only 2-3% above T. This is a measurement of error, not a visual judgement.
- **Limits:** `fast` only, 400 px input only, T = 2, 3 and 4, 20 images, JPEG q85; pixels the step leaves unchanged are not scored here.
