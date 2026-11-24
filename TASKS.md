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

### [~] BACKLOG-2026-11-24-0250 — (claimed 2026-11-24, branch overnight/2026-11-24-BACKLOG-0300) Add three measurement/test tasks BL41–BL43
- **Goal:** GP1, T1a, T3c, T8 are blocked on the owner and nothing else is ready. `src/index.js` is at 100% line and branch coverage (2026-11-24), so new tasks have to be measurements of claims the README makes without numbers.
- **Accept:** BL41–BL43 are in `TASKS.md` with a goal, verifiable acceptance criteria and a one-run scope, and none is on the "never as a self-made task" list (`docs/OVERNIGHT_RUN.md` section 5).
