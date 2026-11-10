# Closing the texture gap (T7)

Question: is there a model that gives Claid-like material texture (suede, knit, leather)
without inventing wrong detail, runs on CPU (any speed) and is worth using on a GPU (`high`)?

**Answer: no model tried (five non-generative ONNX models and one diffusion model) closes the gap.** None reaches Claid's dense suede grain. One
candidate, **4x-UltraSharpV2-Lite**, beats the current `high` model (Remacri) on GMSD and
PSNR, is ~1.7x faster on CPU and uses a third of the memory, so it is worth a decision by the
owner (see recommendation). Date: 2026-11-09.

## Candidates

Sources: ONNX files already published on Hugging Face (dynamic height/width, float32 RGB in
[0, 1], opset 17), so no PyTorch was needed. Licenses from OpenModelDB data.

| Model | Arch | ONNX source | Size | License | SHA-256 of the ONNX |
|---|---|---|---|---|---|
| 4x_foolhardy_Remacri (current `high`) | RRDBNet | `models/` | 67 MB | CC BY-NC-SA 4.0 | `models/LICENSES.md` |
| 4xNomosWebPhoto_esrgan | RRDBNet | `nesaorg/4xNomosWebPhoto_esrgan_fp32_opset17` | 67 MB | CC BY 4.0 | `e29f473727ee0e32416d3a2d2642568e0159e2608d67236193772fced8696121` |
| 4x-UltraSharpV2 | DAT2 | `yuvraj108c/ComfyUI-Upscaler-Onnx` | 52 MB | CC BY-NC-SA 4.0 | `6c0201e3403745f39a9aa5273c50ed084cf6c4af5a71a4654c30252cf19bf0a5` |
| 4x-UltraSharpV2_Lite | (Kim2091 "Lite") | `yuvraj108c/ComfyUI-Upscaler-Onnx` | 35 MB | not listed on OpenModelDB; assume same as UltraSharpV2 until checked | `bb8960986aabf060b7da4c769b33b7b23fa092c8a579b3127827571866ad62c3` |
| 4x_UniversalUpscalerV2-Neutral | RRDBNet | `yuvraj108c/ComfyUI-Upscaler-Onnx` | 72 MB | WTFPL | `a0ae860d2e1af9e10d6cdf820d15de72c49d600bc4121b0400d2b96e0808fad0` |
| 4x-ClearRealityV1 | SPAN | `yuvraj108c/ComfyUI-Upscaler-Onnx` | 1.9 MB | CC BY-NC-SA 4.0 | `58381c8df79457670dbb286d36921a044c506eacfe8826bbb6aefc644826f91a` |

Not tested, with the reason:

- **Generative / diffusion:** SeedVR2 (3B/7B, `ByteDance-Seed/SeedVR2-*`) is a video diffusion
  transformer with no ONNX export, so it is out of scope (needs PyTorch). The ONNX diffusion
  upscaler `ssube/stable-diffusion-x4-upscaler-onnx` (text-conditioned SD x4 upscaler, OpenRAIL++
  license, 3.2 GB; SHA-256: UNet graph `643713dc2d33d4b33e06856ec24e76182735adf11f83e9a1e7a5603e5e6361a9`, UNet weights `0ba7199ec011d007a92c0ce4d7de46d9a0c58c2dfb633659b6a0f25738e36260`, VAE `cb02dfea860a2a7488de15ec5230304c4f9fd0fbadff7719b815bb1302aa57e5`, text encoder `5639a57145d95bc63dcfb0266397fcbdf13df42e71135c87908ffd3a7ef43965`) **was run**, see "Diffusion model" below.
- `darktable-org/upscale-realplksr-onnx` (MIT, MSSIM-pretrained, conservative): the ONNX has a
  static 256×256 input, so it needs fixed tiling code. Not run for lack of time; a candidate
  for a follow-up.
- Other community models on that repo (Siax, UltraSharp v1, Remacri, AnimeSharp) were already
  covered by D7 or target anime.

## Results

Speed and memory: the Claid sample (640×428 → 1000 px), CPU, 4 cores, 192 px tiles (the small
SPAN model runs whole), `bench/saas/upscale_model.js`.

Quality: `bench/out/sub20` at 400 px input (20 images, JPEG q85 degradation), CPU,
`bench/bench.js` with `sr:<model>#192@0` (no Lanczos mix for the candidates).
Mode `fast` (shipped default, 20% Lanczos mix) and Lanczos shown for reference.

| Method | PSNR ↑ | SSIM ↑ | GMSD ↓ | mean ms / 400 px image (20 images) |
|---|---|---|---|---|
| Lanczos | 28.97 | 0.8785 | 0.1271 | 28 |
| PushUP `fast` | **31.51** | 0.8941 | 0.1076 | 526 |
| Remacri (`high`) | 31.12 | 0.8994 | 0.1018 | 15 426 |
| **UltraSharpV2_Lite** | 31.25 | 0.8953 | **0.0997** | 9 074 |
| UltraSharpV2 | 30.97 | **0.9000** | 0.1023 | 47 330 |
| UniversalUpscalerV2-Neutral | 30.85 | 0.8848 | 0.1157 | 15 411 |
| NomosWebPhoto_esrgan | 28.49 | 0.8781 | 0.1206 | 15 503 |
| ClearRealityV1 (whole image) | 29.60 | 0.8846 | 0.1142 | 348 |

