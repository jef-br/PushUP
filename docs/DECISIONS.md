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

## D6 — CI scope: Node tests only, Node 20 and 22
- **Decision:** `.github/workflows/ci.yml` runs `npm ci` + `npm test` on pushes to `main` and
  on all PRs, on Node 20 and 22, with npm caching and read-only token permissions.
- **Why:** covers the runtime package (the only thing published). Python bench/model tooling
  needs large downloads and is out of scope. Node 18 is allowed by `engines` but is EOL, so it
  isn't in the matrix.
