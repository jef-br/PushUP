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

### [x] BL40 — (done 2026-11-23, docs/TASKS_DONE.md + test/tasks-format.test.js) Move finished tasks out of `TASKS.md` into `docs/TASKS_DONE.md` so the backlog can be read in one call
- **Goal:** `TASKS.md` (317 KB) cannot be read in one call (limit 256 KB), and 97% of it is finished tasks that no run needs to read. Keep the open work and the conventions in `TASKS.md`; keep the history, unchanged, in a second file.
- **Accept:** (1) a new `docs/TASKS_DONE.md` with a short header saying what it is and that `TASKS.md` holds the open tasks, then every `### [x]` task block of `TASKS.md` **moved byte-for-byte, in the same order** (check with a script: concatenating the blocks of both files by their headings gives the old `TASKS.md` blocks exactly; put the check's output in the PR); `TASKS.md` keeps its `# TASKS` intro, the Conventions section (add one sentence: finished tasks move to `docs/TASKS_DONE.md` when they are `[x]`; a run that finishes a task does not have to move it, the next run that touches `TASKS.md` may) and every non-`[x]` block (`[ ]`, `[~]`, `[blocked]`, `[split]`); (2) the five tests that read `TASKS.md` still pass **without weakening any of their assertions**: `test/tasks-format.test.js`, `owner-decisions.test.js`, `decision-refs.test.js`, `doc-links.test.js` (it must also check `docs/TASKS_DONE.md`, which is under `docs/` so it is probably included; say which) and `doc-tables.test.js`. Where a test looks a task heading up (for example `owner-decisions.test.js` line 12 reads headings and their status), let it read the headings of both files; for `tasks-format.test.js` the rules that apply to `[x]` tasks (a done note) must be applied to `docs/TASKS_DONE.md`, and the rules for claims (`[~]`) to `TASKS.md`; (3) links in other files that point at `TASKS.md` anchors of moved tasks, if any (`grep -rn "TASKS.md#" . --include=*.md`), are updated, and README, `CLAUDE.md` and the playbook are not edited (they only name `TASKS.md` as the backlog, which stays true; say so in the PR); (2a) the done-note rule applies to every `[x]` block in **both** files (a finished task that has not been moved yet must still carry its note); (2b) specifics found in review: `test/decision-refs.test.js` line ~21 exempts `D65` and `D140` (examples in the text of task BL4) under the key `'TASKS.md'`; BL4 moves, so add the same exemption under the key `'docs/TASKS_DONE.md'` (no other allowlist change). In `test/tasks-format.test.js`, the assertions that depend on `[x]` blocks (at least 100 `[x]` tasks; the legacy-set test that reads T4) are **retargeted** to `docs/TASKS_DONE.md`, never relaxed (the floor of 100 stays), and the ID-uniqueness check covers both files together, so a duplicate ID across the two files is still caught (add a made-up-text case for that); (4) a new case in `test/tasks-format.test.js`: `TASKS.md` is under 200 000 bytes (so a run can read it in one call) with a message that says to move `[x]` tasks to `docs/TASKS_DONE.md`; a helper case on made-up text shows the size check reports an oversized file; (5) `npm test` passes, and `wc -c TASKS.md docs/TASKS_DONE.md` is in the PR.
- **Notes:** the first line of every block is the `### [status] ID` heading; a block ends at the next `### ` or at end of file. The `## Backlog` heading and the seed note are part of the intro and stay. Do not rename or renumber any task, and do not change the text of any block while moving it.
- **Done (2026-11-23):** 177 `[x]` blocks moved byte-for-byte, in order, to the new `docs/TASKS_DONE.md` (checked with a script: the blocks of both files re-interleaved by their original position give the old `TASKS.md` exactly, `roundtrip identical: true`). `TASKS.md` is now about 14 KB (it was 321 583 bytes on `main`, `wc -c`) and `docs/TASKS_DONE.md` is 309 705 bytes; it keeps the intro, Conventions (plus one sentence on where finished tasks live), the 6 open blocks (T3c, T8, T1a, T1b, T1, GP1) and this block (finished here, so it stays until the next run moves it). Tests: `tasks-format` reads both files (every rule applies to both together, so a duplicate ID across files and a missing done note are still caught; the floor of 100 `[x]` tasks and the T4 legacy test now read `docs/TASKS_DONE.md`; new cases for a duplicate ID across files and for the size check, `TASKS.md` under 200 000 bytes); `owner-decisions` reads the headings of both files; `decision-refs` gets the same D65/D140 exemption under `docs/TASKS_DONE.md` (the BL4 text moved there; the `TASKS.md` key stays, BL40's own text names them); `doc-links` and `doc-tables` already read every `docs/*.md`, so they check the new file with no edit. No assertion weakened. No `TASKS.md#` anchors exist anywhere, README, `CLAUDE.md` and the playbook are not edited (they name `TASKS.md` as the backlog, which stays true). Note: `docs/TASKS_DONE.md` itself is over 256 KB, so a run that needs an old task searches it (`grep -n "^### \[x\] ID"`) instead of reading it whole.

### [x] BACKLOG-2026-11-24-0250 — (done 2026-11-24, tasks BL41–BL43 below) Add three measurement/test tasks BL41–BL43
- **Goal:** GP1, T1a, T3c, T8 are blocked on the owner and nothing else is ready. `src/index.js` is at 100% line and branch coverage (2026-11-24), so new tasks have to be measurements of claims the README makes without numbers.
- **Accept:** BL41–BL43 are in `TASKS.md` with a goal, verifiable acceptance criteria and a one-run scope, and none is on the "never as a self-made task" list (`docs/OVERNIGHT_RUN.md` section 5).

### [x] BL41 — (done 2026-11-24, bench/banding.js + docs/BANDING.md + test/bench-run-banding.test.js) Measure whether `fast` keeps soft shadows and background gradients smooth (banding), no product code
- **Goal:** e-commerce photos have a white or light backdrop with a soft shadow under the product. Super-resolution models can turn a smooth 8-bit gradient into visible steps (banding) or add noise. Nothing in `docs/` measures gradients (`docs/EDGES.md` covers hard edges, `docs/COLOR.md` flat colours).
- **Accept:** (1) `bench/banding.js` builds, without downloads, synthetic 400×300 and 800×600 images: a horizontal and a diagonal grey ramp from 255 to 200 and a radial "shadow" (white to grey 150 over 120 px), each with and without ±1 level of seeded noise, then runs `upscale` at factor 1 and 1.5 in `fast` mode on CPU; (2) per case it prints the number of distinct grey levels along a line through the gradient, the longest run of equal values on that line (a step wider than the same measure on the Lanczos resize of the input, scaled by the factor, counts as banding) and the mean absolute second difference (roughness) next to the Lanczos figures; the script exits 0 and prints a markdown table; (3) `docs/BANDING.md` has the table, the method, and one sentence of result: no banding found, or the worst case with numbers; (4) a test (`test/bench-run-banding.test.js`, small size and one case so it stays fast) checks the script runs and its table has the expected rows; README and `docs/` links to the new file pass `doc-links`; (5) no change to `src/` or to any default. If banding is found, say so in `docs/BANDING.md` and add the finding to `docs/OWNER_DECISIONS.md` as a new row instead of fixing it.
- **Done (2026-11-24):** `bench/banding.js` runs 24 cases (2 sizes × 3 gradients × 2 noise settings × 2 factors, about 25 s on 4 vCPU). Result in `docs/BANDING.md`: the strict rule (model's longest run longer than Lanczos's) flags 10 of 24 cases, none judged a visible step. Worst: 800×600 diagonal ramp with ±1 noise at factor 1, 21 against 10 px (the model flattens noise into plateaus 1.3–2.1× as long); on noise-free input at most 1 px longer. Levels differ by at most 3 except in four radial-shadow cases (worst: 89 against 105 at factor 1). No `src/` change, no owner decision needed. Test: `test/bench-run-banding.test.js` (one case plus the helpers).

### [~] BL42 — (claimed 2026-11-24, branch overnight/2026-11-24-BL42) Check the README claim that a factor-1.0 call "removes JPEG blocks" with a number
- **Goal:** README "Usage" says that with factor 1.0 "the model still runs, so JPEG blocks are removed and edges get sharper". No file in `docs/` or `bench/` measures it, so the sentence is unproven.
- **Accept:** (1) `bench/jpeg.js` takes the 1000 px references of `bench/out/set` (print a clear message and exit 1 when the folder is missing, as the other `bench/*-real.js` scripts do), resizes each to 600 px on its largest side, encodes it with `sharp` as JPEG at quality 50 and 75, decodes it, runs `upscale` at factor 1 in `fast` mode on CPU and compares, against the 600 px un-compressed image, PSNR and a blockiness figure (mean absolute luma step across 8-pixel block borders divided by the mean step inside blocks) of: the decoded JPEG and the `fast` output; (2) `docs/JPEG.md` has the table (mean over the images, per quality) and a one-sentence verdict: blockiness and PSNR improve, are unchanged, or get worse; (3) if blockiness does not drop by at least 10% or PSNR falls, the README sentence is reworded to what the numbers show (README numbers are tested by `test/readme*.test.js`: keep them passing); if it does, the README sentence gets a link to `docs/JPEG.md`; (4) a unit test of the blockiness helper on made-up arrays (a blocky ramp scores higher than a smooth one); (5) no change to `src/`.

### [ ] BL43 — Measure and test that neutral greys stay neutral through `fast`
- **Goal:** product shots on grey or white backdrops need R = G = B to stay equal; a colour cast of a few levels in a grey background is visible. `docs/COLOR.md` measures flat saturated colours, not mixed greys, textured greys or noisy greys.
- **Accept:** (1) `bench/neutral.js` builds synthetic 400×300 images that are exactly neutral (R = G = B): a flat grey at 64, 128, 192 and 240, a ramp, and a seeded-noise grey (±8), runs `upscale` at factor 1 and 1.5 in `fast` mode on CPU, and prints per case the largest and mean `max(R,G,B) − min(R,G,B)` per pixel of the output, measured away from the border (more than 16 px from every edge, as `bench/colors.js` does) and over the whole image; (2) `docs/COLOR.md` gets a section "Neutral greys (BL43)" with the table and one sentence of result; (3) a test (`test/bench-run-colors.test.js` extended, or a new `test/bench-run-neutral.test.js`) runs the script on one small case; and **a test of the product** that a flat grey image comes out with a per-pixel channel spread of at most the figure measured here plus 1 (write the measured figure in the test comment, so a later model change that adds a cast fails it); (4) if the spread away from the border is above 2 levels on any case, add the finding to `docs/OWNER_DECISIONS.md` as a new row instead of changing `src/`; (5) no change to `src/` or any default.
