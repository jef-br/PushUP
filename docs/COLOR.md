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
- **Limits:** 20 images at one input size (400 px), JPEG q85 degradation, one run (the script is deterministic); the reference is itself a
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
  lower than Lanczos. Whole-image and interior rows agree within 0.1 byte.
- **Decision rule of the task** (excess of the `fast` bias over Lanczos above 2 bytes on any channel): the largest excess is 1.11 bytes (red, 800 px;
  600 px: 1.10), so it is not exceeded at any size, no follow-up task is added and nothing changes.
- **Limits:** as above (20 images, JPEG q85 degradation, deterministic script, a bias shared with the reference would not show); three input sizes, not the whole 400–800 px range.
