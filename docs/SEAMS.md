# Tile seams of `high` on real photos (BL71, 2026-11-27)

**Short answer:** in `high` mode the 192 px tiles leave no step you can measure across the tile borders of real photos.
The gradient across a seam is the same as in a whole-image pass (mean ratio tiled minus whole: -0.000), and the tiled and
whole-image outputs differ by 0.058 byte on average next to a seam (0.006 elsewhere), at most 0.129 on any image. The stated
rule ("near difference more than twice the far difference") still says yes, because the far difference is almost zero; see
"Reading" below and row 14 of [OWNER_DECISIONS.md](OWNER_DECISIONS.md).

## Method

`node bench/seams.js` (about 45 s per image on 4 vCPU; `PUSHUP_DEVICE=cpu`): the 20 images of `bench/out/sub20`, inputs built as
in [COLOR.md](COLOR.md) (1000 px reference, cubic down to 400 px, JPEG q85, decoded), factor 1, `high` model (Remacri), no
Lanczos mix, run twice through the internal `_run`: tiled (192 px tiles, 16 px pad, as shipped) and whole image
(`tile: Infinity`). The whole-image run worked for all 20 images. Seams are at input px k × 192, in output px
round(k × 192 × out / in): at 400 px input x = 192 and 384.

- **near diff / far diff:** mean absolute byte difference between the tiled and the whole-image output over the 8 px either
  side of a seam column or row, and over all pixels at least 8 px from every seam.
- **gradient ratio:** on the tiled output, the mean absolute step across a seam line divided by the mean step on the three
  lines either side (1.00 = no seam). The same ratio on the whole-image output (no seams) is the content baseline, because a
  strong edge near a seam line moves the ratio far from 1.00 (the 400x79 image: 0.049 in both).
- Rule of the summary line: seams visible when the mean gradient ratio is above 1.05 or the mean near diff is more than twice the mean far diff.

## Result

| image | output | seams x / y | gradient ratio | ratio, whole image | near diff | far diff |
|---|---|---|---|---|---|---|
| abo_0002b541.png | 400x400 | 2 / 2 | 1.061 | 1.060 | 0.105 | 0.011 |
| abo_002a7de9.png | 324x400 | 1 / 2 | 0.952 | 0.951 | 0.061 | 0.004 |
| abo_005e60bd.png | 342x400 | 1 / 2 | 1.160 | 1.160 | 0.017 | 0.001 |
| abo_007c193f.png | 241x400 | 1 / 2 | 0.986 | 0.985 | 0.111 | 0.012 |
| abo_00a7cd4c.png | 400x289 | 2 / 1 | 0.923 | 0.921 | 0.022 | 0.001 |
| abo_1d441bcb.png | 400x400 | 2 / 2 | 0.999 | 0.999 | 0.107 | 0.010 |
| abo_1d8c3146.png | 400x79 | 2 / 0 | 0.049 | 0.050 | 0.008 | 0.000 |
| abo_1df379d8.png | 336x400 | 1 / 2 | 1.066 | 1.066 | 0.091 | 0.007 |
| abo_6967cb57.png | 400x400 | 2 / 2 | 1.049 | 1.045 | 0.068 | 0.006 |
| abo_69a18908.png | 400x400 | 2 / 2 | 1.011 | 1.011 | 0.129 | 0.020 |
| abo_69e928d0.png | 400x400 | 2 / 2 | 0.814 | 0.813 | 0.003 | 0.000 |
| abo_8d0fd6c9.png | 400x400 | 2 / 2 | 0.849 | 0.851 | 0.017 | 0.002 |
| abo_8d62413d.png | 400x400 | 2 / 2 | 1.018 | 1.026 | 0.046 | 0.007 |
| lamoda_CasualShoes_49495.png | 300x400 | 1 / 2 | 0.970 | 0.975 | 0.019 | 0.001 |
| lamoda_Jeans_39386.png | 300x400 | 1 / 2 | 0.711 | 0.710 | 0.066 | 0.006 |
| lamoda_Shirts_26958.png | 300x400 | 1 / 2 | 1.050 | 1.052 | 0.071 | 0.006 |
| lamoda_Socks_29114.png | 300x400 | 1 / 2 | 1.015 | 1.016 | 0.020 | 0.002 |
| lamoda_SportsShoes_33822.png | 300x400 | 1 / 2 | 1.140 | 1.142 | 0.040 | 0.003 |
| lamoda_Tshirts_11382.png | 300x400 | 1 / 2 | 1.001 | 1.001 | 0.100 | 0.010 |
| lamoda_Tshirts_5095.png | 300x400 | 1 / 2 | 0.992 | 0.990 | 0.061 | 0.004 |

mean gradient ratio 0.941 (20 images); mean near diff 0.058, mean far diff 0.006 (20 images; whole-image run failed for 0); mean of gradient ratio tiled minus whole -0.000
seams visible: yes (gradient ratio above 1.05 or near diff more than twice far diff)

## Reading

- The gradient ratio of the tiled output equals the ratio of the whole-image output in every image to within 0.01 (mean of
  tiled minus whole: -0.000), so tiling adds no step across the seam. The ratios themselves (0.05 to 1.16) come from the image
  content.
- Next to a seam the two passes differ by 0.058 byte on average (0.003 to 0.129 per image) against 0.006 elsewhere. That is the
  10x the rule asks about, but it is a tenth of one grey level; BK1 (`test/tiling.test.js`) found the same on the `fast`
  model (seam mean 0.05 against 0.0002). A near/far ratio cannot be small when the far difference is almost zero, so on its
  own it says little; the absolute size and the gradient ratio decide.
- The verdict line therefore reads "yes" by the rule as the task fixed it, and the figures say the effect is not visible.

Limits: 20 images at 400 px input and JPEG q85 only (600 and 800 px give more seams per image and were not run); seams are
measured against a whole-image pass of the same model, not against a ground truth; CPU only (a GPU pass of the same model may
differ in the last bit).
