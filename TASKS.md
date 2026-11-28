# TASKS

The backlog for PushUP. Scheduled overnight runs pick work from here; see
`docs/OVERNIGHT_RUN.md`.

## Conventions

- Status: `[ ]` ready · `[~]` in progress · `[x]` done · `[blocked]` waiting on something ·
  `[split]` replaced by sub-tasks (never picked up).
- Each task has an **ID** (stable, used in branch names), a goal, and acceptance criteria.
- One task = one branch (`overnight/<date>-<id>`) = one draft PR.
- Keep tasks small enough to finish and verify in a single ~4-hour window. If a task is
  bigger, split it and add the sub-tasks here first.
- When you claim a task, mark it `[~]` with the date and branch and push that change before
  starting real work.
- Finished (`[x]`) tasks live in `docs/TASKS_DONE.md`, so this file stays small enough to read in one
  call (a test keeps it under 200 000 bytes). A run that finishes a task does not have to move it;
  the next run that touches this file may. A finished task still needs its done note.

## Backlog (highest priority first)

> This is a **seed** backlog derived from the README's "Known limits / next steps" plus the
> infrastructure a continuable project needs. Re-prioritise freely; add detail as you learn.

### [blocked] T3c — Repeat the published-sample comparison for more vendors
- **Goal:** add Let's Enhance, Pixelcut, Picsart, Topaz, Upscale.media samples to
  `docs/SAAS.md` with `bench/saas/compare_published.py` (one entry per vendor).
- **Blocked on:** each vendor's site and image CDN must be added to the environment's
  network allowlist, which needs an interactive session (owner approves host additions).

### [blocked] T8 — Consider UltraSharpV2-Lite as the `high` model (owner decision)
- **Why:** T7 found it better than Remacri on GMSD/PSNR, 1.7x faster on CPU, 3x less memory
  (`docs/TEXTURE.md`). Changing a default model needs an owner-written decision.
- **Blocked on:** owner says go. Then: verify the license of the Lite weights (no OpenModelDB
  entry; the HF ONNX is a third-party conversion), build the ONNX ourselves or record upstream
  hash, run the quality gate (`PUSHUP_QUALITY=high PUSHUP_DEVICE=cpu`), update README and
  `models/LICENSES.md`.

### [blocked] T1a — Measure how well text on packaging survives (research, no product code)
- **Blocked (noted on `main` 2026-11-14 by this PR; details on branch `overnight/2026-11-10-T1a`, PR #19):** the fixed protocol
  finds only 7 usable crops (needs ≥ 15). Fixing it means changing the test set or the confidence
  threshold, i.e. the protocol, which this task fixes on purpose. **Needs an owner-written choice:**
  (a) add a text-rich image source to the set by an OCR-independent rule, or (b) lower the
  threshold to 0.80. Then a run can continue on PR #19's branch (it has no merge base with `main`:
  cherry-pick `bench/text/*` instead).
- **Goal:** Decide with data whether text needs special handling. Text on labels
  (ingredients, brand names, sizes) is where upscalers fail most visibly.
