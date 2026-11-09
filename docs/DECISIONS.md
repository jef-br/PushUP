# Decisions

Lightweight log of choices and their rationale, so they survive across sessions. Append new
entries at the bottom. Keep each to a few lines: context → decision → why.

---

## D1 — Weak-denoise model at strength 0
- **Decision:** ship `realesr-general-wdn-x4v3.onnx` (denoise strength 0), not stock
  `realesr-general-x4v3`.
- **Why:** stock x4v3 erased small detail — shirt buttons disappeared, fabric looked
  painted. The weak-denoise variant preserves detail; benchmarks (PSNR/SSIM/GMSD) confirm it
  beats both plain Lanczos and stock x4v3 at 400/600/800 px.

## D2 — Build the ONNX model without PyTorch at runtime
- **Decision:** produce the shipped ONNX from official files via `tools/make_dynamic.py` +
  `tools/blend_denoise.py`, reading `.pth` with a restricted unpickler (`tools/pth_weights.py`).
- **Why:** Hugging Face has no ONNX export of the weak-denoise weights. The restricted
  unpickler only rebuilds tensors and refuses to run any other code in the `.pth` file. At
  runtime only the ONNX file is loaded — no Python, no GPU.

## D3 — Always feed the model the full-size input
- **Decision:** never pre-shrink the input before inference.
- **Why:** feeding a shrunken input to save time made results worse in every tested case.

## D4 — 4× in one pass, then Lanczos down
- **Decision:** upscale the whole image 4× in a single pass, then `sharp` Lanczos-resizes to
  the target; optionally mix in a share of plain Lanczos (`DEFAULT_LANCZOS_MIX`).
- **Why:** a single pass avoids tile seams; Lanczos down from 4× hits any target ≤1000 px.

## D5 — In-memory RGB + stride API, not file paths
- **Decision:** `upscale(arr, stride, factor)` takes/returns raw 8-bit RGB buffers with a
  stride, async, one call at a time.
- **Why:** library embeds in a pipeline without touching disk; each call already saturates
  all cores, so serialising calls avoids oversubscription.

## D6 — Default model: 4xLSDIRCompactC3 (+20% Lanczos mix)
- **Decision:** replace realesr-general-wdn-x4v3 with the community compact model
  4xLSDIRCompactC3 (CC BY 4.0), converted by `tools/build_compact_onnx.py`.
- **Why:** on the same 20 e-commerce photos it scored better on PSNR, SSIM and GMSD at
  400/600/800 px and ran ~1.75x faster (half the layers). Sharper pleats; buttons kept.

## D7 — Large ESRGAN community models are optional, not default (pending)
- **Context:** Remacri / NMKD-Siax / 4x-UltraSharp keep the most fabric texture, but cost
  16 s (400 px) to ~60 s (800 px) on a 4-core CPU and need tiling to fit in memory.
- **Status:** awaiting the owner's call on speed vs quality and target hardware (GPU would
  make them ~1-2 s).
- **Licenses:** project is non-commercial; CC BY-NC-SA models are allowed with attribution.
## D7 — Publish tarball via `files` whitelist; Node >=20.9
- **Decision:** keep the `files` whitelist (`src`, `models/*.onnx`) instead of a `.npmignore`;
  add `prepublishOnly: npm test`; raise `engines.node` from `>=18.14` to `>=20.9`.
- **Why:** a whitelist can't leak `bench/`, `tools/`, or fixtures by accident, and
  `test/package.test.js` asserts the contents. `sharp@0.35` requires Node >=20.9, so the old
  `engines` claim was wrong. Publishing itself is left to a human.