Single-run speed and peak memory (`bench/saas/upscale_model.js`, one process per run, CPU,
4 cores, 192 px tiles; `fast` measured via `_run` in a fresh process, first call incl. model
load). "sub20" = `abo_0002b541` degraded to 400 px, upscaled to 1000×1000.

| Method | Claid sample: time / peak RSS | sub20 image: time / peak RSS |
|---|---|---|
| PushUP `fast` | 1.2 s / 408 MB | 0.6 s / 468 MB |
| Remacri (`high`) | 33.5 s / 1454 MB | 20.6 s / 1425 MB |
| UltraSharpV2_Lite | 21.6 s / 479 MB | 12.4 s / 461 MB |
| UltraSharpV2 | 114.2 s / 2644 MB | 74.0 s / 2687 MB |
| UniversalUpscalerV2-Neutral | 34.2 s / 1432 MB | 21.0 s / 1418 MB |
| NomosWebPhoto_esrgan | 33.6 s / 1462 MB | 21.2 s / 1453 MB |
| ClearRealityV1 (whole image) | 0.9 s / 868 MB | 0.6 s / 523 MB |

(The first pass of these runs gave 37.7 / 20.8 / 116.3 / 34.8 / 1.3 s for Nomos / Lite /
UltraSharpV2 / Universal / ClearReality on the Claid sample; run-to-run spread is about 10%.)
The fidelity metrics reward faithfulness, not perceived texture, so they say nothing about
the Claid gap by themselves.

### Visual check (Claid sample, three crops)

The side-by-side sheet is `bench/out/saas/compare.png` (git-ignored: it contains Claid's
copyrighted image). Regenerate with `python bench/saas/compare_published.py` after running
`upscale_model.js` once per model (`model_<name>.png`). Observations:

- Claid shows dense, high-contrast suede grain everywhere. No candidate reproduces it.
- UniversalUpscalerV2-Neutral and UltraSharpV2 show the most fine speckle on the toe cap, but
  UniversalUpscalerV2 scores below Remacri and Lite on all three metrics.
- NomosWebPhoto is smoother than Remacri and scores below Lanczos on PSNR: it was trained to
  remove noise and blur, so it removes real texture here.
- UltraSharpV2_Lite looks like Remacri with slightly crisper edges, and wins on GMSD.
- ClearReality is sharp-looking but loses 1.9 dB PSNR versus `fast`.

### Diffusion model (`ssube/stable-diffusion-x4-upscaler-onnx`)

Run with `bench/saas/upscale_sd_x4.py` (diffusers `OnnxStableDiffusionUpscalePipeline`, CPU,
fixed seed, generic prompt "a photo of a product, high detail", noise level 20, 10 steps) on a
128×128 crop of the Claid "before" image (the laces/logo area), since the whole image would not
fit: the crop alone takes **65 s and ~9 GB peak RSS** (5.6 s per step, 4x output 512×512).
Cost grows with pixel count, so the full 640×428 image is roughly 17x more (about 18 min and
far more memory at 10 steps): not usable on a CPU in an upscaler call, and the model's 128 px
design size makes it unusable for 400–800 px inputs without tiling. Not scored on `sub20` for
the same reason (a 400 px image is 10x a crop). Package versions: diffusers 0.42.1,
transformers 5.22.2, torch 2.15.0, onnxruntime 1.29.0. Crop sheet: `bench/out/saas/compare_sd.png`
(git-ignored).

Visual result: smooth, plausible fabric, laces and logo at the same sharpness as `high` or
Lite; **no suede grain** is added, and the "NIKE" lettering is slightly warped. One prompt, one
seed and 10 steps is a thin sample, but there is no sign it closes the gap and it is far slower
(65 s for a 128 px crop, versus 12-21 s for a whole 1000 px image with Lite or Remacri). Verdict: not worth pursuing on CPU; a GPU-only generative mode would be a new
dependency (owner decision).

## Recommendation

1. Texture gap vs Claid: **not closable by a swap-in model from this list.** What Claid adds
   (dense grain, relighting) looks like a generative / enhancement pipeline. Any model that
   invents it would also change what is in the picture. If the owner wants that look, the next
   step is an opt-in, GPU-only generative path, which needs a new dependency and is an owner
   decision.
2. `high` mode: **UltraSharpV2_Lite is the best candidate to replace Remacri** (better GMSD and
   PSNR, 1.7x faster on CPU (sub20 mean; 1.55x on the Claid sample), 3x less memory: 479 vs 1454 MB peak RSS; SSIM 0.0041 lower). Before any switch: confirm its
   license (it is a Lite variant of a CC BY-NC-SA model; the ONNX is a third-party conversion
   with no stated license), convert it ourselves or record the upstream weights hash, and
   re-run the quality gate. Changing the default model is an owner decision (playbook §5), so
   it is recorded as task T8 (blocked).
3. `fast` mode stays: no tested model beats its PSNR, and nothing else runs in under a second.
