# Flat saturated colours through `fast` mode (BK10)

Question: BK4 found flat green and blue moving by 20 to 30 bytes through the `fast` pipeline (white 3, black 1 to 2).
Which step causes it, and how does it depend on the colour? Date: 2026-11-15.

**Answer: the model causes it, not the Lanczos mix** (a plain Lanczos resize returns every one of the 27 test colours exactly;
the 20 % mix only reduces the model's shift to about 0.8 of its size). **The largest deviations are a border effect:** away from the
image border (more than 16 px from every edge) the shift is much smaller (blue 24 → 4, magenta 36 → 6), except for
saturated green, which also shifts by 10 to 14 bytes in the interior.

**Contents** (one line per section, in file order; the question and answer above come first)

- [Method](#method): how the 27 flat test colours were built
- [Results](#results): measured shift per colour, border and interior
- [Reading](#reading): what the flat-colour numbers mean
- [Real photos (BL13)](#real-photos-bl13): colour bias of `fast` against Lanczos on 20 real photos
- [800 px and 600 px input (BL17)](#800-px-and-600-px-input-bl17): the same colour-bias check at larger input sizes
- [Neutral greys (BL43, 2026-11-24)](#neutral-greys-bl43-2026-11-24): synthetic greys: does R = G = B survive `fast`?
- [Neutral backdrops on real photos (BL46, 2026-11-24)](#neutral-backdrops-on-real-photos-bl46-2026-11-24): colour noise in grey backdrops of real photos
- [Model alone against the Lanczos mix (BL47, 2026-11-24)](#model-alone-against-the-lanczos-mix-bl47-2026-11-24): how much of that noise the 20% Lanczos mix removes
- [800 px and 600 px input (BL48, 2026-11-25)](#800-px-and-600-px-input-bl48-2026-11-25): neutral-backdrop noise at 600 and 800 px input
- [`high` mode on CPU (BL49, 2026-11-25)](#high-mode-on-cpu-bl49-2026-11-25): neutral-backdrop noise in `high` mode
- [Cost of a larger Lanczos mix (BL50, 2026-11-25)](#cost-of-a-larger-lanczos-mix-bl50-2026-11-25): PSNR, SSIM and GMSD cost of a 40% or 60% mix
- [Grey-preserving step, offline (BL51, 2026-11-25)](#grey-preserving-step-offline-bl51-2026-11-25): a post-step that flattens near-grey pixels, at 400 px
- [Grey-preserving step at 800 px (BL53, 2026-11-25)](#grey-preserving-step-at-800-px-bl53-2026-11-25): the same step at 800 px: fails the PSNR gate
- [Grey-preserving step on `high` (BL54, 2026-11-25)](#grey-preserving-step-on-high-bl54-2026-11-25): the step on `high` output, T = 2 to 6
- [What the grey-preserving step changes (BL55, 2026-11-25)](#what-the-grey-preserving-step-changes-bl55-2026-11-25): share of pixels changed and of real tints flattened
- [Grey-preserving step on the 60-image set (BL56, 2026-11-26)](#grey-preserving-step-on-the-60-image-set-bl56-2026-11-26): step results on 60 images instead of 20
- [Neutral backdrops by JPEG quality (BL57, 2026-11-26)](#neutral-backdrops-by-jpeg-quality-bl57-2026-11-26): neutral-backdrop noise at input JPEG q60, q85, q95
- [Flat coloured backdrops (BL58, 2026-11-26)](#flat-coloured-backdrops-bl58-2026-11-26): chroma noise on flat coloured backdrops, 20 images
- [Region-limited grey-preserving step (BL59, 2026-11-26)](#region-limited-grey-preserving-step-bl59-2026-11-26): step limited to flat neutral regions, at 400 and 800 px
- [Flat coloured backdrops on the 60-image set (BL61, 2026-11-26)](#flat-coloured-backdrops-on-the-60-image-set-bl61-2026-11-26): coloured-backdrop chroma noise on 60 images
- [Flat coloured backdrops by size and JPEG quality (BL60, 2026-11-26)](#flat-coloured-backdrops-by-size-and-jpeg-quality-bl60-2026-11-26): coloured backdrops by input size and JPEG quality, 20 images
- [Flat coloured backdrops by size and JPEG quality on the 60-image set (BL62, 2026-11-26)](#flat-coloured-backdrops-by-size-and-jpeg-quality-on-the-60-image-set-bl62-2026-11-26): the same by size and quality on 60 images
- [Flat coloured backdrops in `high` mode (BL64, 2026-11-26)](#flat-coloured-backdrops-in-high-mode-bl64-2026-11-26): coloured-backdrop chroma noise in `high` mode, 20 images
- [Flat coloured backdrops in `high` mode on the 60-image set (BL65, 2026-11-26)](#flat-coloured-backdrops-in-high-mode-on-the-60-image-set-bl65-2026-11-26): `high` mode coloured backdrops on 60 images
- [Flat coloured backdrops at 600 px (BL70, 2026-11-27)](#flat-coloured-backdrops-at-600-px-bl70-2026-11-27): coloured-backdrop chroma noise at 600 px input
- [Greyscale photos (BL72, 2026-11-27)](#greyscale-photos-bl72-2026-11-27): real photos turned grey: does `fast` keep R = G = B?
- [White backdrops (BL74, 2026-11-27)](#white-backdrops-bl74-2026-11-27): does `fast` keep a pure white (255) backdrop at 255?
- [Sizes between 400 and 800 (BL75, 2026-11-27)](#sizes-between-400-and-800-bl75-2026-11-27): `fast` against Lanczos at 500, 600 and 700 px input
- [Summary: flat coloured backdrops (BL66, 2026-11-26)](#summary-flat-coloured-backdrops-bl66-2026-11-26): one table of every coloured-backdrop condition; start here for coloured backdrops

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
- **Reading:** the step changes about half of all pixels (it reaches every pixel with spread of 4 or less, in smooth areas of any colour, not only backdrops), and on those pixels the grey mean is on average further from the ground truth than the model output was, although whole-image PSNR barely moves (-0.012 dB) because the errors involved are small (about 1.5 levels per channel). The ground truth is mostly near-neutral where the step acts (spread of T or less for 96-98% of the changed pixels), but it is not exactly grey, so the exact mean is further from it than the model output was. This is a measurement of error, not a visual judgement.
- **Limits:** `fast` only, 400 px input only, T = 2, 3 and 4, 20 images, JPEG q85; pixels the step leaves unchanged are not scored here.

### Grey-preserving step on the 60-image set (BL56, 2026-11-26)

Question: the BL51, BL53 and BL55 figures come from the 20 images of `bench/out/sub20`. Do they hold on the 60 images of `bench/out/set`? `bench/fetch_testset.sh` builds `bench/out/sub20` from `bench/out/set` (every third image of each source), so the 60 contain the 20. Same script and options as before (`node bench/grey-step.js --dir bench/out/set --changed`, about 2 min, and `--size 800`, about 3 min), `fast`, T = 2, 3, 4, JPEG q85.

400 px input, output 1000 px: 29 of 60 images have a neutral region (888 blocks; sub20: 12 of 20, 317 blocks).

| method | PSNR | SSIM | GMSD | mean spread (neutral blocks) | share of pixels with spread >= 3 (%) |
|---|---|---|---|---|---|
| Lanczos | 28.71 | 0.8826 | 0.1315 | 0.67 | 0.18 |
| `fast` (no step) | 31.02 | 0.9006 | 0.1114 | 1.87 | 27.27 |
| `fast` + step T=2 | 31.01 | 0.9005 | 0.1114 | 0.95 | 27.27 |
| `fast` + step T=3 | 31.01 | 0.9005 | 0.1114 | 0.46 | 10.94 |
| `fast` + step T=4 | 31.02 | 0.9005 | 0.1113 | 0.11 | 2.06 |

800 px input, output 1000 px: 44 of 60 images have a neutral region (4016 blocks; sub20: 18 of 20, 1661 blocks).

| method | PSNR | SSIM | GMSD | mean spread (neutral blocks) | share of pixels with spread >= 3 (%) |
|---|---|---|---|---|---|
| Lanczos | 30.38 | 0.9293 | 0.0895 | 0.65 | 0.26 |
| `fast` (no step) | 36.53 | 0.9624 | 0.0460 | 1.75 | 24.01 |
| `fast` + step T=2 | 36.48 | 0.9623 | 0.0461 | 0.80 | 24.01 |
| `fast` + step T=3 | 36.50 | 0.9623 | 0.0461 | 0.31 | 7.51 |
| `fast` + step T=4 | 36.50 | 0.9623 | 0.0461 | 0.02 | 0.45 |

Differences to `fast` (no step), as printed by the script:

- **T=2 at 400 px:** PSNR -0.015, SSIM -0.00011, GMSD -0.00002: passes the quality gate. Share 27.09 points above Lanczos: not within 1 point.
- **T=3 at 400 px:** PSNR -0.009, SSIM -0.00013, GMSD -0.00003: passes the quality gate. 10.76 points above Lanczos: not within 1 point.
- **T=4 at 400 px:** PSNR -0.007, SSIM -0.00015, GMSD -0.00003: passes the quality gate. 1.88 points above Lanczos: not within 1 point.
- **T=2 at 800 px:** PSNR -0.052, SSIM -0.00005, GMSD +0.00002: fails the quality gate. 23.75 points above Lanczos: not within 1 point.
- **T=3 at 800 px:** PSNR -0.036, SSIM -0.00007, GMSD +0.00002: fails the quality gate. 7.24 points above Lanczos: not within 1 point.
- **T=4 at 800 px:** PSNR -0.031, SSIM -0.00009, GMSD +0.00004: fails the quality gate. 0.19 points above Lanczos: within 1 point.

What the step changes (`--changed`, 400 px input, 60 images):

| T | pixels changed (% of all) | of those: ground truth spread > T (%) | mean abs error before | mean abs error after |
|---|---|---|---|---|
| 2 | 56.21 | 1.78 | 1.168 | 1.440 |
| 3 | 59.36 | 2.24 | 1.395 | 1.654 |
| 4 | 61.68 | 2.90 | 1.601 | 1.856 |

- **T=4 on the 60 images:** the step passes the gate at 400 px (PSNR -0.007 dB) and fails it at 800 px (PSNR -0.031 dB against a limit of 0.02), the same pass/fail at both sizes as on sub20 (agree: yes). The step changes 61.68% of all output pixels; it does not move them closer to the ground truth on average (mean absolute error 1.601 before, 1.856 after), and 2.90% of the changed pixels had a real tint (spread above 4) in the ground truth (sub20: 54.49%, 3.48%).
- **Where the 60 images differ from sub20:** the share of spread >= 3 in neutral backdrops is larger without the step (27.27% at 400 px against 16.32%; 24.01% at 800 px against 17.82%), and at 400 px T=4 leaves 2.06% instead of 0.22%, so it is **not** within 1 point of Lanczos on the 60 images (it is at 800 px). The gate result does not depend on which of the two sets is used.
- **Limits:** `fast` only, T = 2, 3 and 4, JPEG q85, no visual judgement; the 60 images contain the 20, so the two sets are not independent.

### Neutral backdrops by JPEG quality (BL57, 2026-11-26)

Question: every neutral-backdrop figure above builds its input with JPEG q85 (`bench/groundtruth.js`, `bench/neutral-real.js`). JPEG noise is itself colour noise, so does the `fast` share of spread >= 3 depend on the input's JPEG quality? `node bench/neutral-real.js --jpeg <q>` (new option `--jpeg 50..100`, default 85, output unchanged without it) on `bench/out/sub20`, 400 px input, `fast`, the shipped pipeline, CPU. The near-neutral blocks are found on the decoded input, so the set of blocks changes with the quality (the shares below are over different pixels).

| JPEG quality | images with a region | blocks found | `fast` share of spread >= 3 (%) | Lanczos share (%) | `fast` mean spread |
|---|---|---|---|---|---|
| q60 | 11 | 237 | 8.36 | 0.26 | 1.49 |
| q85 | 12 | 317 | 16.32 | 0.17 | 1.60 |
| q95 | 10 | 310 | 12.60 | 0.10 | 1.42 |

- **Result:** between q60 and q95 the `fast` share changes by 4.24 points (8.36% and 12.60%): not more than 5 points (no). The share is above Lanczos's (0.26% and 0.10%) at every quality, so the effect is present at every quality tried; the share is not monotonic in the quality either (q85, the quality used elsewhere, has the highest share, 16.32%, equal to the BL46 figure).
- **Reading:** the share moves by a factor of two with the quality, and the blocks differ between the runs (why the share is lowest at q60 and not highest was not investigated), so the figures say the effect exists at q60 to q95, not how large it is for a given photo.
- **Limits:** `fast` only, 400 px input only, three qualities, 20 images, no visual judgement.

### Flat coloured backdrops (BL58, 2026-11-26)

Question: BL46 to BL57 only look at near-neutral backdrops (flat saturated colours were measured on synthetic images only, "Flat saturated colours" above). Does `fast` also add chroma noise to flat **coloured** backdrops of real photos? `node bench/chroma-real.js` (new script; `--dir`, `--limit`, `--size` as `bench/neutral-real.js`) on `bench/out/sub20`, 400 px input, JPEG q85, the shipped `fast` pipeline on CPU. Flat coloured blocks of the input: 16x16 blocks on the grid and edge rule of `neutral-real.js`, mean channel spread (max - min of R, G, B) of at least 20, no channel of any pixel more than 6 levels from the block mean of that channel, luma standard deviation between 0.5 and 8. Chroma noise of an output box: the population standard deviation of R-G and of B-G inside the box (levels), averaged over all blocks.

7 of 20 images have such a block (59 blocks; no region: the other 13).

| method | blocks | mean sd of R-G | mean sd of B-G |
|---|---|---|---|
| `fast` | 59 | 0.85 | 0.83 |
| Lanczos | 59 | 0.38 | 0.38 |

- **Result:** `fast` chroma noise on flat coloured backdrops is at least twice Lanczos's (yes): 0.85 against 0.38 in R-G and 0.83 against 0.38 in B-G (2.25x and 2.20x); 7 of the 20 images have such a block.
- **Reading:** the model adds chroma noise on coloured backdrops too, with a standard deviation 0.4 to 0.5 levels above Lanczos's, so the effect is not limited to grey. The figure is a standard deviation of colour differences, not the channel spread used for the neutral backdrops, so the two are not comparable in size; whether 0.4 to 0.5 levels is visible was not judged. Option (b) of row 13, as tried in BL51 to BL56, acts only on pixels with a channel spread of 4 or less and does not touch these backdrops (by its rule, not measured here: their mean channel spread is at least 20).
- **Limits:** `fast` only, 400 px input only, 59 blocks in 7 images (the same backdrop contributes many blocks; the 60-image set gives a different yes/no answer, see "Flat coloured backdrops on the 60-image set"), JPEG q85, no visual judgement. The block rule is one choice among several; a coloured backdrop with a gradient or texture is not covered.

### Region-limited grey-preserving step (BL59, 2026-11-26)

Question: the whole-image step of BL51 to BL56 fails the PSNR gate at 800 px and flattens pixels everywhere. Does a step limited to flat neutral regions pass the gate at both sizes? `node bench/grey-step.js --region` (new switch, output unchanged without it) changes a pixel to its channel mean only when the 5x5 window around it in the unmodified `fast` output (clamped at the border) has a largest channel spread of at most T and a luma range (Rec. 601, max - min) of at most 12 levels. The window size and the luma range were chosen once and not tuned on these images. `bench/out/sub20`, `fast`, CPU, JPEG q85; about 25 s at 400 px and 30 s at 800 px.

400 px input, output 1000 px (12 of 20 images with a neutral region, 317 blocks):

| method | PSNR | SSIM | GMSD | mean spread (neutral blocks) | share of pixels with spread >= 3 (%) |
|---|---|---|---|---|---|
| Lanczos | 28.97 | 0.8785 | 0.1271 | 0.64 | 0.17 |
| `fast` (no step) | 31.51 | 0.8941 | 0.1076 | 1.60 | 16.32 |
| `fast` + region step T=2 | 31.49 | 0.8941 | 0.1076 | 1.02 | 16.32 |
| `fast` + region step T=3 | 31.50 | 0.8940 | 0.1076 | 0.43 | 10.66 |
| `fast` + region step T=4 | 31.50 | 0.8940 | 0.1076 | 0.11 | 2.74 |

800 px input, output 1000 px (18 of 20 images, 1661 blocks):

| method | PSNR | SSIM | GMSD | mean spread (neutral blocks) | share of pixels with spread >= 3 (%) |
|---|---|---|---|---|---|
| Lanczos | 30.44 | 0.9226 | 0.0875 | 0.71 | 0.17 |
| `fast` (no step) | 36.28 | 0.9543 | 0.0492 | 1.65 | 17.82 |
| `fast` + region step T=2 | 36.24 | 0.9543 | 0.0492 | 0.97 | 17.82 |
| `fast` + region step T=3 | 36.24 | 0.9543 | 0.0492 | 0.49 | 12.80 |
| `fast` + region step T=4 | 36.24 | 0.9542 | 0.0492 | 0.11 | 2.50 |

Differences to `fast` (no step), as printed by the script:

- **T=2 at 400 px:** PSNR -0.016, SSIM -0.00004, GMSD -0.00001: passes the quality gate. 16.15 points above Lanczos: not within 1 point.
- **T=3 at 400 px:** PSNR -0.015, SSIM -0.00008, GMSD -0.00001: passes the quality gate. 10.49 points above Lanczos: not within 1 point.
- **T=4 at 400 px:** PSNR -0.013, SSIM -0.00010, GMSD -0.00002: passes the quality gate. 2.57 points above Lanczos: not within 1 point.
- **T=2 at 800 px:** PSNR -0.046, SSIM -0.00002, GMSD 0.00000: fails the quality gate. 17.64 points above Lanczos: not within 1 point.
- **T=3 at 800 px:** PSNR -0.044, SSIM -0.00004, GMSD -0.00001: fails the quality gate. 12.63 points above Lanczos: not within 1 point.
- **T=4 at 800 px:** PSNR -0.042, SSIM -0.00006, GMSD -0.00000: fails the quality gate. 2.33 points above Lanczos: not within 1 point.
- **Result for T=4:** the region-limited step passes the gate at 400 px (PSNR -0.013 dB) and fails it at 800 px (PSNR -0.042 dB against a limit of 0.02), so it does not pass at both sizes (as the whole-image step, -0.035 dB at 800 px, BL53). The share of spread >= 3 in neutral backdrops is not within 1 point of Lanczos's at either size (2.74% at 400 px, 2.50% at 800 px, against 0.17%), where the whole-image T=4 step reached 0.22% and 0.18%.
- **Reading:** limiting the step to flat regions did not buy the gate at 800 px (the PSNR drop is slightly larger than for the whole-image step: -0.042 against -0.035 dB) and it removes less of the noise: isolated pixels with a spread of 6 to 8 put their whole 5x5 window outside the limit, so the pixels around them stay noisy. A smaller or larger window, or a luma range other than 12, was not tried.
- **Limits:** `fast` only, T = 2, 3 and 4, one window and one luma range, 20 images, JPEG q85, no visual judgement. The 60-image set was not run.

### Flat coloured backdrops on the 60-image set (BL61, 2026-11-26)

Question: the 20-image answer (previous subsection) rests on 7 images with a flat coloured block. `bench/out/set` has 60 images and contains the 20. `node bench/chroma-real.js --dir bench/out/set` (about 1 min, no `--limit`): same script, block rule and statistic, 400 px input, JPEG q85, `fast`, CPU.

15 of 60 images have such a block (176 blocks; sub20: 7 of 20, 59 blocks).

| method | blocks | mean sd of R-G | mean sd of B-G |
|---|---|---|---|
| `fast` | 176 | 0.94 | 1.11 |
| Lanczos | 176 | 0.49 | 0.70 |

- **Result:** on the 60 images `fast` chroma noise is **not** at least twice Lanczos's (no): 0.94 against 0.49 in R-G (1.91x) and 1.11 against 0.70 in B-G (1.58x). The yes/no answer therefore differs from the 20-image one (yes, 2.25x and 2.20x); the excess over Lanczos in levels is about the same (0.45 and 0.41 on the 60 images, 0.47 and 0.45 on the 20), so the Lanczos noise is likely larger on the 40 extra images (their figures were not reported separately), and the ratio falls.
- **Reading:** `fast` has more chroma noise than Lanczos on flat coloured backdrops in both sets, by about 0.4 to 0.5 levels of standard deviation; whether that is "twice" depends on which images are in the set, so the factor of two is not a stable figure and the excess in levels is the better summary. Visibility was not judged.
- **Limits:** `fast` only, 400 px input only, 176 blocks in 15 images (the same backdrop contributes many blocks), JPEG q85; the 60 images contain the 20, so the two sets are not independent.

### Flat coloured backdrops by size and JPEG quality (BL60, 2026-11-26)

Question: BL58 measured flat coloured backdrops at 400 px input and JPEG q85 only, and BL57 showed that the neutral-backdrop effect depends on JPEG quality. `node bench/chroma-real.js` with the new `--jpeg 50..100` switch (default 85, output unchanged without it; the first output line ends with `; input JPEG q<N>` otherwise), same block rule and statistic as BL58, `bench/out/sub20`, `fast`, CPU.

| input | images with a block | blocks | `fast` sd R-G | `fast` sd B-G | Lanczos sd R-G | Lanczos sd B-G | ratio R-G | ratio B-G |
|---|---|---|---|---|---|---|---|---|
| 400 px q60 | 8 | 110 | 0.92 | 0.92 | 0.36 | 0.34 | 2.54x | 2.70x |
| 400 px q85 (BL58) | 7 | 59 | 0.85 | 0.83 | 0.38 | 0.38 | 2.25x | 2.20x |
| 400 px q95 | 6 | 38 | 0.91 | 0.95 | 0.76 | 0.83 | 1.20x | 1.15x |
| 800 px q85 | 13 | 537 | 0.91 | 0.89 | 0.60 | 0.61 | 1.51x | 1.45x |

- **Result:** the `fast` chroma noise is not at least twice Lanczos's in all four rows (no): it is at 400 px q60 (2.54x and 2.70x) and q85 (2.25x and 2.20x), and it is not at 400 px q95 (1.20x and 1.15x) nor at 800 px q85 (1.51x and 1.45x).
- **Reading:** `fast` noise is about 0.9 levels in every row (0.83 to 0.95); what changes is Lanczos's own noise (0.34 to 0.83), which is higher at q95 and at 800 px, so the ratio falls while the excess over Lanczos in levels shrinks too: 0.56 / 0.58 (q60), 0.47 / 0.45 (q85), 0.15 / 0.12 (q95), 0.31 / 0.28 (800 px). The factor of two is not a stable figure (see also the 60-image set above); the block sets differ between rows (6 to 13 images), so the rows are not paired. Visibility was not judged.
- **Limits:** `fast` only, sub20 only, 400 px for the two JPEG rows and q85 for the size row (no 800 px with another quality), blocks from the same backdrop count separately, no visual judgement. The 60-image set gives the same order of rows but a different yes/no at q85: see "Flat coloured backdrops by size and JPEG quality on the 60-image set".

### Flat coloured backdrops by size and JPEG quality on the 60-image set (BL62, 2026-11-26)

Question: the four rows of the BL60 section rest on 6 to 13 images of sub20. Does the pattern (ratio of `fast` to Lanczos falls at q95 and at 800 px) hold on the 60 images of `bench/out/set` (which contain sub20)? `node bench/chroma-real.js --dir bench/out/set` with `--jpeg 60`, `--jpeg 95` and `--size 800` (about 25 s, 15 s and 70 s, no `--limit`); the q85 row is the full run of the BL61 section above. Same block rule and statistic as BL58, `fast`, CPU.

| input | images with a block | blocks | `fast` sd R-G | `fast` sd B-G | Lanczos sd R-G | Lanczos sd B-G | ratio R-G | ratio B-G |
|---|---|---|---|---|---|---|---|---|
| 400 px q60 | 16 | 255 | 0.97 | 1.05 | 0.43 | 0.47 | 2.24x | 2.24x |
| 400 px q85 (BL61) | 15 | 176 | 0.94 | 1.11 | 0.49 | 0.70 | 1.91x | 1.58x |
| 400 px q95 | 13 | 124 | 1.02 | 1.15 | 0.73 | 0.93 | 1.40x | 1.24x |
| 800 px q85 | 29 | 1280 | 0.93 | 0.98 | 0.58 | 0.68 | 1.59x | 1.45x |

- **Result:** the `fast` chroma noise is at least twice Lanczos's in the 400 px q60 row only (yes) and not in the q85, q95 and 800 px rows (no for each; 1.91x / 1.58x, 1.40x / 1.24x, 1.59x / 1.45x). On sub20 (BL60) the q60 and q85 rows reached twice; here q85 does not (the BL61 result). The order of the rows by ratio, highest first, is q60, q85, 800 px, q95 in both R-G and B-G, the same as in BL60 (yes).
- **Reading:** the pattern holds: the ratio is highest at q60 and lowest at q95, with 800 px between q85 and q95. `fast` noise is again about 1 level in every row (0.93 to 1.15) while Lanczos's own noise varies (0.43 to 0.93), so the excess over Lanczos in levels is the more stable figure: 0.54 / 0.58 (q60), 0.45 / 0.41 (q85), 0.29 / 0.22 (q95), 0.35 / 0.30 (800 px), all positive. Visibility was not judged.
- **Limits:** `fast` only; 400 px for the two JPEG rows and q85 for the size row; the 60 images contain the 20, so this set and sub20 are not independent; blocks from the same backdrop count separately; the images with a block differ between rows (13 to 29), so the rows are not paired; no visual judgement.

### Flat coloured backdrops in `high` mode (BL64, 2026-11-26)

Question: BL58 to BL62 measured `fast` only. `high` (Remacri, used on a GPU) may add less or more chroma noise on flat coloured backdrops; BL49 did this check for neutral backdrops. `PUSHUP_DEVICE=cpu node bench/chroma-real.js --quality high` (new switch, default `fast`, output unchanged without it; the first output line ends with `; quality high`), same block rule and statistic as BL58, `bench/out/sub20`, 400 px input, JPEG q85, no `--limit` (7 images with a block, 59 blocks, about 2 min on this CPU). The `fast` and Lanczos rows are the BL58 run (the same blocks).

| method | blocks | mean sd of R-G | mean sd of B-G |
|---|---|---|---|
| `fast` | 59 | 0.85 | 0.83 |
| `high` | 59 | 0.71 | 0.61 |
| Lanczos | 59 | 0.38 | 0.38 |

- **Result:** the `high` chroma noise is lower than `fast`'s in both channel pairs (yes): 0.71 against 0.85 in R-G and 0.61 against 0.83 in B-G; and it is not at least twice Lanczos's (no): 1.87x in R-G and 1.62x in B-G (`fast`: 2.25x and 2.20x).
- **Reading:** `high` adds less chroma noise than `fast` on coloured backdrops but still more than Lanczos: the excess over Lanczos is 0.33 and 0.23 levels (`fast`: 0.47 and 0.45). Whether that is visible was not judged; `high` is used on a GPU by default, and on a CPU only when `PUSHUP_QUALITY=high` is set, and this run is the CPU path of that mode.
- **Limits:** `high` on CPU only (a GPU provider may give slightly different numbers), 400 px input only, sub20 only (the 60-image set is in the section "Flat coloured backdrops in `high` mode on the 60-image set (BL65)" below), 59 blocks in 7 images (the same backdrop contributes many blocks), JPEG q85, no visual judgement.

### Flat coloured backdrops in `high` mode on the 60-image set (BL65, 2026-11-26)

Question: BL64 measured `high` on 7 images of sub20 (59 blocks). BL61 showed that the 60-image answer can differ from the 20-image one, so do BL64's answers hold on the 60 images? `PUSHUP_DEVICE=cpu node bench/chroma-real.js --dir bench/out/set --quality high` (no `--limit`, about 3.5 min on this CPU), same block rule and statistic as BL58, 400 px input, JPEG q85. The `fast` and Lanczos rows are the BL61 run (the same 15 images and 176 blocks).

| method | images with a block | blocks | mean sd of R-G | mean sd of B-G |
|---|---|---|---|---|
| `fast` | 15 | 176 | 0.94 | 1.11 |
| `high` | 15 | 176 | 0.74 | 0.85 |
| Lanczos | 15 | 176 | 0.49 | 0.70 |

- **Result:** the `high` chroma noise is lower than `fast`'s in both channel pairs (yes): 0.74 against 0.94 in R-G and 0.85 against 1.11 in B-G; and it is not at least twice Lanczos's (no): 1.51x in R-G and 1.21x in B-G (`fast`: 1.91x and 1.58x). Both answers agree with BL64's (yes: lower than `fast`, yes in BL64 too; not twice Lanczos's, no in BL64 too).
- **Reading:** the excess over Lanczos is 0.25 and 0.15 levels (`fast`: 0.45 and 0.41); on sub20 it was 0.33 and 0.23 (`fast`: 0.47 and 0.45).
- **Limits:** `high` on CPU only, 400 px input only, JPEG q85, no visual judgement.

### Flat coloured backdrops at 600 px (BL70, 2026-11-27)

Question: BL60 and BL62 measured `fast` at 400 px (q60, q85, q95) and at 800 px (q85); the README's input range is 400 to 800 px, so is the ratio of `fast` chroma noise to Lanczos's at 600 px between its 400 px q85 and 800 px q85 values? `node bench/chroma-real.js --size 600` on `bench/out/sub20` (17 s) and `node bench/chroma-real.js --dir bench/out/set --size 600` (29 s), no `--limit`, same block rule and statistic as BL58, `fast`, CPU, JPEG q85.

| input | images with a block | blocks | `fast` sd R-G | `fast` sd B-G | Lanczos sd R-G | Lanczos sd B-G | ratio R-G | ratio B-G |
|---|---|---|---|---|---|---|---|---|
| sub20, 600 px q85 | 12 | 216 | 0.91 | 0.85 | 0.54 | 0.45 | 1.67x | 1.88x |
| 60 images, 600 px q85 | 22 | 570 | 0.94 | 1.00 | 0.54 | 0.61 | 1.74x | 1.64x |

- **Result:** compared with the ratios printed in the BL60 table (sub20: 2.25x and 2.20x at 400 px q85, 1.51x and 1.45x at 800 px) and the BL62 table (60 images: 1.91x and 1.58x at 400 px, 1.59x and 1.45x at 800 px), the 600 px ratio is between the two in both channel pairs on sub20 (yes: 1.67x and 1.88x) and in R-G but not in B-G on the 60 images (R-G yes, 1.74x; B-G no, 1.64x, above the 400 px value 1.58x). It is not at least twice Lanczos's in any of the four figures.
- **Reading:** the excess over Lanczos in levels at 600 px is 0.37 and 0.40 (sub20) and 0.40 and 0.39 (60 images), which lies in the range of the other `fast` rows (0.12 to 0.58): the dependence on input size is weak next to the dependence on JPEG quality, and the 60-image B-G ratio shows that it is not monotonic. Visibility was not judged.
- **Limits:** `fast` only, JPEG q85 only, blocks from the same backdrop count separately, the 60 images contain the 20, the images with a block differ between rows (12 to 29), no visual judgement.

### Greyscale photos (BL72, 2026-11-27)

Question: BL43 (synthetic greys) and BL46 (grey backdrops inside colour photos) measure neutrality, but a black-and-white product photo, where R = G = B holds for every pixel and any colour is visible, is a separate case. Does `fast` keep it neutral? `node bench/greyscale-real.js` (CPU, about 13 s) and `node bench/greyscale-real.js --size 800` (about 42 s) on the 20 images of `bench/out/sub20`: each image becomes its Rec. 601 luma in all three channels (the 1000 px reference), is cubic-downscaled to 400 or 800 px, JPEG q85 round-tripped, and made exactly neutral again by taking the luma of the decoded image (so R = G = B in every input pixel); the shipped `fast` pipeline and plain Lanczos then upscale it to 1000 px. Spread = max(R,G,B) - min(R,G,B) per output pixel, over all pixels more than 16 px from every edge.

| input | method | pixels | mean spread | 99th percentile spread | share of pixels with spread >= 3 (%) | largest spread |
|---|---|---|---|---|---|---|
| 400 px | `fast` | 15138552 | 1.35 | 5 | 8.60 | 62 |
| 400 px | Lanczos | 15138552 | 0.00 | 0 | 0.00 | 0 |
| 800 px | `fast` | 15135648 | 1.27 | 4 | 6.11 | 61 |
| 800 px | Lanczos | 15135648 | 0.00 | 0 | 0.00 | 0 |

- **Result:** the share of pixels with spread >= 3 in the `fast` output is 8.60% at 400 px and 6.11% at 800 px against 0.00% for Lanczos (which keeps R = G = B exactly), so more than 1 point above Lanczos: yes at both sizes. The mean spread is 1.35 and 1.27 levels, the 99th percentile 5 and 4, and the largest spread seen is 62 and 61 levels.
- **Reading:** the model adds colour to a photo that has none: about one output pixel in twelve at 400 px and one in sixteen at 800 px, a smaller share than in the grey backdrops of colour photos (16.3% at 400 px, 17.8% at 800 px: BL46 and BL48; a different population, flat blocks of colour photos, so only loosely comparable). Because the input is exactly neutral, a grey-preserving step restricted to such inputs (output made neutral when the input is exactly R = G = B) would remove it, and would not flatten genuine slight tints as the whole-image step of BL51 to BL56 does, but its effect on the quality metrics was not measured; this is a note for the owner (row 13), not a change. The largest spreads (above 60 levels) were not located; they are single pixels among 15 million.
- **Limits:** `fast` only, JPEG q85 only, sub20 only (20 images, converted to grey by luma, not photographed in black and white), 400 and 800 px, no visual judgement, spreads away from the 16 px border only.

### White backdrops (BL74, 2026-11-27)

Question: white-background packshots are the most common e-commerce upload; do flat 255 areas stay exactly 255 through `fast`? `node bench/white.js` (CPU, about 30 s) and `node bench/white.js --size 800` on the 20 images of `bench/out/sub20`: each 1000 px reference is cubic-downscaled to 400 or 800 px and JPEG q85 round-tripped, then the near-white region connected to the image border (4-connected flood fill from the border over pixels with R, G and B all >= 245, on the decoded input) is set to exactly 255, as on a packshot with a pure white page background. Images whose region covers under 20% of the frame are skipped (4 of 20 at both sizes). The shipped `fast` pipeline and plain Lanczos then upscale to 1000 px. Counted are the output pixels whose source input pixel lies inside the region eroded by 4 input pixels (so product edges are excluded). The flood fill runs on the decoded input, not on the 1000 px reference, so that the mask and the erosion are at input resolution.

| input | method | images used | pixels | share exactly 255 (%) | share 255 in R / G / B (%) | share >= 252 (%) | lowest channel value | mean luma deficit (255 - luma) |
|---|---|---|---|---|---|---|---|---|
| 400 px | `fast` | 16 | 6202585 | 0.00 | 0.00 / 0.00 / 99.92 | 100.00 | 253 | 0.886 |
| 400 px | Lanczos | 16 | 6202585 | 100.00 | 100.00 / 100.00 / 100.00 | 100.00 | 255 | 0.000 |
| 800 px | `fast` | 16 | 6785611 | 0.00 | 0.00 / 0.00 / 99.98 | 100.00 | 253 | 0.886 |
| 800 px | Lanczos | 16 | 6785611 | 100.00 | 100.00 / 100.00 / 100.00 | 100.00 | 255 | 0.000 |

- **Result:** the share of exactly 255 (all three channels) in the `fast` output is 0.00% at both sizes against 100.00% for Lanczos, so more than 1 point below Lanczos: yes at both sizes (100 points). Per channel the picture is not a grey 254: R and G are never 255 (0.00%), while B stays 255 in 99.92% (400 px) and 99.98% (800 px) of the counted pixels. The output is about (254, 254, 255): the mean luma deficit of 0.886 equals the R and G weights of Rec. 601 (0.299 + 0.587) times one level; no channel is below 253 and every counted pixel is within 3 levels of 255 (share >= 252: 100.00%).
- **Reading:** the model lowers R and G of a flat area by one level and leaves B alone, a one-level shift toward yellow, not a neutral grey. A one-off check (not part of the script; `upscale` at `fast`, CPU, a uniform 400 x 300 image at factor 2.5, every byte counted per channel): input 255 gives R = 254 in 749153 of 750000 pixels (255 in 4), G = 254 in 748803 (255 in 300) and B = 255 in 749862 (254 in 125); input 240 gives R = 239 in 747506, G = 239 in 747357 and B = 240 in 747759. So this is a property of the model for flat input, not an effect of JPEG or of the mask. Whether a viewer can see a (254, 254, 255) backdrop on a page whose background is exactly (255, 255, 255) was not judged. A white-snap step (pixels >= 252 in all channels whose 5 x 5 neighbourhood is also >= 252 become 255) would remove it; it was not built and not measured against the quality gate. This is a note for the owner (row 13), not a change.
- **Limits:** `fast` only, JPEG q85 only, sub20 only (16 images with a white border region; the backdrop is made exactly 255 by the script, real uploads may carry 250 to 254 whites), 400 and 800 px, no visual judgement.

### Sizes between 400 and 800 (BL75, 2026-11-27)

Question: the benchmark tables and the quality gate use input sizes 400 and 800 px (output 1000 px, factors 2.5 and 1.25); callers send anything from 400 to 800 px. Does the shipped `fast` pipeline (whole image, 20 % Lanczos mix) still beat plain Lanczos in between? Command: `PUSHUP_QUALITY=fast PUSHUP_DEVICE=cpu node bench/bench.js bench/out/sub20 --sizes 500,600,700 --methods lanczos,sr-full` (20 images, input = the 1000 px reference downscaled and JPEG q85 as in every `bench.js` run; about 2 minutes on 4 vCPU). `sr-full` is the shipped `fast` pipeline of `bench/method.js` (default mix 0.2).

| input | method | PSNR | SSIM | GMSD | ms |
|---|---|---|---|---|---|
| 500 px | lanczos | 29.77 | 0.8939 | 0.1112 | 30 |
| 500 px | sr-full | 33.13 | 0.9124 | 0.0911 | 981 |
| 600 px | lanczos | 30.53 | 0.9115 | 0.0951 | 33 |
| 600 px | sr-full | 34.05 | 0.9298 | 0.0750 | 1354 |
| 700 px | lanczos | 30.53 | 0.9171 | 0.0906 | 30 |
| 700 px | sr-full | 35.12 | 0.9436 | 0.0608 | 1784 |

- **Result:** `fast` beats Lanczos on PSNR, SSIM and GMSD at each of the three sizes: yes. The differences (`sr-full` minus lanczos) are PSNR +3.36, +3.52, +4.59 dB, SSIM +0.0185, +0.0183, +0.0265 and GMSD -0.0201, -0.0201, -0.0298 (lower GMSD is better) at 500, 600 and 700 px. This is a comparison with Lanczos, not the main-versus-change gate of `docs/OVERNIGHT_RUN.md` section 2.
- **Reading:** the margin over Lanczos does not shrink towards the middle of the range; no size needs an owner-decision row (no size-dependent mix is proposed). The `ms` column is the mean time of the method call on this machine, indicative only.
- **Limits:** `fast` only, JPEG q85 only, sub20 only (20 images), one run, three sizes, no visual judgement; 400 and 800 px are in the other tables of the project.

### Summary: flat coloured backdrops (BL66, 2026-11-26)

One table of every condition measured on flat coloured backdrops (BL58 to BL70). Images, blocks and sd cells are copied from the table of the section named in the last column (the q85 rows of BL60 and BL62 carry the same figures as BL58 and BL61; the 600 px rows come from the BL70 table; the `high` rows come from BL64 and BL65; BL64's images cell is the "7 images with a block" of its text). The ratio and excess columns are computed from the rounded sd cells (ratio to two decimals, excess = model sd minus Lanczos sd to two decimals), so a ratio may differ by up to 0.02 from the one printed in its own section.

| set, input | model | images with a block | blocks | model sd R-G | model sd B-G | Lanczos sd R-G | Lanczos sd B-G | ratio R-G | ratio B-G | excess R-G | excess B-G | source |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sub20, 400 px q60 | `fast` | 8 | 110 | 0.92 | 0.92 | 0.36 | 0.34 | 2.56x | 2.71x | 0.56 | 0.58 | BL60 |
| sub20, 400 px q85 | `fast` | 7 | 59 | 0.85 | 0.83 | 0.38 | 0.38 | 2.24x | 2.18x | 0.47 | 0.45 | BL60 |
| sub20, 400 px q95 | `fast` | 6 | 38 | 0.91 | 0.95 | 0.76 | 0.83 | 1.20x | 1.14x | 0.15 | 0.12 | BL60 |
| sub20, 600 px q85 | `fast` | 12 | 216 | 0.91 | 0.85 | 0.54 | 0.45 | 1.69x | 1.89x | 0.37 | 0.40 | BL70 |
| sub20, 800 px q85 | `fast` | 13 | 537 | 0.91 | 0.89 | 0.60 | 0.61 | 1.52x | 1.46x | 0.31 | 0.28 | BL60 |
| 60 images, 400 px q60 | `fast` | 16 | 255 | 0.97 | 1.05 | 0.43 | 0.47 | 2.26x | 2.23x | 0.54 | 0.58 | BL62 |
| 60 images, 400 px q85 | `fast` | 15 | 176 | 0.94 | 1.11 | 0.49 | 0.70 | 1.92x | 1.59x | 0.45 | 0.41 | BL62 |
| 60 images, 400 px q95 | `fast` | 13 | 124 | 1.02 | 1.15 | 0.73 | 0.93 | 1.40x | 1.24x | 0.29 | 0.22 | BL62 |
| 60 images, 600 px q85 | `fast` | 22 | 570 | 0.94 | 1.00 | 0.54 | 0.61 | 1.74x | 1.64x | 0.40 | 0.39 | BL70 |
| 60 images, 800 px q85 | `fast` | 29 | 1280 | 0.93 | 0.98 | 0.58 | 0.68 | 1.60x | 1.44x | 0.35 | 0.30 | BL62 |
| sub20, 400 px q85 | `high` | 7 | 59 | 0.71 | 0.61 | 0.38 | 0.38 | 1.87x | 1.61x | 0.33 | 0.23 | BL64 |
| 60 images, 400 px q85 | `high` | 15 | 176 | 0.74 | 0.85 | 0.49 | 0.70 | 1.51x | 1.21x | 0.25 | 0.15 | BL65 |

- **Excess over Lanczos (`fast` rows):** from 0.12 to 0.58 levels of standard deviation (R-G and B-G together), positive in every row.
- **Ratio of at least 2.00:** 3 of 10 `fast` rows have both ratios at least 2.00 (the `high` rows are not counted).
- **Reading:** the factor of two is not stable across sets, input sizes and JPEG qualities, but the model adds chroma noise in every measured condition; `high` adds less than `fast` (BL64, BL65). Visibility was not judged.
