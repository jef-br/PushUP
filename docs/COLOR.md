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
  (255,0,128) 19, (128,255,0) 19, (0,0,255) 19. In flat saturated blue and magenta only blue moves, down (mean −4 to −6); in green-heavy colours all
  three channels move toward grey (the 255 channel down by 11, the 0 channels up by 10 to 14: a desaturation).
- **Border effect:** the model-only maximum is far larger than the mean shift for blue and magenta, because it sits near the image border. Away from
  the border: (0,0,255) 24 → 4, (128,0,255) 28 → 4, (255,0,128) 24 → 5, (255,0,255) 36 → 6, (0,255,0) 33 → 14, (128,255,0) 24 → 12. So for
  most colours the visible error is a band around the edge of the image, for green a band plus a constant interior shift.
- **What it would take to fix (not implemented):** the border part could be removed by padding the input (mirror) by 16 px before the model and cropping
  the output afterwards; at best the error then drops to the "away from the border" column (blue 24 → 4, magenta 36 → 6, green 33 → 14). That
  is an upper bound from this table, not a measured result; it costs about 19 % more pixels through the model (432×332 vs 400×300, from the sizes, time
  not measured) and changes default output, so it needs a quality-gate run and an owner decision. The interior green shift would need a different model.
- **Limits:** synthetic uniform images (no texture, no gradient), one size, `fast` only; natural photos were not measured, so how visible this is on real
  product images is open.
