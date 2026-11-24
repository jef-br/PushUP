# Does a factor-1 call remove JPEG blocks? (BL42, 2026-11-24)

Question: README "Usage" said that with `upscale_factor` 1.0 "the model still runs, so JPEG blocks are removed". No file
measured it. This measures it.

## Method

`node bench/jpeg.js` (needs `bench/out/set`, 60 images from `bench/fetch_testset.sh`; `fast` mode, CPU, about 2 min on
4 vCPU). Per image: the set image resized to 1000 px on its longest side (the bench's reference), then to 600 px
(Lanczos3): the **reference**. It is encoded as JPEG at quality 50 and 75 with sharp (libvips, default chroma subsampling)
and decoded: the **input**. `upscale(input, stride, 1)` gives the output (same size). Figures, means over the 60 images:

- **PSNR** (luma) of the decoded JPEG and of the `fast` output, both against the 600 px reference;
- **blockiness** = mean absolute luma step across 8-pixel block borders divided by the mean step inside blocks (both
  directions). It is about 1 for an image without block structure; the reference scores 1.012. Blocks are aligned with the
  image origin in input and output, as the JPEG grid is. "Blockiness change" = output against decoded JPEG.

| JPEG quality | images | PSNR decoded JPEG (dB) | PSNR `fast` output (dB) | blockiness reference | blockiness decoded JPEG | blockiness `fast` output | blockiness change |
|---|---|---|---|---|---|---|---|
| 50 | 60 | 36.65 | 37.39 | 1.012 | 1.325 | 1.107 | -16.5% |
| 75 | 60 | 39.67 | 39.27 | 1.012 | 1.174 | 1.062 | -9.6% |

## Result

**The claim holds in part.** The model makes block borders clearly less visible: the excess over the reference
(blockiness − 1.012) drops from 0.313 to 0.095 at quality 50 (70% of it gone) and from 0.162 to 0.050 at quality 75 (69%).
Plain blockiness falls by 16.5% at quality 50 but only 9.6% at quality 75, because the ratio's floor is about 1. PSNR is a
mixed picture: +0.74 dB at quality 50, but −0.40 dB at quality 75, where the model changes more of the (already good)
picture than it repairs. "JPEG blocks are removed" overstated it, so the README now says block borders become less visible
(about two thirds of the excess contrast gone) and gives the PSNR numbers. Blocks are reduced, not removed; this does not
say how they look to a person. Blockiness alone can also be lowered by blurring: a control on the first 6 images at
quality 50 (decoded JPEG, then a plain Gaussian blur, no model; run by the adversary reviewer, not part of the script)
took blockiness from 1.514 to 1.200 with sigma 0.8, but PSNR from 34.86 to 31.33 dB. The model lowers blockiness
(−17.4% on those 6 images) while PSNR rises (+0.65 dB), which blur does not do; that is why both figures are reported.

Limits: one JPEG encoder and two qualities; synthetic re-compression of the set's own 600 px images, not photos that
were JPEG-compressed by a shop; luma only.
