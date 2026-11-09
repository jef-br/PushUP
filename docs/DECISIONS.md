# Decisions

Lightweight log of choices and their rationale, so they survive across sessions. Append new
entries at the bottom. Keep each to a few lines: context → decision → why.

---

## D1 — Weak-denoise model at strength 0 (superseded by D6)
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

## D7 — Large ESRGAN community models are optional, not default (superseded by D9)
- **Context:** Remacri / NMKD-Siax / 4x-UltraSharp keep the most fabric texture, but cost
  16 s (400 px) to ~60 s (800 px) on a 4-core CPU and need tiling to fit in memory.
- **Status:** awaiting the owner's call on speed vs quality and target hardware (GPU would
  make them ~1-2 s).
- **Licenses:** project is non-commercial; CC BY-NC-SA models are allowed with attribution.
## D8 — No post-sharpening
- **Decision:** don't sharpen the output (T4).
- **Why:** an unsharp mask lowered PSNR/SSIM at every strength on the 20-image subset and
  added no fabric texture, only edge contrast and halos. Missing texture is lost
  information; only a stronger model (e.g. Remacri, T6) restores it.
- **Evidence** (`bench/out/sub20`, `fast` mode, PSNR / SSIM / GMSD; lower GMSD is better):

  | Setting | 400 px | 800 px |
  |---|---|---|
  | no sharpen | 31.51 / 0.894 / 0.108 | 36.28 / 0.954 / 0.049 |
  | sigma 0.5 | 30.75 / 0.887 / 0.107 | 34.88 / 0.953 / 0.050 |
  | sigma 1.0 | 28.97 / 0.873 / 0.110 | 31.43 / 0.940 / 0.071 |
  | sigma 1.5 | 28.21 / 0.868 / 0.116 | 30.16 / 0.932 / 0.084 |


## D9 — CPU always, GPU when present; quality follows the device
- **Owner rule (2026-11-09):** every path must run on CPU only; use a GPU when there is one.
- **Decision:** `auto` picks Remacri (`high`) when a GPU provider loads, else 4xLSDIRCompactC3
  (`fast`) on CPU. Env overrides `PUSHUP_QUALITY` / `PUSHUP_DEVICE`; signature unchanged.
- **Why:** Remacri has the best texture but is ~30x slower on CPU (16-60 s); on a GPU it
  should be ~1-2 s (unmeasured). Fallback on GPU load or run failure keeps CPU-only machines
  working. Env vars (not a parameter) because the `upscale` signature is fixed.

## D10 — SaaS comparison only from vendors' published samples
- **Owner rule (2026-11-09):** no spending, and nothing that needs the owner to act (no trial
  accounts or API keys). "If you can't do it, it's not an option."
- **Decision:** compare against vendors' own before/after marketing images, aligned onto our
  output (`bench/saas/compare_published.py`); images downloaded at run time, never committed.
- **Limits:** one hand-picked sample per page, no ground truth, vendors may add extra steps
  (Claid removed the background and relit). Evidence is visual, not a score.

## D11 — Follow-up tasks are decided by the working session, not the owner
- **Owner rule (2026-11-09):** e.g. T1b — decide from the data, don't ask.
- **Decision:** tasks that wait on a measurement carry an explicit decision rule; the session
  that produces the measurement applies it, records the decision here, and unblocks or
  closes the follow-up itself.

## D12 — Per-task PRs merged by review, not a single `dev` branch
- **Context:** another session (2026-11-09 09:14) pushed a `dev` branch proposing that runs
  push to `dev` and only the owner merges one rolling PR into `main`. Later the same day the
  owner asked for autonomous merging after reviewer + adversary alignment (3b), which is
  what `main` runs.
- **Decision:** keep per-task PRs + 3b. From `dev`, keep the compatible ideas: several tasks
  per run, per-task blockers don't end the run, refill the backlog when empty, a quality
  gate on default changes, precise stop times, and the CUDA-skip install flag. Its
  self-building benchmark set duplicates `bench/fetch_testset.sh`. `dev` holds no code newer
  than `main` (verified file by file), so it is deleted after this merges.
- **Behaviour change to note:** runs now use their whole window (until the hard stop)
  instead of aiming for ~3 hours, and refill the backlog themselves within tight limits
  (playbook section 5): one BACKLOG PR at a time, no new models, dependencies, default
  changes or edits to CLAUDE.md / playbook / `.claude/`.

## D13 — Publish tarball via `files` whitelist; Node >=20.9 (2026-11-08, I3)
- **Decision:** keep the `files` whitelist (`src`, `models/*.onnx`, and since T6 `models/LICENSES.md`) instead of a `.npmignore`;
  add `prepublishOnly: npm test`; raise `engines.node` from `>=18.14` to `>=20.9`.
- **Why:** a whitelist can't leak `bench/`, `tools/`, or fixtures by accident, and
  `test/package.test.js` asserts the contents. `sharp@0.35` requires Node >=20.9, so the old
  `engines` claim was wrong. Publishing itself is left to a human.