- **Accept:**
  - OCR engine (fixed, so results can't be steered): `rapidocr-onnxruntime` from PyPI with
    its bundled default models; record its version, model files, licenses and SHA-256.
  - Text test set: run that OCR on the 1000 px references from `bench/out/set`; keep text
    lines with recognition confidence ≥ 0.90 and ≥ 4 characters, as crops of the line box
    padded by 8 px (≥15 crops; list them in `docs/TEXT.md` with image name + box).
  - References are built exactly as `bench/bench.js` builds them (set image resized to
    1000 px on its largest side). Protocol: upscale the **whole image** from its 400 px and
    600 px degraded input (as the bench does), then cut the same box (top-left coordinates)
    from the output; if output and reference differ by 1 px after rounding, clip the box to
    the area both share, as the bench does. Score per crop = character accuracy
    `max(0, 1 − editDistance(ocr(out), ocr(ref)) / len(ocr(ref)))`; crops whose reference
    OCR text is empty are excluded. "Mean" = unweighted mean over crops.
  - Methods: Lanczos (baseline), `fast` and `high` (via `PUSHUP_QUALITY` in a small script;
    `high` takes ~15 s per 400 px image on CPU, so budget ~30 min for 15 images × 2 sizes).
  - Decision rule, applied at 400 px and written into `docs/TEXT.md`: recommend T1b if
    `fast`'s mean accuracy < 0.90, **or** ≥ 3 crops have `fast` accuracy < 0.50. Otherwise
    recommend closing T1b. Also report `fast − Lanczos` and `high − fast`: if `high` already
    fixes most failures, say so (text might only need `high` mode, not a new model).
  - `docs/TEXT.md` has the numbers, ≤6 side-by-side crops (images outside git if large) and
    the recommendation.

### [blocked] T1b — Text-aware upscaling
- **Goal:** detect text regions, upscale them with a text-specialised path, blend back.
- **Blocked on:** T1a's result only. The decision is the working session's, not the
  owner's: if T1a's decision rule recommends T1b, the session that finishes T1a sets T1b to
  `[ ]`, splits it into sub-tasks here (detector, text model, compositing, tests, benchmark)
  and records the decision in `docs/DECISIONS.md`. If the rule says no, set T1b to `[x]`
  closed with the evidence.

### [split] T1 — Text-on-packaging upscaler → see T1a (measure) and T1b (build).

### [ ] GP1 — Do not try the CUDA provider on Linux when its libraries are not installed (no error line in `auto` mode)
- **Goal:** README "Quality modes and GPU" says that on Linux without CUDA the first call in `auto` mode logs one red onnxruntime error and that the user should set `PUSHUP_DEVICE=cpu` to avoid it. That makes the default setup noisy, which `test/quiet.test.js` (EX3) deliberately does not cover (it pins `PUSHUP_DEVICE=cpu`). Checked 2026-11-15 in this sandbox (`npm install --onnxruntime-node-install-cuda=skip`, so no CUDA libraries): `PUSHUP_QUALITY=fast PUSHUP_DEVICE=auto` on a 400×4 image succeeds, stdout is clean, and stderr holds one `[E:onnxruntime:..., provider_bridge_ort.cc:...] Failed to load library .../node_modules/onnxruntime-node/bin/napi-v6/linux/x64/libonnxruntime_providers_shared.so ... No such file or directory`. The failing file is `libonnxruntime_providers_shared.so`, **not** `libonnxruntime_providers_cuda.so` as README line ~89 says (so that README quote is wrong); the CUDA download puts `_shared.so`, `_cuda.so` and `_tensorrt.so` together in that binding directory (`node_modules/onnxruntime-node/script/install.js`, `BIN_FOLDER`).
- **Accept:** (1) reproduce it first and put the stderr in the PR; (2) in `src/index.js` add a small helper (exported with an underscore name, so a test can stub the directory) that returns whether `libonnxruntime_providers_shared.so` and `libonnxruntime_providers_cuda.so` both exist in the directory of the loaded onnxruntime-node binding (derive it from `require.resolve('onnxruntime-node')`, do not hard-code an install path; the binding lives in `bin/napi-v6/linux/x64/` below the package); call it from `getGpuSession` (not from `gpuProviders`, which `test/device.test.js` pins) and skip the `cuda` attempt only on Linux x64 and only when the helper says a file is missing; **if the directory cannot be resolved or read (bundlers, Electron asar, symlinked installs, an unexpected layout), attempt as before**: the check may only skip an attempt that would fail, never block one; when both files exist, behaviour is unchanged (the attempt, the fallback to CPU on any failure, `gpuBroken`); `dml` and `coreml` are untouched; no change in output bytes, mode choice or the contract; `PUSHUP_DEVICE=gpu` still warns `PushupWarning` when no provider can load; (3) tests: a unit test of the helper with a stubbed directory (both files / one missing / unreadable directory → "attempt as before"); a child process with `PUSHUP_DEVICE=auto PUSHUP_QUALITY=fast` that writes nothing to stdout/stderr when the files are absent (skip it with a clear message when they are present, as on a runner that downloads CUDA, where the attempt is expected); `test/device.test.js` and `test/device-fallback.test.js` pass unchanged; (4) README: correct the quoted file name, say the message now appears only where the CUDA libraries are installed but cannot be loaded (for example no driver), and keep `PUSHUP_DEVICE=cpu` as the way to skip the attempt; a D-number in `docs/DECISIONS.md` that says the check is by file existence in the binding directory and why it only skips, names the known risk (a later onnxruntime-node that renames or moves the CUDA provider libraries would make the check skip a working setup silently, so upgrading onnxruntime-node means re-checking these two file names; the README already says which CUDA version it expects) and says what `PUSHUP_DEVICE=gpu` prints when the check skips (the existing `PushupWarning`; name the missing file in it if that is a one-line change); (5) CI must be green on all jobs on the final head before the merge (CI runners download CUDA, so the skip branch is not exercised there: say so in the PR).

### [x] BL76 — (done 2026-11-27, TASKS.md + docs/TASKS_DONE.md) Move finished blocks from `TASKS.md` to `docs/TASKS_DONE.md` (housekeeping)
- **Goal:** `TASKS.md` is about 115 KB, about 90 % finished (`[x]`) blocks, and every run reads it first. BL40 allows the next run that touches `TASKS.md` to move them.
- **Accept:** (1) every `### [x]` block of `TASKS.md` that is `[x]` when this task starts (BL76's own block and any task still `[ ]` or `[~]` stay) is appended to `docs/TASKS_DONE.md` **byte-for-byte, in the same order**; check with a script that re-interleaving the blocks of both files gives the old blocks exactly, and put the output (`roundtrip identical: true`) in the PR; (2) `TASKS.md` keeps its intro, Conventions, and every non-`[x]` block; (3) `npm test` passes **without weakening any assertion** (`test/tasks-format.test.js`, `owner-decisions.test.js`, `decision-refs.test.js`, `doc-links.test.js`); (4) this block gets its done note.
- **Notes:** a block starts at its `### ` heading and ends at the next `### ` or end of file. Do not rename, renumber or edit any block while moving it. Do it last when other PRs are merged, so it does not conflict with their `TASKS.md` edits.

- **Done (2026-11-27):** 48 `[x]` blocks moved byte-for-byte, in order, from `TASKS.md` to the end of `docs/TASKS_DONE.md` (all `[x]` blocks that existed when the task started, BL74 and BL75 included; the backlog block of 2026-11-27-2350 too). Checked with a script (`roundtrip identical: true`): the old `docs/TASKS_DONE.md` is a byte-for-byte prefix of the new one; the appended blocks equal the `[x]` blocks of the old `TASKS.md` in order; the kept blocks equal its non-`[x]` blocks in order; re-interleaving the blocks of both new files by their original position gives the old `TASKS.md` exactly; the intro is unchanged. `TASKS.md` went from 117 064 bytes on `main` to about 11 KB (`wc -c`), `docs/TASKS_DONE.md` is now 416 563 bytes. `TASKS.md` now holds the intro and conventions, T3c, T8, T1a, T1b, T1, GP1 and this block (finished here, so it stays until the next run that touches the file moves it). `npm test` 606 pass, 0 fail, no assertion changed.
