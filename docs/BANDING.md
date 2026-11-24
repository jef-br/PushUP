# Banding of soft shadows and backdrop gradients (BL41, 2026-11-24)

Question: e-commerce photos have a white or light backdrop with a soft shadow under the product. Can a
super-resolution model turn a smooth 8-bit gradient into visible steps (banding) or add noise?
[EDGES.md](EDGES.md) covers hard edges and [COLOR.md](COLOR.md) flat colours; nothing covered gradients.

## Method

`node bench/banding.js` (no downloads, `fast` mode, `PUSHUP_DEVICE=cpu`, 4 vCPU). Synthetic grey images, 400×300 and
800×600: a horizontal ramp 255 → 200, a diagonal ramp 255 → 200 and a radial "shadow" (grey 150 in the centre to white
at 120 px), each without noise and with seeded ±1 level noise. Each image goes through the shipped `upscale` at factor 1
and 1.5; the reference is a sharp Lanczos3 resize of the same input to the same output size. Measured on the middle row
of each output, on the gradient only (for the radial shadow: its left half, centre to 120 px out, scaled by the factor):

- **levels:** number of distinct grey values (fewer means coarser steps);
- **longest run:** longest stretch of equal neighbouring values, in px (a wide step shows as a long run);
- **roughness:** mean absolute second difference (0 for a straight ramp; higher means wobble or noise);
- **banded:** `yes` when the model's longest run is longer than Lanczos's (a strict rule: a run one px longer counts).

Model / Lanczos figures:

| size | factor | gradient | noise | out | levels (model/lanczos) | longest run px (model/lanczos) | roughness (model/lanczos) | banded |
|---|---|---|---|---|---|---|---|---|
| 400x300 | 1 | hramp | none | 400x300 | 56/56 | 9/8 | 0.33/0.28 | yes |
| 400x300 | 1.5 | hramp | none | 600x450 | 56/56 | 12/12 | 0.19/0.18 | no |
| 400x300 | 1 | hramp | ±1 | 400x300 | 56/57 | 11/7 | 0.80/1.39 | yes |
| 400x300 | 1.5 | hramp | ±1 | 600x450 | 57/57 | 7/7 | 1.20/1.06 | no |
| 400x300 | 1 | dramp | none | 400x300 | 28/28 | 14/15 | 0.59/0.14 | no |
| 400x300 | 1.5 | dramp | none | 600x450 | 28/28 | 20/23 | 0.44/0.09 | no |
| 400x300 | 1 | dramp | ±1 | 400x300 | 30/30 | 15/10 | 0.72/1.35 | yes |
| 400x300 | 1.5 | dramp | ±1 | 600x450 | 30/29 | 10/10 | 1.27/0.97 | no |
| 400x300 | 1 | radial | none | 400x300 | 89/105 | 3/2 | 0.74/0.25 | yes |
| 400x300 | 1.5 | radial | none | 600x450 | 102/105 | 3/3 | 0.76/0.67 | no |
| 400x300 | 1 | radial | ±1 | 400x300 | 86/79 | 3/3 | 0.86/1.36 | no |
| 400x300 | 1.5 | radial | ±1 | 600x450 | 95/83 | 4/6 | 1.19/1.08 | no |
| 800x600 | 1 | hramp | none | 800x600 | 56/56 | 16/15 | 0.18/0.14 | yes |
| 800x600 | 1.5 | hramp | none | 1000x750 | 56/56 | 19/19 | 0.11/0.11 | no |
| 800x600 | 1 | hramp | ±1 | 800x600 | 56/57 | 19/10 | 0.82/1.36 | yes |
| 800x600 | 1.5 | hramp | ±1 | 1000x750 | 57/57 | 13/9 | 0.93/1.14 | yes |
| 800x600 | 1 | dramp | none | 800x600 | 28/28 | 23/30 | 0.54/0.07 | no |
| 800x600 | 1.5 | dramp | none | 1000x750 | 29/28 | 37/37 | 0.33/0.05 | no |
| 800x600 | 1 | dramp | ±1 | 800x600 | 30/30 | 21/10 | 0.82/1.38 | yes |
| 800x600 | 1.5 | dramp | ±1 | 1000x750 | 31/30 | 13/10 | 0.99/1.12 | yes |
| 800x600 | 1 | radial | none | 800x600 | 89/105 | 3/2 | 0.74/0.25 | yes |
| 800x600 | 1.5 | radial | none | 1000x750 | 69/70 | 3/3 | 0.67/0.39 | no |
| 800x600 | 1 | radial | ±1 | 800x600 | 86/86 | 3/3 | 0.82/1.42 | no |
| 800x600 | 1.5 | radial | ±1 | 1000x750 | 68/65 | 4/5 | 0.98/1.14 | no |


## Result

**The strict rule flags 10 of 24 cases as banded; none looks like a visible step.** The worst case by run length is
800×600 horizontal ramp with ±1 noise at factor 1: longest run 19 px against 10 px for Lanczos (21 against 10 px on
the diagonal ramp). The others are small. On noise-free input the model's longest run is at most 1 px longer than
Lanczos's (9 against 8 px, 16 against 15 px, and 3 against 2 px on the radial shadow); the other 6 flagged rows are ±1
noise cases at factor 1 or 1.5 (11 against 7 px up to 21 against 10 px), where the model flattens the noise into
plateaus about 2× as long as Lanczos's. A plateau of 19–21 px on an 800 px ramp (255 → 200, one level per 14 px on
average) is about one natural step width, not a new step; but the numbers do not prove it is invisible, since
visibility is a judgement, and the ±1 cases are not simply denoising.

Other figures: grey levels differ from Lanczos by at most 3 in 20 of 24 cases (the model has more in some, fewer in
others). The four exceptions are all radial shadows: 89 against 105 (16 fewer, 15%) at factor 1 at both sizes, 86
against 79 (7 more) at 400 px factor 1 with noise, and 95 against 83 (12 more) at 400 px factor 1.5 with noise. On
noise-free input the model's roughness is 0.11–0.76 levels against 0.05–0.67 for Lanczos, always below one grey
level, and equal to or higher than Lanczos's in every noise-free case (up to 4× on the diagonal ramp).

Nothing here is large enough to change `src/` or a default, and no owner decision is needed.

Limits: synthetic grey ramps on one image row, not photographs; shadows with colour or texture are not covered.
