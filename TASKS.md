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

## Backlog (highest priority first)

> This is a **seed** backlog derived from the README's "Known limits / next steps" plus the
> infrastructure a continuable project needs. Re-prioritise freely; add detail as you learn.

### [x] I1 — CI: run tests on every PR (done 2026-11-08)
- **Goal:** GitHub Actions workflow that runs `npm install` and `npm test` on push/PR.
- **Accept:** `.github/workflows/ci.yml` present; green on a trivial PR; caches npm.
- **Notes:** Keep it to the runtime package; the Python bench/model tooling is out of scope
  for CI unless cheap to add.

### [x] I4 — Harden tests around the contract edges (done 2026-11-07, branch overnight/2026-11-07-I4)
- **Goal:** Explicit tests for the `RangeError` bounds (399/400/800/801 px largest side),
  `stride` padding (0–2 bytes, odd widths), and the 1000 px output cap (e.g. 800 px @1.5).
- **Accept:** New tests pass; each contract row in `CLAUDE.md` has at least one test.

### [x] T2 — Profile and document upscale latency (done 2026-11-07; see docs/PERF.md)
- **Goal:** Measure per-input-size latency on the standard set and find the dominant cost.
- **Accept:** A short `docs/PERF.md` with a methodology + numbers; one concrete, low-risk
  speed idea written up as a follow-up task (don't implement risky changes unattended).
- **Notes:** README baseline: ~1 s @400 px, ~4 s @800 px on 4 cores.

### [x] T4 — Optional post-sharpen toggle for fine texture (closed 2026-11-09: negative result, not shipped; see D8)
- **Goal:** Evaluate whether a small, optional sharpening step improves perceived fabric
  texture without hurting PSNR/SSIM/GMSD.
- **Accept:** Benchmark comparison (then in `PROGRESS.md`, now in D8); ship only if it's a clear win and
  default-off; otherwise record the negative result and close the task.

### [x] I3 — Package publish readiness (done 2026-11-08, branch overnight/2026-11-08-I3)
- **Goal:** Make `package.json` metadata, `files`/`.npmignore`, and `README` ready for
  `npm publish` (dry run only — do not publish).
- **Accept:** `npm pack` produces a tarball that includes `src/`, `models/*.onnx`, `README`;
  excludes `bench/`, `tools/`, test fixtures. `npm publish --dry-run` clean.

### [x] T5 — Faster `fromTensor` (byte-identical output) (done 2026-11-09: ~5x faster stage, see docs/PERF.md)
- **Outcome:** done with an inline `floor(v * 255 + 0.5)` (exact for float32), not
  `Uint8ClampedArray` (ties-to-even would change bytes). Original goal kept below.
- **Goal:** Replace the per-pixel `Math.round` + clamp loop in `src/index.js`
  (`copyFromTensor` since tiling landed; it was `fromTensor`)
  with a `Uint8ClampedArray`-based write (see `docs/PERF.md`).
- **Accept:** Output bytes identical to the old implementation on test images (add a test
  comparing against a reference clamp); `bench/profile.js` shows the `fromTensor` drop.
- **Notes:** `Uint8ClampedArray` rounds ties to even, `Math.round` rounds half-up, and
  adding 0.5 before the write would double-round (off by one). Byte-identical output may
  not be achievable with the native clamp; if the test shows any difference, drop the idea
  and record the negative result. The `fromTensor` stage is ~6.6% of latency at 800 px;
  the expected saving is smaller (estimate, unmeasured).

### [x] T6 — GPU when available, CPU always; high-quality mode (done 2026-11-09, PR #13)
- **Owner decision (2026-11-09):** every path must run on CPU only; use a GPU when present.
- **Goal:** pick the execution device and model automatically, without changing the `upscale`
  signature: GPU present → Remacri (best texture); CPU → 4xLSDIRCompactC3 (fast).
  Overrides via env: `PUSHUP_QUALITY=auto|fast|high`, `PUSHUP_DEVICE=auto|cpu|gpu`.
- **Accept:**
  - GPU provider per platform (Windows DirectML, Linux x64 CUDA, macOS arm64 CoreML); any
    GPU failure (load or run) falls back to CPU with identical-quality semantics, never an error.
  - `PUSHUP_QUALITY=high` works on CPU (tiled, slow) — tested.
  - Default on a CPU-only machine is byte-identical to before (fast model) — tested.
  - Invalid env values throw a clear error — tested.
  - Remacri ONNX shipped with license/attribution (CC BY-NC-SA 4.0).
  - Benchmark numbers for both modes recorded; README/CLAUDE.md document the modes.
- **Note:** no GPU in the cloud container; GPU paths are verified only by their fallback.

### [x] T3 — Compare with a SaaS upscaler, without spending (done 2026-11-09, see docs/SAAS.md)
- Owner rule: no accounts or credits; only what a session can do itself.
- Method: the vendor's own published before/after pair, aligned onto PushUP's output
  (`bench/saas/compare_published.py`). Claid.ai: PushUP is clean and faithful but behind on
  fine texture (suede fibres). Follow-up: T7.

### [blocked] T3c — Repeat the published-sample comparison for more vendors
- **Goal:** add Let's Enhance, Pixelcut, Picsart, Topaz, Upscale.media samples to
  `docs/SAAS.md` with `bench/saas/compare_published.py` (one entry per vendor).
- **Blocked on:** each vendor's site and image CDN must be added to the environment's
  network allowlist, which needs an interactive session (owner approves host additions).

### [x] T7 — Close the texture gap (research, no product code) (done 2026-11-09, see docs/TEXTURE.md)
- **Goal:** find a model that produces Claid-like material texture (suede, knit, leather)
  without inventing wrong detail, that runs on CPU (any speed) and is worthwhile on a GPU.
- **Accept:**
  - Candidates from Hugging Face / OpenModelDB with a published ONNX export or a format our
    converters handle (`tools/build_*_onnx.py`), plus at least one generative / one-step
    diffusion SR model if an ONNX export exists. Record license, size, source and SHA-256.
  - For each: CPU time on the Claid sample (640×428 → 1000 px) and on one sub20 image,
    peak memory, and the crop comparison from `bench/saas/compare_published.py` (add the
    model as a column). Score on `bench/out/sub20` at 400 px with `bench/bench.js`.
  - `docs/TEXTURE.md`: table, crops (outside git), and a recommendation: which model (if
    any) should become the GPU `high` mode, with the evidence.
- **Notes:** CC BY-NC-SA licenses are acceptable (non-commercial project). Models that
  can't produce an ONNX file without PyTorch are out of scope — record them as such.
  Network available unattended: Hugging Face (models + datasets), PyPI/npm, GitHub release
  downloads and `git clone` (OpenModelDB data: `git clone --depth 1 --filter=blob:none
  --sparse https://github.com/OpenModelDB/open-model-database`), and `claid.ai` for the
  Claid sample. `github.com/<repo>/raw/...` and other sites are blocked — a model only
  available elsewhere is recorded as unreachable, not worked around.

### [blocked] T8 — Consider UltraSharpV2-Lite as the `high` model (owner decision)
- **Why:** T7 found it better than Remacri on GMSD/PSNR, 1.7x faster on CPU, 3x less memory
  (`docs/TEXTURE.md`). Changing a default model needs an owner-written decision.
- **Blocked on:** owner says go. Then: verify the license of the Lite weights (no OpenModelDB
  entry; the HF ONNX is a third-party conversion), build the ONNX ourselves or record upstream
  hash, run the quality gate (`PUSHUP_QUALITY=high PUSHUP_DEVICE=cpu`), update README and
  `models/LICENSES.md`.

### [x] R4 — (done 2026-11-10, test/length.test.js) Test: input length edge cases in `readDims`
- **Goal:** `src/index.js` `readDims` derives the height from `arr.length`, and lets the last row
  skip its padding. None of that is tested; pin it.
- **Accept:** new tests (new file `test/length.test.js`) for: (a) a padded image (pad 1 and 2)
  whose last row has no padding (`arr.length = (h − 1) * stride + width * 3`) resolves with the
  same output bytes as the fully padded buffer; (b) trailing bytes shorter than one row
  (`arr.length = h * stride + k`, `0 < k < width * 3`) are ignored: same output as without them;
  (c) `arr` shorter than `width * 3` bytes rejects with `RangeError` (a length between
  `width * 3` and `stride` is a valid 1-row image: the last row may skip its padding); (d) a plain `number[]` input gives
  output byte-identical to the same pixels as a `Uint8Array`. Use small images (largest side 400,
  short side ≤ 16) so the file runs in a few seconds. Fix `src/` only if a test exposes a real
  bug (say so in the PR); no contract or default change. `npm test` passes.

### [x] R5 — (done 2026-11-10, test/device-fallback.test.js) Test: device-fallback paths not yet covered
- **Goal:** `test/device.test.js` covers GPU load failure and run failure only for
  `PUSHUP_QUALITY=auto`. Pin the other branches of `resolveEngine` and the run-time fallback.
- **Accept:** new tests (stub `ort.InferenceSession.create` as the existing tests do; no real
  GPU) for: (a) `PUSHUP_QUALITY=high` with a GPU session that fails at run time retries on CPU
  with the **Remacri** model (not the fast one): assert the CPU session was created for
  `_MODES.high.modelPath`; (b) with `PUSHUP_QUALITY=high`, after one run-time GPU failure a second
  call makes no further GPU `create` call and no GPU run (sticky fallback until `_reset()`; the
  existing `auto` test already checks that runs don't repeat); (c) setting values are
  trimmed and case-insensitive (`' FAST '`, `'Cpu'`) and an empty string means `auto`. Keep
  `high` runs cheap (largest side 400, short side ≤ 16). No `src/` change unless a test exposes a
  real bug (say so in the PR). `npm test` passes.

### [x] Q6 — (done 2026-11-10, README "Errors" + test/readme-errors.test.js) README: document the errors `upscale` throws, with a test that keeps it true
- **Goal:** callers need to know which inputs reject and with which error class; today that is
  only in the code.
- **Accept:** a short "Errors" list under README "Usage": each row = trigger → error class
  (`TypeError`: `arr` not a byte array / number array, `stride` not an integer ≥ 3; `RangeError`:
  largest side outside 400–800 px, `arr` shorter than one row, `upscale_factor` not a finite
  number > 0, invalid `PUSHUP_QUALITY` / `PUSHUP_DEVICE`). A test (new file
  `test/readme-errors.test.js`) parses that list and, for each row, triggers it and asserts the
  promise rejects with the documented class; it fails if a row can't be mapped to a trigger or
  the list is missing. Note the check order in `run()`: `arr` type, factor, stride, size, then the
  env settings, so each trigger needs the earlier arguments valid. Don't add a ```js block calling
  `upscale(` before the usage example (R2's test reads the first one). Docs and test only; no change to what `src/` throws (if the doc would
  have to say something odd, document what the code does and add a TASKS note). `npm test`
  passes (the README test from R2 still passes).

### [x] P2 — (done 2026-11-10: mix stage ~15-19 ms faster at 800 px, byte-identical; see docs/PERF.md) Faster Lanczos-mix loop (byte-identical output)
- **Goal:** the mix in `run()` calls `Math.round` per byte (~3 M bytes at 1000 px).
- **Accept:** replace it with an equivalent integer-friendly form (e.g. `(a * o + m * p + 0.5) | 0`
  for non-negative values) only if the output is byte-identical (extracting the loop into a helper
  with a test-only `_` export, like `_copyFromTensor`, is allowed): add a test that compares the new
  mix against `Math.round(a * o + m * p)` over all 256×256 byte pairs for the shipped mix share
  (`_MODES.fast.lanczosMix`) and on one real `upscale` output; measure the stage before/after
  (median of ≥ 5 runs at 800 px, factor 1.25) and put the numbers in `docs/PERF.md`. If the
  saving is < 5 ms at 800 px or any byte differs, don't ship it: record the negative result in
  `docs/PERF.md` and close the task. `npm test` passes.

### [x] B1 — (done 2026-11-10, bench/gate.js + test/gate.test.js) `bench/gate.js`: apply the quality gate to two `--json` runs
- **Goal:** playbook §2's quality gate (PSNR may drop ≤ 0.02 dB, SSIM ≤ 0.001, GMSD may rise
  ≤ 0.001, at each size) is checked by hand today. Make it a script.
- **Accept:** `node bench/gate.js <before.json> <after.json>` reads two outputs of
  `bench/bench.js --json` and compares each overall row (`setting` like `400px sr-full`; rows whose
  setting ends in `]` are per-source and ignored) present in `before` with the same setting in
  `after`. It prints one line per setting with the three deltas and PASS/FAIL, then `GATE: PASS` or
  `GATE: FAIL`, and exits 0 / 1. It fails (exit 1, clear message) if a `before` setting is missing in
  `after`, or if `images` differs. Thresholds are constants at the top of the file, with the
  playbook section named in a comment; a delta exactly at a threshold passes (allow a tiny
  epsilon, e.g. 1e-9, for float rounding). A test
  (`test/gate.test.js`) runs it on small JSON fixtures written to a temp dir: identical files
  pass; each metric just over its threshold fails; exactly at it passes; missing setting and
  different `images` fail; per-source rows are ignored. Usage line at the top of the file. No
  change to `bench.js` output or the playbook. `npm test` passes.

### [x] R6 — (done 2026-11-10, test/arr-types.test.js) Test: which `arr` types are accepted, rejected or converted
- **Goal:** README "Errors" (Q6) says a plain `Array` is converted, not checked, and other
  non-`Uint8Array` inputs are a `TypeError`. Pin the edges so a change is a deliberate one.
- **Accept:** new tests (new file `test/arr-types.test.js`, 400×4 images; `Buffer` slices,
  `byteOffset` views and `number[]` = `Uint8Array` are already in `input.test.js` /
  `length.test.js`, so don't repeat them): a `Buffer` is accepted; `Uint8ClampedArray`, `Int8Array`, `Float32Array`, a
  `DataView`, an `ArrayBuffer` and a string reject with `TypeError`; a plain `Array` with values
  300 and 'x' resolves with the same output as a `Uint8Array` holding 44 and 0 (the conversion
  `Uint8Array.from` does); an `Array` holding a `Symbol` or a `BigInt` rejects with `TypeError`.
  Pin today's behaviour only: no `src/` change (if a case surprises, record it as a note on this
  task for the owner instead of changing the API). `npm test` passes.

### [x] D2 — (done 2026-11-10) `docs/CONTRACT_TESTS.md`: add the tests landed since S2
- **Goal:** R4, Q6 and R5 added contract-relevant tests that the map doesn't list yet.
- **Accept:** list `test/length.test.js` and `test/readme-errors.test.js` tests (literal names as
  bullets in the right section, generated names in prose, per the file's format) under the
  matching contract rows (e.g. short/trailing `arr` under `stride`, error rows under Input /
  `upscale_factor`); `test/contract-tests.test.js` passes and, as a check, fails when one listed
  name is misspelt (try it locally, don't commit that). Docs only; no test or `CLAUDE.md` change.
  `npm test` passes.

### [x] D3 — (done 2026-11-10, test/readme-bench.test.js) README "Benchmark": current workflow (fetch script, `--json`, gate)
- **Goal:** the README still shows only `bench/build_testset.py` with local parquet files; it
  doesn't mention `bash bench/fetch_testset.sh` (the way runs build `bench/out/set` / `sub20`),
  `--by-source`, `--json` (S3) or `bench/gate.js` (B1).
- **Accept:** README "Benchmark" gets a short command block covering: fetch the set with
  `bash bench/fetch_testset.sh`; run `node bench/bench.js bench/out/sub20 --sizes 400,800 --json >
  before.json` (and `after.json`); compare with `node bench/gate.js before.json after.json`; one
  sentence on `--by-source`. Keep the existing `build_testset.py` line as the manual route. A test
  (new file `test/readme-bench.test.js`) checks that every `bench/<file>` path with a file
  extension (`.js`/`.sh`/`.py`) mentioned in README.md exists (generated dirs like `bench/out/sub20`
  are skipped) and every `--flag` used with `bench/bench.js` in the README appears in
  `bench.js`'s usage line (today the usage line lacks `--methods`: add it there, a comment-only
  change to `bench.js`, and say so in the PR). Must not add a ```js block calling `upscale(`
  (R2). Docs + test (+ that usage comment) only. D3 and D5 both edit README "Benchmark": land one
  before starting the other.
  `npm test` passes.

### [x] D4 — (done 2026-11-11, docs/PERF.md) Refresh the `docs/PERF.md` results table
- **Goal:** the "Current (2026-11-09)" table predates P2 (mix loop) and Q3; numbers drift.
- **Accept:** run `PUSHUP_QUALITY=fast PUSHUP_DEVICE=cpu node bench/profile.js --runs 5` (sizes 400,
  600, 800, factor 1.5) twice; put
  the second run's medians in a new dated table at the top of "Results" (keep the 2026-11-09 table
  below it as history, labelled), with the machine line (keep the existing "Machine:" wording;
  update `cpus` and the Node version from the script's header). One sentence on what changed since 2026-11-09 (stage by stage, only where the change
  is larger than the run-to-run difference between your two runs). No code change. `npm test` passes.

### [x] D5 — (done 2026-11-11) README results table for the current models
- **Follow-up (not done):** README "Known limits" still says ~1 s at 400 px / ~4 s at 800 px;
  the 2026-11-11 run measured 0.42 s / 1.6 s per image (fast, 4 cores). Worth a small docs task.
- **Goal:** the README "Benchmark" table shows only the earlier realesr-general models; the
  shipped `fast` model (4xLSDIRCompactC3 + 20% Lanczos) has no row in it (its numbers appear only
  in "Model choice"; reconcile them: if they differ, say which run is newer).
- **Accept:** with `bench/out/set` (60 images, `bash bench/fetch_testset.sh`), run
  `PUSHUP_QUALITY=fast PUSHUP_DEVICE=cpu node bench/bench.js bench/out/set --methods lanczos,sr-full`
  (sizes 400/600/800);
  add the `sr-full` rows to the README table (or a new table directly above it) labelled with the
  model and date, keeping the old rows labelled as earlier models; put the raw output in the PR
  description. If the dataset fetch fails, mark D5 `[blocked]` with the error. No code change.
  `npm test` passes. (`high` mode is out of scope: ~30x slower on CPU.)

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

### [x] K2 — (done 2026-11-11, ci.yml `pack-smoke` env) CI `pack-smoke`: skip the CUDA download
- **Goal:** `pack-smoke` failed once on PR #55 (run 42948824529): the job log ends in
  `npm error ... ETIMEDOUT 150.171.109.152:443` (+ `ENETUNREACH` on IPv6) during the tarball's
  `npm install`, most likely onnxruntime-node's CUDA binaries download (a Microsoft host). The
  runner has no GPU, so the smoke test doesn't need them; the download only adds a network
  dependency.
- **Accept:** the `pack-smoke` job in `.github/workflows/ci.yml` sets
  `PUSHUP_SMOKE_NPM_ARGS: --onnxruntime-node-install-cuda=skip` (job `env`); the `test` job is
  unchanged. The job is green on the PR and its log shows the flag reached `npm install` (the
  onnxruntime-node install output reports the CUDA download skipped, or shows no CUDA download). README "Development" stays accurate. `npm test` passes.
- **Done (2026-11-11, PR #60):** job-level `env` sets the flag; `scripts/pack-smoke.sh` now echoes
  `npm install extra args: …` so the log shows it reached the install. CI results in the PR.

### [x] P5 — (done 2026-11-12, bench/throughput.js) `bench/throughput.js`: stop the other children when one fails
- **Goal:** when one child dies, the parent exits 1 but leaves the other children running until
  their own deadline (P4 adversary note).
- **Accept:** on any child failure the parent kills the remaining children before exiting (and
  on SIGINT). Show in the PR: a forced crash in model load and a SIGKILL mid-run both exit 1 and
  `ps` shows no `throughput.js --child` process afterwards, and the same after a SIGINT (Ctrl-C)
  to the parent mid-run; a normal
  `node bench/throughput.js --seconds 3 --sizes 400` still exits 0. No `src/` change. `npm test`
  passes.

### [x] D7 — (done 2026-11-11, docs/DECISIONS.md D15) `docs/DECISIONS.md`: record the thread-count decisions from P3/P4
- **Goal:** P3 and P4 decided to keep `intraOpNumThreads = os.availableParallelism()` and not to
  add a thread/process setting without the owner; that is in `PROGRESS.md` and `docs/PERF.md` but
  has no D-number, unlike other decisions (P4 adversary note).
- **Accept:** one new D-entry in `docs/DECISIONS.md` (next free number) with context, the P3/P4
  numbers it rests on (linking `docs/PERF.md` "Threads" and "Throughput"), the decision, and what
  would reopen it (e.g. a many-core host, or an owner-requested batch mode). The two W46 lines in
  `PROGRESS.md` (Threads, Throughput) point to it. Docs only. `npm test` passes.
- **Done (2026-11-11, PR #61):** D15 added; both W46 lines in `PROGRESS.md` point to it (the
  Throughput line now says model calls/s, matching `docs/PERF.md`).

### [x] R7 — (done 2026-11-11, test/model-input.test.js) Test: the shrink-before-model path (`modelInputMax`) in `_run`
- **Goal:** `run()` can shrink the input before the model (`opts.modelInputMax`, used by
  `bench/bench.js` methods like `sr-300`), never below `ceil(target / 4)`. No test covers it.
- **Accept:** new tests (new file `test/model-input.test.js`, `fast` model on CPU, small images
  with short side ≤ 16 so it runs in seconds) via `_run`: (a) with `modelInputMax` 200 on a
  400 px input at factor 1.0 the output has the contract size and stride; (b) the model really
  sees the shrunk input: stub or wrap `session.run` (as `test/device*.test.js` do) and assert
  the tensor's largest side is `max(ceil(target / 4), modelInputMax)`, e.g. 250 for a 400 px
  input at factor 2.5 (target 1000) with `modelInputMax` 100; (c) `modelInputMax` ≥ the input's
  largest side leaves the model input at full size. No `src/` change unless a test exposes a
  real bug (say so in the PR). `npm test` passes.
- **Done (2026-11-11, PR #56):** three tests (wrapped `InferenceSession.create` records each
  `session.run` input's dims), ~0.5 s. No `src/` bug found. Mutation check: dropping the
  `ceil(target / 4)` floor fails (b); disabling the shrink fails (a) and (b).

### [x] L2 — (done 2026-11-11, test/lockfile.test.js) Lockfile test: compare every dependency field, not just the five named in L1
- **Goal:** `test/lockfile.test.js` (L1) compares `name`, `version`, `license`, `dependencies`,
  `engines`. If `package.json` later gains `devDependencies`, `optionalDependencies`,
  `peerDependencies` or `bin`, the lockfile root could drift unnoticed (L1 adversary note).
- **Accept:** the test also compares `devDependencies`, `optionalDependencies`,
  `peerDependencies`, `peerDependenciesMeta` and `bin` (absent on both sides counts as equal;
  absent on one side only fails). Show in the PR that it fails when one of them is added to
  `package.json` only (scratch copy, not committed). No change to `package.json` or the
  lockfile. `npm test` passes.
- **Done (2026-11-11, PR #57):** the five fields are compared too; each one added to `package.json`
  only fails the test (scratch, not committed). Both sides are compared in npm's normalized form
  (checked with npm 10.9.9): an empty object counts as absent (npm drops `optionalDependencies: {}`),
  and a string `bin` becomes `{ <name without scope>: path }` with `\` → `/` and no leading `./`. A
  lockfile that npm synced with all five fields set passes (review round 2).

### [x] P4 — (done 2026-11-11, bench/throughput.js + docs/PERF.md "Throughput") Measure throughput: one N-thread process vs several fewer-thread processes (docs only)
- **Goal:** P3 found one thread spends ~11–20% fewer core-ms per image than N threads, so a
  server running several processes *might* get more images/s. That ignored contention
  between processes. Measure it before anyone proposes a setting.
- **Accept:** a script `bench/throughput.js` that, for the `fast` model on CPU, runs for a
  fixed wall time (default 30 s, after warm-up) (a) one process with
  `intraOpNumThreads = N` and (b) N processes with 1 thread each (and N/2 processes with 2
  threads if N ≥ 4), all on the same synthetic 400×300 and 800×600 inputs, timing only
  `session.run` (session options from `_sessionOptions`), and reports images/s per
  configuration and per-image latency (median). A section "Throughput (P4, <date>)" in
  `docs/PERF.md` with the table, machine line and how to run; it updates the P3 follow-up
  idea with the result. No `src/` change (a thread setting would be an owner decision).
  `npm test` passes.
- **Done (2026-11-11, PR #58):** on 4 vCPU, 4 × 1 thread gives +9–15% images/s over 1 × 4
  threads (two 30 s runs), at ~3.5× the per-image latency. No change; the P3 follow-up idea in
  `docs/PERF.md` now has the result.

### [x] L1 — (done 2026-11-11, test/lockfile.test.js) `package-lock.json` agrees with `package.json` (engines), with a test
- **Goal:** the lockfile's root package still records `engines: { node: ">=18.14" }` while
  `package.json` says `>=20.9` (D13), so every plain `npm install` rewrites the lockfile and
  runs keep having to revert it (seen in PR #19 and the 2026-11-11 runs).
- **Accept:** regenerate the lockfile's root entry with `npm install --package-lock-only`
  (add `--onnxruntime-node-install-cuda=skip` if needed) so that `packages[""]` matches
  `package.json` for `name`, `version`, `license`, `dependencies` and `engines`; no resolved
  dependency version may change (`git diff package-lock.json` touches only the root entry —
  if it would change anything else, stop and record that on this task). A new test
  (`test/lockfile.test.js`) fails if those root fields differ from `package.json`. After the
  change a plain `npm install` leaves `git status` clean. `npm test` passes.
- **Done (2026-11-11, PR #52):** `npm install --package-lock-only` (npm 10.9.9) changed one line,
  root `engines` `>=18.14` → `>=20.9`; no resolved version changed. The new test fails on the old
  lockfile (`engines` differs) and passes now; a plain `npm install` afterwards leaves `git status` clean.

### [x] Q8 — (done 2026-11-11, `_sessionOptions` + test/profile-sync.test.js) One copy of the ONNX session options for `src/` and the bench scripts
- **Goal:** `bench/profile.js` and `bench/threads.js` copy the session options of
  `sessionOptions()` in `src/index.js` (not exported), so they can drift from what ships.
- **Accept:** export it test/bench-only as `_sessionOptions` (like `_toTensor`; no public API
  change), use it in `bench/profile.js` (CPU) and `bench/threads.js` (overriding only
  `intraOpNumThreads`), and update their "copy" comments. Extend `test/profile-sync.test.js`:
  `_sessionOptions(['cpu'])` has `intraOpNumThreads === os.availableParallelism()`, and
  neither bench script contains its own `graphOptimizationLevel` / `executionMode` literal.
  Output and timing of `src/` unchanged (no behaviour change); `node bench/threads.js --runs 1
  --sizes 400` and `node bench/profile.js --runs 1 --sizes 400` still run (paste their output in
  the PR). `npm test` passes.
- **Done (2026-11-11, PR #53):** `src/index.js` exports `_sessionOptions` (one line, no behaviour
  change); both bench scripts use it. The new script-check test fails against the old bench scripts
  (the value test needs the new export, so it fails only against the old `src/`); both pass now.

### [x] D6 — (done 2026-11-11, README "Development" + test/readme-bench.test.js) README "Development": the dev commands that exist now
- **Goal:** README "Development" lists only `npm install` / `npm test`; the pack smoke test
  (`scripts/pack-smoke.sh`, K1), the latency profile, cold-start and thread scripts
  (`bench/profile.js`, `bench/cold.js`, `bench/threads.js`) and the sandbox install flag are
  only in `CLAUDE.md`, `docs/PERF.md` or the scripts themselves.
- **Accept:** README "Development" lists each of those commands with one line on what it does
  and links `docs/PERF.md`; mentions `--onnxruntime-node-install-cuda=skip` for machines where
  the CUDA download fails. Extend `test/readme-bench.test.js` (or a new test) so every
  `scripts/<file>` path in the README must exist, like the existing `bench/<file>` check. Docs
  and test only. `npm test` passes (README tests from R2 / Q6 / D3 still pass).
- **Done (2026-11-11, PR #54):** README "Development" lists the six commands plus notes on the
  CUDA-skip flag, `PUSHUP_SMOKE_NPM_ARGS` and `docs/PERF.md`. Two new tests (scripts/ paths exist;
  the section names each command) fail on the old README and pass now.

### [x] I5 — (done 2026-11-11, .github/workflows/ci.yml) CI: add Node 24 (current LTS) to the test matrix
- **Goal:** CI tests Node 20 and 22 only. Node 24 is the active LTS (Node 20 reached
  end-of-life in April 2026), so `engines: >=20.9` is unverified on the version most users
  install.
- **Accept:** `.github/workflows/ci.yml` matrix is `[20, 22, 24]`; all three `test` jobs are
  green on the PR (job names + result in the PR description). If Node 24 fails because a
  dependency has no working prebuilt (`onnxruntime-node`, `sharp`), don't work around it:
  record the failing step and error on this task and leave 24 out of the matrix. No change to
  `engines` (dropping Node 20 is an owner decision; add a note to this task if it looks due).
  Update the CI line in `PROGRESS.md`. `npm test` passes.
- **Done (2026-11-11, PR #48):** matrix `[20, 22, 24]`, all three jobs green (see PR).
  Owner note: Node 20 has been end-of-life since April 2026; raising `engines` to `>=22` and
  dropping 20 from the matrix is worth deciding (`package-lock.json` also still records
  `>=18.14`).

### [x] K1 — (done 2026-11-11, scripts/pack-smoke.sh + CI job `pack-smoke`) CI: smoke-test the packed tarball as an installed package
- **Goal:** `test/package.test.js` checks the tarball's file list, but nothing proves the
  published package works once installed (model paths resolved from `src/`, only
  `dependencies` available, no repo `node_modules`).
- **Accept:** a script `scripts/pack-smoke.sh` that runs `npm pack`, installs the `.tgz` into a
  fresh temp directory outside the repo (`npm install <tgz>`), and there runs a small Node
  script (written into the temp dir, so `require('pushup')` resolves from the installed copy,
  not the repo) that upscales a synthetic 400×300 RGB image at factor 1.5 and asserts the
  contract: resolves to `[arr_out, stride_out]` with `stride_out === 1800` and
  `arr_out.length === 600 * 450 * 3`; exits non-zero on any failure and removes its temp dir.
  A separate CI job `pack-smoke` (ubuntu, Node 22, npm cache) runs it; the existing `test` job
  is unchanged. Run it in the sandbox too and put its output in the PR (CUDA download may need
  `--onnxruntime-node-install-cuda=skip`; pass it through an env var or argument, documented
  at the top of the script). `npm test` passes and both CI jobs are green.
- **Done (2026-11-11, PR #49):** local run ~9 s (`PUSHUP_SMOKE_NPM_ARGS=--onnxruntime-node-install-cuda=skip`);
  a forced failure (`PUSHUP_QUALITY=bogus`) exits 1 and still removes the temp dir. CI results in the PR.

### [x] P3 — (done 2026-11-11, bench/threads.js + docs/PERF.md "Threads") Measure ONNX Runtime thread count vs latency (docs only)
- **Goal:** `docs/PERF.md` lists thread tuning as an open idea. Sessions use
  `intraOpNumThreads = os.availableParallelism()`; find out whether fewer threads are about as
  fast (useful when a server runs several processes).
- **Accept:** a script `bench/threads.js` that, for the `fast` model on CPU, creates one session
  per thread count in {1, 2, N/2, N} (N = `os.availableParallelism()`, duplicates removed; other
  session options as in `src/index.js`) and times `session.run` on a deterministic synthetic
  whole-image input at 400×300 and 800×600 px: median of ≥ 5 runs after 1 warm-up. It also
  reports, per thread count, whether the output bytes (after the same byte conversion as
  `src/`) equal those at N threads, and the max absolute byte difference. A section
  "Threads (P3, <date>)" in `docs/PERF.md` with the table, the machine line (CPU model, N, Node
  and `onnxruntime-node` versions) and how to run the script. No `src/` change (changing the
  default is an owner decision); if a smaller count is within 5% of N's time, write that up as a
  follow-up idea in `docs/PERF.md`. `npm test` passes.
- **Done (2026-11-11, PR #50):** near-linear scaling on 4 vCPU (1 thread ~3.2–3.6× slower, 2 threads
  ~1.8×); no count within 5% of N; bytes identical at every count. Unmeasured follow-up idea
  (several 1-thread processes for throughput) written up in `docs/PERF.md`.

### [x] S1 — (done 2026-11-10, test/models.test.js) Test: shipped model files match the hashes in `models/LICENSES.md`
- **Goal:** a corrupted or swapped `models/*.onnx` (or a stale hash in the licence file) should fail
  CI, not surface as a quality regression.
- **Accept:** `models/LICENSES.md` today records only truncated hashes of the *source* checkpoints,
  so: add the full 64-hex SHA-256 of each shipped ONNX file (`4xLSDIRCompactC3.onnx`,
  `4x_foolhardy_Remacri.onnx`) to `LICENSES.md` in a new `ONNX SHA-256` column (docs only; say so in
  the PR). A test parses that column, computes each file's SHA-256 with `node:crypto`, and compares;
  it also fails if a `.onnx` in `models/` has no recorded hash. The test must not read the truncated
  source-hash column. No model or `src/` change. `npm test` passes.

### [x] S2 — (done 2026-11-10, docs/CONTRACT_TESTS.md + test/contract-tests.test.js) Docs + check: map each contract row to the tests that cover it
- **Goal:** `CLAUDE.md` says every contract row has a test. Make that checkable.
- **Accept:** `docs/CONTRACT_TESTS.md` lists each of the four rows of the contract table in
  `CLAUDE.md` (Input, `stride`, `upscale_factor`, Output) plus the "async, one at a time" sentence
  under the table, with the test file(s) and test names that cover it; a test reads that doc and
  fails if a listed test name no longer exists in `test/*.js`. List only tests whose names are
  string literals (`test('…')`, either quote style); tests named by a template literal inside a
  loop are described in prose, not checked. Missing coverage found while writing it is added as a new test or recorded as a task
  in `TASKS.md` (do not edit `CLAUDE.md`). `npm test` passes.

### [x] S3 — (done 2026-11-10, test/bench-json.test.js) `bench/bench.js --json` machine-readable output
- **Goal:** the benchmark prints only a text table; scripts and the PR numbers would be easier to
  produce from JSON.
- **Accept:** `--json` prints exactly one JSON object `{images, rows: [{setting, psnr, ssim, gmsd,
  ms}]}` on stdout (no `images:` line or table; progress dots stay on stderr; numbers unrounded;
  rows include per-source rows when `--by-source` is also given). Without the flag the output is
  unchanged apart from the `ms` values, which vary from run to run (check on `bench/out/sub20`,
  built by `bash bench/fetch_testset.sh`, with `--sizes 400 --methods lanczos,sr-full`); usage line
  updated; the JSON run's PSNR/SSIM/GMSD, rounded to the table's 2/4/4 decimals, equal the table
  run's (ignore `ms`). `npm test` passes.

### [x] R1 — (done 2026-11-10, test/aspect.test.js) Test: extreme aspect ratios and sizes at the contract edge
- **Goal:** the contract only bounds the largest side (400–800 px); the short side can be tiny.
  Pin what happens for such inputs: they must work, never crash or return a wrong shape.
- **Accept:** tests (new file, e.g. `test/aspect.test.js`) for 800×4, 800×1, 4×800, 400×400 and
  800×800 inputs with factor 1 and 1.5. Each must resolve with `stride_out = out_width * 3`,
  `out.length = stride_out * out_height`, and each side equal to `max(1, round(side * target /
  longest))` where `target = min(round(longest * factor), 1000)` (the largest-side rule is in
  `CLAUDE.md`; the short side follows the aspect ratio, as in `src/index.js`). If an input crashes,
  returns a wrong shape, or is rejected, fix `src/` minimally *without changing the contract table
  or any default* and say so in the PR; if making it work would need a contract change, mark R1
  `[blocked]` with the exact input and error instead (owner decision) and keep the passing cases.
  `npm test` passes.

### [x] R2 — (done 2026-11-10, test/readme.test.js) Test: the README usage example runs
- **Goal:** the README's `upscale` example must not rot.
- **Accept:** a test extracts the first ```js block that calls `upscale(` from `README.md`,
  runs it against a synthetic 400×300 image with `PUSHUP_QUALITY=fast PUSHUP_DEVICE=cpu` set
  (wrap the block as `async (arr, stride, require) => { …; return [arr_out, stride_out]; }`,
  passing a `require` that maps `'pushup'` to `../src`), and checks `stride_out = 1800` and
  `arr_out.length = 1800 * 450` (factor 1.5). The test fails with a clear message if the block is
  missing. No README change unless the example is wrong (then fix it and say so). `npm test` passes.

### [x] R3 — (done 2026-11-10, test/profile-sync.test.js) Test: the parts of `bench/profile.js` that copy `src/` stay in sync
- **Goal:** `profile.js` still copies two things from `src/index.js`: the NCHW float conversion
  (`toTensor`) and the 0.8/0.2 Lanczos-mix constants (the byte conversion already uses the shipped
  `_copyFromTensor`). If `src/` changes, the profile silently measures something else.
- **Accept:** `src/index.js` gets a test-only export `_toTensor` (like the existing `_copyFromTensor`;
  no behaviour change) and `profile.js` uses it instead of its copy, and uses a mix share read from
  an export (`_MODES.fast.lanczosMix`) instead of the literal `0.2`/`0.8`. A test asserts both
  exports exist and `_toTensor` gives the expected layout on a 2×2 input. `node bench/profile.js
  --runs 1 --sizes 400` still prints its table; `npm test` passes. No change to `upscale()` output
  (existing byte-identity tests stay green).

### [x] Q1 — (done 2026-11-10, test/queue.test.js) Test: a failed call must not poison the queue, and calls run strictly in order
- **Goal:** `src/index.js` serialises calls through one promise queue. Pin that behaviour.
- **Accept:** new tests in `test/upscale.test.js`: (a) a call whose inference fails *inside the queue* (mock or wrap the session so `infer` throws;
  an out-of-range size is rejected before the queue and does not test this) followed by a valid
  call still resolves with correct output; (b) with 3 calls started
  together, inference runs one at a time and results arrive in call order (use same-size inputs, or assert order inside the stubbed `infer`; resolution order is not guaranteed for mixed sizes) (observable via a
  test hook or by wrapping the session, no sleeps); (c) `npm test` passes. No change to `src/`
  unless a test exposes a real bug (then fix it and say so in the PR) or a small test-only hook is
  needed for (a) or (b) (allowed; say so in the PR).

### [x] Q2 — (done 2026-11-10, test/input.test.js) Test: input buffer is not modified; Buffer views with `byteOffset` work
- **Goal:** callers often pass slices of a bigger `Buffer` (pooled allocations).
- **Accept:** tests that (a) a copy of the input taken before `upscale` equals the input
  afterwards (byte for byte); (b) a `Buffer` that is a slice with non-zero `byteOffset`, and a
  `Uint8Array`, give byte-identical output to a freshly allocated copy of the same pixels.
  Fix `src/` only if a test fails, and document it.

### [x] Q3 — (done 2026-11-10, see docs/PERF.md "Cold start") Measure first-call latency (session creation) and document it
- **Goal:** `docs/PERF.md` says the first call pays session creation but doesn't measure it.
- **Accept:** `bench/profile.js` (or a small new script) reports cold first-call time vs warm
  median for `fast` (CPU) and, if feasible within the run, `high` (CPU) at 400 and 800 px (each cold measurement in a fresh process, since sessions are cached per model; `high` = `PUSHUP_QUALITY=high PUSHUP_DEVICE=cpu`; ≥ 3 warm calls for `fast`, ≥ 1 warm call for `high`; if `high`
  at 800 px takes too long for the run, measure it at 400 px only and say so);
  numbers and machine in `docs/PERF.md`; one sentence on whether pre-warming would help
  (no API change). No product code.

### [x] Q4 — (done 2026-11-10) Per-source breakdown in `bench/bench.js`
- **Goal:** the set mixes Amazon (ABO) and Lamoda images; averages can hide a per-source
  regression.
- **Accept:** a `--by-source` flag adds rows grouped by file-name prefix (`abo_`, `lamoda_`) to
  the output table; output without the flag is identical to before apart from the `ms` column, which varies between
  runs (compare the `images:` line and the PSNR/SSIM/GMSD columns on `sub20` with `--sizes 400`;
  `--limit` takes the first files alphabetically, so it would only see `abo_` images); the
  `--by-source` run must show both `abo_` and `lamoda_` rows; usage line updated; the numbers for `lanczos,sr-full` at
  400 px on `sub20` go in the PR description.

### [x] Q5 — (done 2026-11-10) README "Known limits" brought up to date
- **Goal:** the section still says the SaaS comparison needs an account (T3 did it from
  published samples) and doesn't point to the texture and text research.
- **Accept:** README bullets reflect `docs/SAAS.md` (T3), `docs/TEXTURE.md` (T7) and the
  current state of text handling (if T1a is still `[ ]` on `main`, read PR #19 / branch
  `overnight/2026-11-10-T1a`: it found only 7 usable text crops, need 15; state that, claim no result); all linked paths exist; `npm test` passes (the package test
  checks the tarball).


### [x] M1 — (done 2026-11-12, bench/memory.js + docs/PERF.md "Memory") Measure peak memory (RSS) of `upscale` and document it (docs only)
- **Goal:** the README only quotes "memory around 1.6 GB" for `high` tiling (a design note, not a
  measurement); a server owner has no measured number for how much RAM one `fast` call needs at
  400 and 800 px, or how much the 67 MB `high` model adds.
- **Accept:** a script `bench/memory.js` runs each measurement in a **fresh child process**
  (like `bench/cold.js`), synthetic 4:3 image, factor 1.0 and 1.5, sizes 400 and 800, mode `fast`
  (and `high` at 400 px only, ~15 s per call); it reports peak RSS in MB (sampled
  `process.memoryUsage().rss` at ≥10 ms intervals, plus the final `process.resourceUsage().maxRSS`)
  and RSS after `require` and after the first call. `docs/PERF.md` gets a "Memory" section with the
  table, the machine line, and a sentence on what it means for running several processes. README
  "Known limits" gets one bullet linking it. No `src/` change. `npm test` passes (the README link
  must resolve).

### [x] B3 — (done 2026-11-13, bench/aspect.js + test/bench-json.test.js) `bench/bench.js --by-aspect`: per-aspect-ratio rows
- **Goal:** the set mixes portrait, square and landscape images (Q4 split by source only); a
  regression could hide in one orientation.
- **Accept:** a `--by-aspect` flag adds rows grouped by `portrait` (h > w), `landscape` (w > h)
  and `square` (equal), using the reference image's size, after the overall rows (and after the
  `--by-source` rows when both are given); output without the flag is identical to before apart
  from the `ms` column; `--json` includes the groups the same way `--by-source` does; usage line
  updated; a test in `test/bench-json.test.js` style checks the grouping function on a few
  synthetic dimensions (no model needed). Numbers for `lanczos` at 400 px on `sub20` go in the PR
  description (needs `bash bench/fetch_testset.sh`; if that fails, mark `[blocked]` with the error).

### [x] R8 — (done 2026-11-12, test/determinism.test.js) Test: output is deterministic (byte-identical across repeated calls)
- **Goal:** caching of sessions and the call queue must not make results depend on call history;
  P-tasks relied on "byte-identical" comparisons without a test that a repeated call matches.
- **Accept:** `test/determinism.test.js`: for a fixed synthetic image, `fast` mode at 400 px,
  factors 1.0 and 1.5, the same call made twice in a row, and once more after `_reset()` (fresh
  session), returns equal `arr_out` bytes each time and equal `stride_out`; a third case calls with
  an input padded by stride padding (+2 bytes) and expects the same output as the tightly packed
  input. No `src/` change. `npm test` passes. If the outputs are not identical, do not weaken the
  test: record the finding on the task and mark `[blocked]`.

### [x] DOC1 — (done 2026-11-13, README) README: replace the unmeasured "memory around 1.6 GB" and old speed figures with measured ones
- **Goal:** README line ~103 still says Remacri tiling keeps "memory around 1.6 GB" (a design note;
  `docs/PERF.md` "Memory (M1)" measured ~0.9 GB for `high` at 400 px and states 800 px is unmeasured),
  and "Known limits → Speed" says ~1 s at 400 px / ~4 s at 800 px, while `docs/PERF.md` (D4) measured 0.42 s at 400×300 and 1.8 s at 800×600
  (`fast`, 4 cores).
- **Also:** the same README paragraph says Remacri's "License: CC BY 4.0"; `CLAUDE.md` and
  `models/LICENSES.md` say CC BY-NC-SA 4.0 (non-commercial). Correct it.
- **Accept:** the statements above are reworded to match `docs/PERF.md` (numbers, mode, machine class,
  link to the section) and the licence line to `models/LICENSES.md`; nothing is claimed for `high` at 800 px beyond "not measured"; README tests
  (R2, Q6, D3, D6) still pass; docs only. `npm test` passes.

### [x] M3 — (done 2026-11-13, docs/PERF.md Memory) Measure peak memory of `high` at 800 px (docs only)
- **Goal:** M1 measured `high` at 400 px only; a server owner on a GPU-less box forcing
  `PUSHUP_QUALITY=high` has no 800 px number (the 192 px tiling should keep it near the 400 px
  figure, but this is unmeasured).
- **Accept:** `node bench/memory.js --sizes 400 --factors 1 --high-sizes 800` (the one cheap `fast`
  400 px job it also runs is fine; note `--sizes ""` does not skip `fast`, it runs size 0 and fails)
  run once on the sandbox; a row added to the `docs/PERF.md` Memory table
  with the machine line, the call duration, and one sentence on whether tiling keeps memory flat
  versus 400 px. If the call takes more than ~10 minutes, record that and the partial result
  instead. No `src/` change. `npm test` passes.

### [x] R9 — (done 2026-11-13, test/mixed-queue.test.js) Test: concurrent calls of mixed sizes return the output for their own input
- **Goal:** `queue.test.js` pins order for same-size inputs; nothing checks that results are not
  swapped or shared when calls of different sizes/factors are queued together (a shared tensor or
  output buffer bug would show only there).
- **Accept:** a new test (`test/mixed-queue.test.js`, `fast` model, thin images, short side ≤ 16, e.g. 400×12; the largest side is what the contract bounds)
  starts 4 calls together (sizes 400/500/600/400, factors 1.0/1.5/1.0/2.0, distinct pixel
  patterns) and checks each result equals, byte for byte, the result of the same call made alone
  afterwards, and has the contract size and stride (assert against the contract rule `round(side * target / longest)`, not hand-computed heights). No `src/` change unless the test exposes a real
  bug (say so in the PR). `npm test` passes.

### [x] DOC2 — (done 2026-11-13, docs/CONTRACT_TESTS.md) `docs/CONTRACT_TESTS.md`: add the tests landed since D2 (R8 determinism, R9 mixed queue)
- **Goal:** `test/determinism.test.js` (R8) and `test/mixed-queue.test.js` (R9) pin contract-relevant
  behaviour (same input → same bytes; queued calls of mixed sizes get their own outputs) but are not
  in the contract-to-tests map.
- **Accept:** list both files' tests (literal names as bullets, generated names in prose, per the
  file's format) under the matching contract rows (Output; the "async, one at a time" sentence;
  `stride` for the padded case in R8); `test/contract-tests.test.js` passes and, as a check, fails when one
  listed name is misspelt (try it locally, don't commit that). Docs only; no test or `CLAUDE.md`
  change. `npm test` passes.

### [x] R10 — (done 2026-11-13, test/batch-reject.test.js) Test: an invalid call in the middle of a batch rejects alone and does not disturb the others
- **Goal:** `queue.test.js` covers a failure *inside* the queue; nothing checks a call that is
  rejected *before* the queue (bad size, bad stride, bad factor) while valid calls are queued around it.
- **Accept:** a new test (`test/batch-reject.test.js`, `fast` model on CPU, thin images with short side
  ≤ 16) starts 3 calls with `Promise.allSettled`: valid 400 px, then an invalid one (largest side 399 →
  `RangeError`), then valid 500 px. The middle call is rejected with `RangeError`; the other two
  fulfil with the contract size and stride and bytes equal to the same calls made alone afterwards;
  a further valid call still works. Repeat with a `TypeError` trigger (stride `1.5`) in the middle.
  No `src/` change unless the test exposes a real bug (say so in the PR). `npm test` passes.

### [x] M4 — (done 2026-11-13, bench/memory-breakdown.js + docs/PERF.md) Where does `high` mode's extra memory at 800 px come from? (docs only)
- **Goal:** M3 measured `high` at 0.9 GB (400 px) and 1.5 GB (800 px), so tiling does not keep memory
  flat; the cause is an unverified guess. A server owner choosing between sizes needs to know whether
  it is the whole-image buffers (input/output float tensors) or per-tile work.
- **Accept:** a short script `bench/memory-breakdown.js` (no `src/` change; it may call `_run` and
  read `process.memoryUsage()` between stages using public/test exports only, or compute the sizes
  of the big whole-image arrays from `src/index.js` arithmetic) that prints, for `high` at 400 and
  800 px (factor 1.0, fresh child process each), RSS after `require`, after session creation (one
  call on a thin 400×12 image, since inputs under 400 px are rejected) and the peak of one full call, plus the computed byte sizes of the whole-image arrays
  (input tensor, 4× output tensor, packed output). `docs/PERF.md` "Memory" gets a short paragraph
  stating how much of the 400→800 px growth those arrays explain, and says plainly if they explain
  less than half. If the script would need a `src/` change to see stage boundaries, record that
  and stop at the arithmetic estimate. `npm test` passes.
- **Done (2026-11-13, PR #74):** the whole-image arrays explain 3% of the `high` growth; the ORT CPU
  arena explains most of it (800 px, ORT-only loop: 1.45 GB with the shipped options, 0.73 GB with
  `enableCpuMemArena: false` + `enableMemPattern: false`). **Owner decision (not a task):** whether
  to set those options for `high` (and `fast`) sessions — first measure latency and output bytes
  with the arena off (`bench/memory-breakdown.js --arena` shows only memory). No `src/` change made.

### [x] P6 — (done 2026-11-13, bench/arena.js + docs/PERF.md "Arena") Measure latency and output bytes with the ORT CPU arena off (research, no `src/` change)
- **Goal:** M4 found that the ORT CPU memory arena accounts for most of `high` mode's memory growth
  (800 px, ORT-only loop: 1.45 GB with the shipped options, 0.73 GB with `enableCpuMemArena: false` +
  `enableMemPattern: false`). Whether turning it off is acceptable depends on speed and output, which M4
  did not measure. The owner needs the numbers before deciding (no default change here).
- **Accept:** a bench-only script (e.g. `bench/arena.js`, session options taken from `_sessionOptions`
  with the two flags added; the model call only, like `bench/threads.js`) that, for the `fast` model at
  400×300 and 800×600 and the `high` model at 400×300, in fresh processes, reports for arena on / off:
  median `session.run` time (≥ 5 runs after 1 warm-up; one tile loop for `high`), max RSS, and whether the
  output tensors are byte-identical after the same byte conversion as `src/` (`_copyFromTensor`), with the max
  absolute byte difference. A section "Arena (P6, <date>)" in `docs/PERF.md` with the table, machine line
  and how to run, and a plain sentence on whether the arena-off option looks free, costly or lossy.
  No `src/` change and no recommendation to change a default (owner decision). `npm test` passes.
- **Done (2026-11-13, PR #77):** `bench/arena.js` + `docs/PERF.md` "Arena (P6)". Arena off is lossless (bytes
  identical, max diff 0, all 3 cases) but costly: model call 1.2x (`high` 400 px) to 1.75-1.86x (`fast` 800 px)
  slower, peak RSS ~40% lower at 800 px `fast` / 400 px `high`. Owner decision (no change made).

### [x] R11 — (done 2026-11-13, test/batch-reject.test.js) Test: a bad `upscale_factor` or `arr` type mid-batch rejects alone (extends R10)
- **Goal:** R10 covered a bad size (RangeError) and bad stride (TypeError) rejected before the queue; the
  other two pre-queue checks (factor, `arr` type) are untested in a batch.
- **Accept:** extend `test/batch-reject.test.js` (same helper, same checks: the valid neighbours keep
  contract size/stride and bytes equal to solo calls, a later call still works) with `upscale_factor = 0`
  (RangeError) and `arr` = a string (TypeError) in the middle call. No `src/` change unless a test
  exposes a real bug (say so in the PR). `npm test` passes.

### [x] DOC3 — (done 2026-11-14, README Known limits) README "Known limits → Memory": say that memory is retained and what drives `high`'s growth
- **Goal:** the bullet gives only peak numbers; M3/M4 found that a `high` process keeps ~1.5 GB at 800 px
  after a call, that the ORT arena (not the image arrays) drives the growth, and that a second call
  creeps up a little.
- **Accept:** the bullet (and nothing else in the README) gets one or two sentences saying: memory is
  not returned between calls; `high` grows with input size mainly (not only) because of the ONNX Runtime
  arena; budget ~1.5 GB per `high` process at 800 px; link to `docs/PERF.md` "`high` memory breakdown
  (M4)" (the link must resolve). Wording matches `docs/PERF.md`; no recommendation to change
  settings. README tests (R2, Q6, D3, D6) still pass; docs only. `npm test` passes.

### [x] DOC4 — (done 2026-11-14, docs/CONTRACT_TESTS.md) `docs/CONTRACT_TESTS.md`: add the batch-reject tests (R10, R11)
- **Goal:** `test/batch-reject.test.js` pins that an invalid call (size, stride, factor, `arr` type)
  rejects alone while valid calls queued around it keep their own results; the file isn't in the
  contract-to-tests map (0 mentions).
- **Accept:** list the file's tests (literal names as bullets, generated names in prose, per the
  file's format) under the matching rows (Input / `stride` / `upscale_factor` error rows and the
  "async, one at a time" sentence); `test/contract-tests.test.js` passes and, as a check, fails when
  one listed name is misspelt (try it locally, don't commit that). Docs only; no test or
  `CLAUDE.md` change. `npm test` passes.

### [x] R12 — (done 2026-11-14, test/session-retry.test.js) Test: a failed session creation is not cached (the next call retries)
- **Goal:** `getSession` in `src/index.js` deletes a rejected session promise from `cpuSessions`
  (`p.catch(() => cpuSessions.delete(modelPath))`). No test shows that a later call recovers
  (nothing in `test/` touches that path).
- **Accept:** a new test (`test/session-retry.test.js`, same stubbing style as
  `test/device.test.js`, `fast` model on CPU, thin image 400×12): the first `ort.InferenceSession.create`
  call for the CPU session rejects, so `upscale` rejects; the next `upscale` call calls `create` again
  and resolves with the contract size and stride and bytes equal to a run without any stub. Restore
  the stub and call `_reset()` afterwards. No `src/` change unless the test exposes a real bug (say so
  in the PR). `npm test` passes.

### [x] R13 — (done 2026-11-14, test/env-per-call.test.js) Test: the env settings are read on every call, not once
- **Goal:** `CLAUDE.md` says the mode is "chosen per call" from `PUSHUP_QUALITY` / `PUSHUP_DEVICE`.
  `test/device-fallback.test.js` (lines ~89–109) already switches `PUSHUP_QUALITY` between calls
  and compares output bytes, but no test asserts *which model session is created or reused*.
- **Accept:** first search `test/*.js` for a test that already asserts the created/reused session
  per call; if one does, close R13 with a note naming it. Otherwise add `test/env-per-call.test.js` (400×12 images, wrap
  `InferenceSession.create` to record the model path (as `test/device.test.js` does) and make the
  `high` create reject or return a stub session, so the real 67 MB model never runs): with
  `PUSHUP_DEVICE=cpu`, a call with `PUSHUP_QUALITY=fast` creates a session for `_MODES.fast.modelPath`,
  then a call with `PUSHUP_QUALITY=high` creates one for `_MODES.high.modelPath`, then `fast` again
  reuses the cached fast session (no new `create`). Restore env and `_reset()` afterwards. No `src/`
  change unless the test exposes a real bug. `npm test` passes.

### [x] DOC5 — (done 2026-11-14, docs/PERF.md Follow-up ideas) `docs/PERF.md` "Follow-up ideas": add the arena result (P6)
- **Goal:** the "Follow-up ideas" list ends at the throughput idea; M4/P6 produced a second idea
  (turn the ONNX Runtime CPU arena off to cut `high`/`fast` memory) whose numbers sit in "Arena (P6)"
  and aren't linked from there.
- **Accept:** one new bullet in "Follow-up ideas" that states what the idea is, the measured result in
  one sentence (bytes identical; arena off 1.2×–1.8× slower; peak RSS about 40% lower at 800 px `fast` and 400 px `high`; numbers copied
  from the "Arena (P6)" table, not new runs), that changing the session options is an owner decision,
  and links "Arena (P6, 2026-11-13)" and "`high` memory breakdown (M4)". No numbers that aren't in
  those sections. Docs only. `npm test` passes.

### [x] R14 — (done 2026-11-14, test/tiny-factor.test.js) Test: a tiny `upscale_factor` gives a 1-pixel largest side, not an empty image
- **Goal:** `src/index.js` clamps the target with `Math.max(1, …)`, so `upscale(400 px image, …, 0.001)`
  returns a 1×1 image (observed 2026-11-14: stride 3, 3 bytes) whereas the `CLAUDE.md` formula
  `min(round(input_largest * factor), 1000)` would give 0. `test/aspect.test.js` covers `0.4` on a 1 px
  side, but nothing covers a factor so small that the *largest* side rounds to 0.
- **Accept:** a new test (`test/tiny-factor.test.js`, `fast` model on CPU, thin image 400×12) pins today's
  behaviour: factors `0.001`, `0.00124` (round(400 × f) = 0) and `Number.MIN_VALUE` resolve with
  `stride_out = out_width * 3`, `out.length = stride_out * out_height`, `out_width = 1` and
  `out_height = 1`; and factor `0.0025` (round(400 × f) = 1) gives the same 1×1 shape. No `src/` change and no
  contract change. Add a note on this task (not to `CLAUDE.md`, which is an owner file) that the formula
  in `CLAUDE.md` says 0 for these inputs while the code returns 1, for the owner to decide whether
  the contract text should mention the floor. `npm test` passes.
- **Done (2026-11-14, PR #85):** `test/tiny-factor.test.js` pins factors `0.001`, `0.00124`, `Number.MIN_VALUE`
  and `0.0025` on a 400×12 input: all give a 1×1 image (`stride_out` 3, 3 bytes). No `src/` bug. Mutation
  check: removing the `Math.max(1, …)` on `outH` makes it fail (sharp rejects a 0 height); removing it
  on `target` alone changes nothing (the per-side floors still give 1×1).
- **Owner note (no change made):** the `CLAUDE.md` contract formula `min(round(input_largest * factor), 1000)`
  gives 0 for these factors, while the code floors every side at 1 (so the output largest side is 1, not 0). Whether
  the contract text or the README should mention the floor is the owner's call.


### [x] DOC6 — (done 2026-11-14, README Development + test/readme-bench.test.js) README "Development": list every runnable `bench/` script, with a test that keeps it so
- **Goal:** the README names `bench/profile.js`, `cold.js`, `threads.js`, `bench.js`, `gate.js` and
  `fetch_testset.sh`, but not `bench/memory.js`, `memory-breakdown.js`, `throughput.js` and `arena.js`
  (0 mentions each, checked 2026-11-14); `bench/metrics.js` and `bench/aspect.js` are library modules (no
  command line).
- **Accept:** README "Development" gets one line per missing script (command, one phrase on what it
  measures, as the existing lines do), pointing to the `docs/PERF.md` section that has its results
  ("Memory", "Throughput", "Arena (P6)"; the links must resolve). Extend `test/readme-bench.test.js` (or a
  new test): every `bench/*.js` file that has a `Usage:` comment line near its top must be named in
  README.md by its full path `bench/<name>.js` (a bare word like "arena" in prose does not count); `bench/metrics.js` and `bench/aspect.js` are exempt, listed in the test with the reason. The test fails on the
  current README and passes after. Docs and test only; README tests R2 / Q6 / D3 / D6 still pass; the
  README must not gain a ```js block calling `upscale(`. `npm test` passes.

### [x] M5 — (done 2026-11-14, bench/memory-creep.js + docs/PERF.md "Memory") Measure whether `fast` mode's memory creeps up over repeated calls (docs only)
- **Goal:** M4 saw a second `high` call raise RSS a little (1459 → 1521 MB), measured ad hoc. A server
  that runs `fast` for days needs to know whether memory stays flat over many calls; unmeasured.
- **Accept:** a bench-only script `bench/memory-creep.js` (no `src/` change; fresh process; public
  `upscale` on a synthetic 800×600 image at factor 1.0; `PUSHUP_QUALITY=fast PUSHUP_DEVICE=cpu`) that makes
  `--calls` (default 30) sequential calls and prints RSS after calls 1, 2, 5, 10, 20 and the last, plus the
  max RSS, in MB. A paragraph in `docs/PERF.md` "Memory" with the table, the machine line, how to run, and
  one plain sentence: flat (RSS after the last call within 5% of RSS after call 5), creeping (more than that;
  give MB per call), or unclear. If the process grows without bound (> 2× RSS after call 5), say so and add an
  owner note on this task; do not change `src/`. Run it twice and report both. About 1 minute per run. `npm test` passes.
- **Done (2026-11-14, PR #87):** two runs of 30 calls at 800×600: flat (call 30 within 1% of call 5), but
  RSS steps from ~0.5 GB after call 1 to ~0.93 GB after call 2 and stays there (max RSS ~1.03 GB).
- **Follow-up for the next BACKLOG (not done here, README outside M5's scope):** README "Known limits →
  Memory" says one `fast` call peaks at about 0.57 GB at 800 px; a process that has handled two or more calls
  sits at ~0.93 GB. Reword with the steady-state number and link "Does `fast` mode creep" in `docs/PERF.md`.

### [x] DOC7 — (done 2026-11-14, README Known limits Memory) README "Known limits → Memory": say what a `fast` process uses after more than one call
- **Goal:** M5 (`docs/PERF.md` "Does `fast` mode creep over repeated calls? (M5, 2026-11-14)") found that RSS after the
  first `fast` call at 800 px is ~0.5 GB, after the second ~0.91 GB, and then stays flat at ~0.93 GB (max RSS ~1.03 GB).
  The README bullet quotes only the single-call figure (0.2 GB at 400 px to 0.57 GB at 800 px), which understates
  what a server process holds.
- **Accept:** the README Memory bullet (and nothing else in the README) gets one or two sentences: a `fast`
  process that has made two or more calls at 800 px holds about 0.93 GB (about 1 GB peak), flat afterwards (no
  creep over 30 calls); only 800×600 was measured (say so; the 400 px steady state is M6); link to the M5
  subsection (the anchor must resolve). Numbers equal those in `docs/PERF.md`; no recommendation to change settings.
  README tests (R2, Q6, D3, D6, DOC6) still pass; docs only. `npm test` passes.

### [x] M6 — (done 2026-11-14, docs/PERF.md Memory) Steady-state memory of `fast` at 400 and 600 px (docs only; run after M5)
- **Goal:** M5 measured only 800×600. DOC7 and server sizing need the settled RSS at the smaller sizes too.
- **Accept:** run `node bench/memory-creep.js --size 400` and `--size 600` twice each (about 30 s per run;
  no script change unless a run shows `--size` is broken), put the RSS after calls 1, 2, 5, 10, 20, 30 and max RSS in
  a table in the M5 subsection of `docs/PERF.md` (same machine line), and one plain sentence per size: does the call-2
  warm-up step also appear, and is it flat after it (call 30 within 5% of call 5)? No `src/` change. `npm test` passes.
- **Done (2026-11-14, PR #90):** the call-2 step appears at both sizes. 600 px settles at ~0.61 GB (flat, within 0.2%). 400 px settles at ~0.37–0.39 GB, but run 2 ended 7.2% above call 5 (over the 5% limit; rise stops by call 10–20), so it is borderline, not flat by the rule. A cheap follow-up would be more 400 px runs.

### [x] M7 — (done 2026-11-14, bench/memory-creep.js --arena + docs/PERF.md) Is the call-2 memory step the ONNX Runtime arena? (research, bench-only, no `src/` change; run after M5)
- **Goal:** M5 left the cause of the ~0.4 GB rise between call 1 and call 2 unexplained; M4/P6 showed the arena
  matters for `high`. Check it for `fast` before anyone guesses.
- **Accept:** `bench/memory-creep.js` gets an `--arena off` option (default `on`, behaviour unchanged) that wraps
  `ort.InferenceSession.create` in that process so the CPU session options also get `enableCpuMemArena: false` and
  `enableMemPattern: false` (bench-only, like `bench/arena.js`; no `src/` change; usage line updated). Run
  `--calls 30` at 800×600 twice with `--arena off`. Add the RSS rows after calls 1, 2, 5, 10, 20, 30, max RSS and median
  call time next to the M5 table in `docs/PERF.md`, with one plain sentence: with the arena off, does the step after
  call 1 disappear, shrink, or stay (and what does the median call time do)? No recommendation to change a default
  (owner decision). The README bench list (DOC6 test) still names the script. `npm test` passes.
- **Done (2026-11-14, PR #91):** `--arena on|off` added to `bench/memory-creep.js`. With the arena off the call-2 step disappears (222 → 231 MB; settles ~0.26 GB, max RSS 0.60 GB vs 0.93/1.03 GB); median call ~3.2 s vs ~2.0 s (~1.65×). The step is the arena. Owner decision (no change made).



### [x] M8 — (done 2026-11-14, docs/PERF.md Memory) More `fast` 400 px runs: is the steady state flat or does it creep? (docs only)
- **Goal:** M6 ran 400×300 twice: call 30 was 2.7% and 7.2% above call 5 (5% rule), so "flat" is unclear
  at that size (600 and 800 px are flat). Two runs are too few to tell noise from a slow rise.
- **Accept:** run `node bench/memory-creep.js --size 400 --calls 100` three times (about 45 s each; the
  script's table marks 1, 2, 5, 10, 20 and the last call, so with `--calls 100` the last mark is call 100).
  In the M6 bullets of `docs/PERF.md` "Memory" add a row per run (RSS after calls 1, 2, 5, 10, 20, 100, max RSS) and one plain
  sentence: flat (call 100 within 5% of call 20 in all three runs), creeping (give MB per call from the three runs), or
  unclear. If any run ends more than 2× the RSS of call 5, add an owner note on this task. No `src/` or script change.
  `npm test` passes.
- **Done (2026-11-14, PR #93):** three 100-call runs at 400×300: call 100 vs call 20 is +1.9%, +4.9%, +0.5%, so flat by the rule (run 2 close to the limit); settles ~0.37–0.39 GB. No owner note needed (no run above 2× call 5). DOC8 can use ~0.37–0.39 GB.

### [x] DOC8 — (done 2026-11-14, README Known limits Memory) README "Known limits → Memory": add the 400/600 px steady state and the arena finding
- **Goal:** after DOC7 the README bullet gives the 800 px steady state only. M6 measured 400 and 600 px, and M7
  found the call-2 step is the ONNX Runtime arena (`docs/PERF.md`, "Is the call-2 step the ONNX Runtime arena? (M7)").
- **Accept:** the README Memory bullet (and nothing else in the README) gets one or two more sentences: a
  `fast` process that has made two or more calls settles at about 0.37–0.39 GB (400 px) and 0.61 GB (600 px), and
  the step after the first call comes from the ONNX Runtime arena; link the M7 paragraph and the M6 text (anchors must
  resolve; if the M7/M6 text sits under the M5 heading, link that heading). Numbers equal those in `docs/PERF.md`; no
  recommendation to change settings (owner decision). If M8 landed first and changed the 400 px figure, use its
  numbers. README tests (R2, Q6, D3, D6, DOC6) still pass; docs only. `npm test` passes.

### [x] DOC9 — (done 2026-11-14, docs/PERF.md Follow-up ideas) `docs/PERF.md` "Follow-up ideas": add the M7 result to the arena bullet
- **Goal:** the arena bullet in "Follow-up ideas" (from DOC5) cites `high` and `fast` numbers from M4/P6 but not that M7
  traced `fast` mode's call-2 memory step to the arena (arena off: 0.26 GB settled vs 0.93 GB; median call about 1.65× slower).
- **Accept:** one added sentence on that bullet with the M7 numbers, copied from the M7 paragraph (no new runs), and a link to
  it (anchor must resolve; it sits under the M5 heading). The bullet still says changing the session options is an owner
  decision. Docs only. `npm test` passes.

### [x] DOC10 — (done 2026-11-14, docs/OWNER_DECISIONS.md) `docs/OWNER_DECISIONS.md`: one list of what is waiting for the owner
- **Goal:** owner decisions are scattered over `TASKS.md` task notes, `docs/PERF.md` and `docs/DECISIONS.md`; the owner has to
  read the whole backlog to find them.
- **Accept:** a new file `docs/OWNER_DECISIONS.md` with one short entry per open decision, each with a link to where the
  evidence is (links to files must resolve; name `TASKS.md` tasks by their ID instead of an anchor): T8 (UltraSharpV2-Lite as `high`), T1a (protocol choice (a) or (b)), T3c (vendor hosts for
  the network allowlist), raising `engines` to `>=22` (I5 note), a thread/process setting (D15), turning the ORT arena off
  (M4, P6, M7), and whether the contract text should mention the 1 px floor for tiny factors (R14 note). One line each on what
  the owner would need to say to unblock it. No decision is made in the file, no change to `CLAUDE.md`, the playbook or `.claude/`.
  The package tarball test (`test/package.test.js`) still passes (docs/ is not shipped). Docs only. `npm test` passes.

### [x] R15 — (done 2026-11-14, test/memory-creep-args.test.js) Test: `bench/memory-creep.js` rejects bad `--arena` / `--calls` values with a clear error
- **Goal:** M7 added `--arena` validation that throws at the top level of the script (a stack trace on stdout/stderr,
  exit code 1). Nothing tests the argument checks of the bench scripts' flags, so a refactor could silently drop them.
- **Accept:** a new test (`test/memory-creep-args.test.js`) spawns `node bench/memory-creep.js` with `--arena bogus`, `--calls 3`
  and `--calls abc` and asserts each exits non-zero within a few seconds and that stderr names the flag (`--arena`, `--calls`);
  it must not start the model (no `upscale` call happens: assert it ends in under 5 s). Today the `--arena` check is a top-level `throw`, so stderr starts with a file:line and source excerpt, not the
  message: make the minimal change in `bench/memory-creep.js` so the first stderr line of each rejected run is a one-line message
  naming the flag, and assert that first line in the test (bench file only, no `src/` change; say so in the PR; `--size` has no
  validation and is out of scope). `npm test` passes.
- **Done (2026-11-14, PR #97):** `test/memory-creep-args.test.js` (3 cases, ~0.3 s each) asserts exit 1, the exact one-line first stderr line naming the flag, and < 5 s. `bench/memory-creep.js` changed (bench file only, no `src/`): flag errors now print one line via a small `fail()` instead of a stack trace. Against the old script the 3 tests fail.

### [x] M9 — (done 2026-11-14, docs/PERF.md Memory) Is the call-2 memory step also the arena at 400 and 600 px? (research, bench-only, no `src/` change)
- **Goal:** M7 traced the `fast` call-2 step to the ONNX Runtime arena at 800×600 only; the README (DOC8) says the same step
  at 400 and 600 px "was not tested with the arena off". Close that gap.
- **Accept:** run `node bench/memory-creep.js --arena off --size 400` and `--size 600`, twice each (about 30 s per run), no script
  change. Add a table next to the M7 table in `docs/PERF.md` (RSS after calls 1, 2, 5, 10, 20, 30, max RSS, median call time) and one
  plain sentence per size: does the step after call 1 disappear (call 2 within 15% of call 1), and what does the median call time do
  against the arena-on rows of M6? No recommendation to change a default (owner decision). `npm test` passes.
- **Done (2026-11-14, PR #99):** 600 px: call 2 is steady at 177 MB with the arena off (call 1 varied 122–172 MB, so the literal 15% test passes in 1 of 2 runs); settled ~0.19 GB vs 0.61 GB; median ~1.9× slower. 400 px: the step shrinks but stays (call 2 +25% over call 1 in both runs; settled 0.20–0.23 GB vs 0.37–0.39 GB; median ~1.2–1.6× slower). DOC11 must say that, not "confirmed at both sizes", and must not quote a firm 400 px settled saving (check runs settled at 0.20–0.39 GB with the arena off).

### [x] DOC11 — (done 2026-11-14, README Known limits Memory) README "Known limits → Memory": say whether the arena step was confirmed at 400 and 600 px (after M9)
- **Goal:** DOC8 left the README saying the arena cause was traced at 800 px only; M9 produces the 400 and 600 px answer.
- **Accept:** only after M9 is merged: the README Memory bullet (and nothing else in the README) replaces the clause "the same step appears at
  400 and 600 px, not tested with the arena off" by what M9 found (one sentence, numbers equal those in `docs/PERF.md`; if M9 found
  the step does not disappear at a size, say that instead). No recommendation to change settings. README tests (R2, Q6, D3, D6, DOC6) still
  pass; docs only. `npm test` passes. If M9 is not merged, mark this task `[blocked]` on M9 and move on.

### [x] Q9 — (done 2026-11-14, bench/memory-creep.js + test/memory-creep-args.test.js) `bench/memory-creep.js`: validate `--size` against the contract range (400–800)
- **Goal:** R15 left `--size` unvalidated; `--size 10` or `--size abc` fails later with an unrelated error from `upscale` or `Buffer.alloc`
  (a `RangeError` from the contract bounds, or a crash on `NaN`), after the flag parsing.
- **Accept:** `bench/memory-creep.js` rejects a `--size` that is not an integer in 400–800 with a one-line message naming the flag
  (through the existing `fail()` helper, first stderr line `--size must be an integer from 400 to 800`) and exit 1, before the model is
  loaded; the usage line mentions the range. Extend `test/memory-creep-args.test.js` with `--size 399`, `--size 801` and `--size abc` (exact first
  stderr line, exit 1, under 5 s) and one valid-size case that is not run to completion (e.g. assert that `--size 400 --calls 3` fails on `--calls`, not on
  `--size`). No `src/` change; bench file and its test only. `npm test` passes.
- **Done (2026-11-14, PR #101):** `--size` must match `^\d+$` and be 400–800, else one line `--size must be an integer from 400 to 800` and exit 1 before the model loads (so `4e2`, `400.5`, a missing value and `abc` are rejected too). Test file now has 7 cases (4 new); against the old script the 3 `--size` cases fail. Bench file and test only, no `src/`.

### [x] DOC12 — (done 2026-11-14, docs/PERF.md Memory summary) `docs/PERF.md`: one summary table of settled memory (RSS) per mode and size, linking the detail sections
- **Goal:** the memory numbers are spread over M1, M3, M4, M5, M6, M7 and M8 paragraphs; a server owner sizing a box has to read all of them.
- **Accept:** a new subsection "Summary: settled RSS" at the top of "Memory" in `docs/PERF.md` with one table (rows: `fast` 400×300, 600×450, 800×600 with the
  arena on; `fast` 800×600 with the arena off; `high` 400×300 and 800×600 with the arena on) giving the first-call RSS, the settled RSS (after the
  second call or later) and max RSS in MB, each cell copied from an existing table (no new runs; a cell with no measurement says "not measured"), and
  a link per row to the section it comes from (anchors must resolve; M6, M7 and M8 sit under the M5 heading, so link that). Source rule, so cells do not mix runs: first-call RSS = the "after call 1" cell and settled RSS = the "call 30" cell of run 1 of the multi-call tables (`fast` 400×300 and 600×450: M6; 800×600: M5; arena off 800×600: M7), max RSS from that same run; if M9 has merged, add its arena-off rows for 400×300 and 600×450 the same way (run 1); `high` rows take first-call, settled (the "RSS after the call" cell) and max RSS from the M4 table (`high` 400×300 settled = "not measured" if the M4 table has no second call). Say in one line under the table which section each column was taken from. One plain sentence on what the table does not cover (other shapes, other machines).
  No README, `src/` or `CLAUDE.md` change. `npm test` passes.
- **Done (2026-11-14, PR #102):** "Summary: settled RSS" added at the top of "Memory" in `docs/PERF.md`. Reading of the source rule: the M4 "RSS after the call" cell is one call per process, so it is shown as First call and `high` Settled is "not measured" in both rows (an ad-hoc second call quoted in the M4 text is a different process, so it is not used).

### [x] BK1 — (done 2026-11-14, test/tiling.test.js) Test: tiled inference matches whole-image inference (no visible seams)
- **Goal:** `high` mode runs 192 px tiles with 16 px padding. `test/convert.test.js` (tile test, `tilePad: 1000`, 400×300) only shows that tiling with a huge pad equals the whole frame. The shipped pad, sizes that are not a multiple of the tile, and the seams themselves are not tested. Check on the real `fast` model, which is cheap.
- **Accept:** a new file `test/tiling.test.js` using `_run` with `lanczosMix: 0` on a 401×301 and a 400×400 synthetic gradient-plus-noise image (fixed seed): once with `tile: Infinity`, once with `tile: 192` and the shipped pad (16). Assert same output size, mean absolute byte difference below a threshold, and largest per-pixel difference below a second threshold. Measure first, then set each threshold to about 2× the measured value and state the measured numbers in a comment. Also assert the mean absolute difference on the 4 px either side of each tile seam is at most 2× the mean difference elsewhere. No `src/` change. `npm test` passes and takes under 2 minutes more than now.
- **Done (2026-11-14, PR #104):** `test/tiling.test.js`, factor 2.5 (4x output resized to 1000 px), seams at multiples of 192 input px mapped to output px. Measured mean/max diff 0.00136/2 (401×301) and 0.00115/1 (400×400); thresholds 0.003 / 4. Deviation from the Accept line: the seam-vs-elsewhere ratio check cannot work (seam mean 0.05 vs 0.00017 elsewhere, 300×), so the seam mean has an absolute bound of 0.1 instead. A run with `tilePad: 0` fails the test (mean diff 0.85–0.97), so it detects lost context.

### [x] BK2 — (done 2026-11-14, test/arr-types.test.js) Test: a `SharedArrayBuffer`-backed `Uint8Array` is accepted
- **Goal:** `upscale()` accepts any `Uint8Array` (`Buffer` slices are tested in `test/input.test.js`; `Uint8ClampedArray` and other typed arrays are rejected on purpose, pinned in `test/arr-types.test.js`). A `Uint8Array` over a `SharedArrayBuffer` (e.g. from a worker) passes the `instanceof` check but is not tested, and `sharp` may reject it.
- **Accept:** a test in `test/arr-types.test.js` builds a 400×300 image in a `SharedArrayBuffer`-backed `Uint8Array` and asserts that `upscale()` resolves with the same bytes as for a plain `Uint8Array` copy. If `sharp` rejects it, the fix in `src/index.js` is a copy only for views whose `buffer` is a `SharedArrayBuffer`; the tightly-packed no-copy path must stay for ordinary buffers (assert this too if `packRows` is reachable through `_run`). README "Input" wording changes only if the accepted types change. `npm test` passes.
- **Done (2026-11-14, PR #105):** test added; it passes with no `src/` change (`sharp` accepts a `SharedArrayBuffer`-backed `Uint8Array`, also at a byteOffset), so no copy was added. The test uses the file's tiny 400×4 image (largest side 400, valid) instead of 400×300; the byte comparison is the same. The optional `packRows` no-copy assertion was dropped: `packRows` is not exported.

### [x] BK3 — (done 2026-11-14, test/queue.test.js) Test: good / failing / good calls started together (extend `queue.test.js`)
- **Goal:** `test/queue.test.js` ("an inference that fails inside the queue does not poison later calls") has the failing call first and checks sizes only. Not covered: a failure in the middle, and output bytes.
- **Accept:** one new test in `test/queue.test.js`, using the existing `withSessionHook`: three calls started together (good, failing via the hook's thrown error, good). The middle call rejects with that error; both good calls resolve with outputs byte-identical to the same inputs upscaled alone afterwards. No new file, no `src/` change. `npm test` passes.
- **Done (2026-11-14, PR #106):** one test added to `test/queue.test.js`: good / failing (hook throws on the 2nd model run) / good started together; the middle call rejects with the hook's error, the other two resolve with bytes identical to the same inputs upscaled alone. No `src/` change.

### [x] BK4 — (done 2026-11-15, test/extremes.test.js) Test: flat extremes and channel order survive (white, black, pure R/G/B) at factor 1 and 1.5
- **Goal:** white-background product shots are the main e-commerce case. `test/upscale.test.js` ("output colours stay close to input") only checks the mean of a mid-tone image, so a white haze, clipped blacks, or swapped R/B channels would pass. Pin them on the real `fast` model.
- **Accept:** a new file `test/extremes.test.js`, 400×300 images (largest side 400), each uniform: white (255,255,255), black (0,0,0), pure red, pure green, pure blue, each at factors 1 and 1.5. Assert output size per the contract and that every output byte is within a tolerance of the input colour on each channel (so R stays in the R slot). Also one image that is half white, half black (left/right), asserting the far-from-edge columns (> 20 px from the seam) stay within the same tolerance. Use one tolerance **per colour**, not one for all: measure each (colour, factor) case first and set its tolerance to the larger of 2× its maximum measured deviation and 2, with the measured numbers in a comment. Measured by the adversary on 2026-11-15 (max per-byte deviation, factor 1 / 1.5): white 3/3, black 1/2, red 7/10, green 26/29, blue 19/24, half white/half black away from the seam 3/3. White and black must stay tight (tolerance ≤ 8), because a white haze is what the test is for; if white or black measures above 6, don't loosen the test: record the deviation on the task and keep that case as a `todo` with the number. Also record in the PR that green and blue shift by about 20–30 (a colour-fidelity finding, not a failure of this task). No `src/` change. `npm test` passes and the file adds under 30 s.
- **Done (2026-11-15, PR #108):** `test/extremes.test.js`, 12 tests, ~5 s. Measured max per-byte deviation (factor 1 / 1.5) matched the adversary's: white 3/3, black 1/2, red 7/10, green 26/29, blue 19/24, split 3/3; per-case tolerances = 2× measured (min 2): white 6/6, black 2/4, red 14/20, green 52/58, blue 38/48, split 6. White and black are within the cap, so no `todo`. Finding: flat green and blue shift by 20–30 bytes (the model's colour fidelity on saturated flats); not a test failure. No `src/` change.

### [x] BK5 — (done 2026-11-15, test/downscale.test.js) Test: factor below 1 gives a picture close to a plain Lanczos downscale (content, not only size)
- **Goal:** `test/upscale.test.js` and `test/aspect.test.js` pin the output *size* for factor < 1, not the content. A bug in the 4×-then-down path (wrong kernel, shift by a pixel, wrong crop) would keep the size right.
- **Accept:** a new file `test/downscale.test.js`: a 800×600 synthetic image (smooth gradients plus a few hard-edged rectangles, fixed seed), factors 0.5 and 0.9, `fast` mode. Reference = `sharp(input).resize(outW, outH, { kernel: 'lanczos3' })` raw bytes. The mean absolute difference is over all bytes and channels. The 1 px shift assertion is the real guard (a threshold at 2× the measured value, about 4, would let a shifted output through): the mean difference against the reference shifted by 1 px in x must be larger than the unshifted one, at both factors (measured 2026-11-15: 2.09 vs 2.53 at 0.5, 2.10 vs 2.31 at 0.9; margin about 10% at 0.9, so keep the hard-edged rectangles). Also assert the unshifted mean difference is below a threshold set at about 2× the measured value (numbers in a comment). No `src/` change. `npm test` passes and the file adds under 30 s.
- **Done (2026-11-15, PR #109):** `test/downscale.test.js`, 2 tests (~2 s). 800×600 gradient + 3 hard-edged rectangles, `fast` model, factors 0.5 and 0.9 vs `sharp` lanczos3. Mean abs difference over all bytes, unshifted / shifted by 1 px: 0.5 → 2.150 / 2.610; 0.9 → 2.164 / 2.393. Bound on the unshifted value 4.4 (≈2×); the shift assertion (shifted > unshifted, compared over the shared columns) is the real guard. Pins `PUSHUP_QUALITY=fast` / `PUSHUP_DEVICE=cpu` like the sibling tests. Limit (reviewer mutation check): the 4.4 bound (≈2× measured, as the task asks) does not catch a kernel swap to `nearest`/`linear` in `resizeRaw`; only the 1 px shift is caught. A tighter bound would need a measured per-kernel gap (follow-up if wanted). No `src/` change.

### [x] BK6 — (done 2026-11-15, README Quality modes and GPU + test/readme-env.test.js) Docs: list every env variable in README "Configuration" with a test that keeps it true
- **Goal:** `PUSHUP_QUALITY` and `PUSHUP_DEVICE` are documented in README "Quality modes and GPU" (and read in `src/` through `readSetting('<NAME>', ...)`, not `process.env.<NAME>`); the other variables that `bench/`, `scripts/` and CI read (`P4_THREADS`, `P4_SIZE`, `P5_CHILD_INDEX`, `P5_FAIL_CHILD`, `PUSHUP_SMOKE_NPM_ARGS`) are not in one place.
- **Accept:** add a "Configuration" table to the README (one table; if the existing text at "Quality modes and GPU" has a table of the two settings, extend that one instead of adding a second): variable, allowed values, default, read by (`src`, a named `bench/` or `scripts/` file, or CI), and a note for the bench-internal child-process variables (`P5_*`, `P4_*`: set by `bench/throughput.js` itself, not for users). A test `test/readme-env.test.js` collects names with these patterns over `src`, `bench`, `scripts`, `tools`, `.github/workflows`: `process.env.NAME`, `process.env['NAME']`, `readSetting('NAME'`, `$NAME` / `${NAME}` / `NAME:` in `.sh` and `.yml` files, restricted to names starting with `PUSHUP_`, `P4_` or `P5_` (for `.sh`, match `${NAME`, `$NAME` and `NAME:`). The test reads the README table under the heading "Quality modes and GPU" (or the new "Configuration" heading if the table is moved there; name which in the test), not the "Errors" table. It fails if a collected name is missing from the README table or the table lists a name that nobody reads. No change to what `src/` reads. Don't add a ```js block calling `upscale(` before the usage example (R2's test reads the first one). `npm test` passes (README tests from R2, Q6, DOC6 still pass).
- **Done (2026-11-15, PR #110):** the existing two-row table under "Quality modes and GPU" got a "Read by" column and rows for `PUSHUP_SMOKE_NPM_ARGS` and the bench-internal `P4_*`/`P5_*`. `test/readme-env.test.js` scans `src`, `bench`, `scripts`, `tools`, `.github/workflows` with the task's patterns (7 names found) and compares with that table's first column; mutation checks (row removed, ghost name added) both fail it. No `src/` change.

### [x] BK7 — (done 2026-11-15, bench/edges.js + docs/EDGES.md) Research: ringing and halos on hard edges in `fast` mode (docs only)
- **Goal:** product photos have hard edges (garment on white, text, thin lines). Show whether the model produces dark/bright halos next to them, which the sub20 metrics would not isolate.
- **Accept:** a script `bench/edges.js` that builds synthetic 400×300 images with **mid-level** values (dark 40, light 215, so that overshoot is not hidden by the 0/255 clamp of the output bytes): (1) a vertical step edge dark|light, (2) a 1 px dark line on light, (3) a 12 px-diameter dark disc on light. It upscales each with `fast` at factors 1.5 and 2.5 and also resizes it with plain Lanczos (sharp, lanczos3, same size). Per feature and method it reports: **overshoot** = the largest amount any output pixel within 6 output px of the edge goes below 40 or above 215 (bytes, report model and plain Lanczos in separate columns, no subtraction); and **edge width**: for the step, the 10–90 % rise distance along a row in output px; for the line, the full width at half maximum of the dark dip along a row through its centre; for the disc, the 10–90 % rise distance along a horizontal line through its centre, measured on the left edge. Add `docs/EDGES.md` with the table, the commands, and one sentence of reading (is `fast` worse than plain Lanczos on overshoot, yes/no, by how much). No `src/` change, no default change. `npm test` passes (README "Development" must list the new `bench/` script, DOC6's test enforces it).
- **Done (2026-11-15, PR #111):** `bench/edges.js` (usage line, listed in README "Development") and `docs/EDGES.md`. Result: `fast` overshoots more than plain Lanczos in every row (by 2 to 18 bytes on a 175-byte contrast; worst on the dark side of small dark features: 1 px line at 2.5 → 31 below the dark level vs 0; disc 34–37 vs 20–23) and its edges are sharper (step 0.97–0.99 px vs 1.44–1.81). Deterministic across two runs. Synthetic only; `high` not measured. No `src/` change.

### [x] BK8 — (done 2026-11-15, bench/edges.js + test/edges-args.test.js + docs/EDGES.md) `bench/edges.js`: leave out the image-border rows by default, and validate `--factors` with a test
- **Goal:** the BK7 adversary found that the step and line windows include the first and last rows, where the feature meets the image border; leaving 40 output rows out at each end lowers `fast`'s step overshoot (14 → 12 at factor 1.5, 21 → 17 at 2.5) and the line's light side at 2.5 (14 → 9), so the step excess over Lanczos in `docs/EDGES.md` (+4 / +8) is about +2 / +4. The script's `--factors` check has no test.
- **Accept:** in `bench/edges.js` the overshoot windows of the step and the line skip rows closer than 40 output px to the top or bottom edge by default; `--include-border` restores the old behaviour (the disc is unaffected; its window never reaches the border). Update the Usage line. `docs/EDGES.md` is regenerated with the new default (state both numbers for the step in the Reading section; remove the "Image borders" caveat that is now fixed, or reword it to point at `--include-border`); the headline answer is re-checked against the new table and kept or corrected. A new test `test/edges-args.test.js` (spawn the script, like `test/memory-creep-args.test.js`) checks that `--factors 0`, `--factors abc`, `--factors 1.5,-1` and `--factors` with no value (today it crashes on `undefined.split`; fix that in the script) exit with code 1, print the clear message, and return in under 2 s (so no model run starts). No `src/` change. `npm test` passes.
- **Done (2026-11-15, PR #113):** step/line windows skip 40 output rows top and bottom by default, `--include-border` restores the BK7 table (checked: byte-identical to the BK7 output); `--factors` with no value now exits 1 with the message instead of crashing. `test/edges-args.test.js` (5 cases, each < 2 s). New `fast` step overshoot 12 / 17 (was 14 / 21), line 2.5 light side 9 (was 14); step excess over Lanczos +2 / +4 (was +4 / +8); headline (2 to 18 bytes, `fast` worse in every row) unchanged. No `src/` change.

### [x] BK9 — (done 2026-11-15, bench/edges.js --quality + docs/EDGES.md) `bench/edges.js --quality high`: do the edges of `high` mode (Remacri) ring more or less than `fast`? (research, after BK8)
- **Goal:** BK7 measured `fast` only; `high` is what a GPU user gets. Say whether `high` overshoots more than plain Lanczos and than `fast`, on the same synthetic edges.
- **Accept:** `bench/edges.js` takes `--quality fast|high` (default `fast`; any other value exits 1 with a clear message, covered by extending the `test/edges-args.test.js` file that BK8 creates, so this task starts from BK8's branch state on `main`; the script sets `PUSHUP_QUALITY` and `PUSHUP_DEVICE=cpu` from it). Run `node bench/edges.js --quality high` (CPU, tiled; budget about 5 minutes for 6 runs at 400×300; if it takes longer than 15 minutes, run factor 1.5 only and say so). `docs/EDGES.md` gets a `high` section with the same table and one sentence: is `high` worse than Lanczos on overshoot, and is it better or worse than `fast` (yes/no, by how much, using the BK8 table). Tile seams must not be counted as edges: the step image's edge is at x = 200 and tiles are 192 px, so say in the doc whether the edge falls on a tile boundary and in a comment of the script where the seams are. No `src/` change, no default change. `npm test` passes.
- **Done (2026-11-15, PR #114):** `--quality fast|high` (bad or missing value exits 1, 4 new cases in `test/edges-args.test.js`); default output byte-identical to the BK8 table. `high` run took 1 min 29 s on CPU (both factors). Result in `docs/EDGES.md`: `high` overshoots more than Lanczos in every row (step +2/+1, line +13/+27, disc +11/+17) and is not better than `fast` (same on step and disc within 3 bytes, worse on the 1 px line by 11/9); sharpest step and disc edges (not the line at 2.5). Overshoot 40 in `high` rows is a clamp (lower bound). The step edge (x = 200) is 8 px past the x = 192 tile seam, inside the pad, so no seam artefact. No `src/` change.

### [x] BK10 — (done 2026-11-15, bench/colors.js + docs/COLOR.md) Research: how far does `fast` shift flat saturated colours, and is it the model or the Lanczos mix? (docs only)
- **Goal:** BK4 measured flat green and blue shifting by 26–29 and 19–24 bytes through the `fast` pipeline (red 7–10, white 3, black 1–2). Colour accuracy matters for e-commerce (a green or blue garment). Find which step causes it and how it depends on the colour.
- **Accept:** a script `bench/colors.js` (usage line in its first 15 lines; listed in README "Development", which `test/readme-bench.test.js` enforces) builds uniform 400×300 images for the 27 colours with each channel in {0, 128, 255}, runs them through `upscale` at factor 1 in three settings (shipped `fast` through `upscale`; the model only, via `_run` with `lanczosMix: 0`; and a plain `sharp` lanczos3 resize as the reference), and prints a table per colour: the largest per-channel byte deviation and which channel, for each setting. A plain Lanczos resize of a uniform image is expected to return the input exactly; check that and say so. `docs/COLOR.md` has the table, the commands, which channel moves most, whether the mix reduces the shift (the mix is 20 %, so the shipped shift should be about 80 % of the model-only shift: verify; expect rounding to hide this for shifts under about 5 bytes, e.g. black 1 → 1), and one sentence on what it would take to fix it (a measured idea, not an implementation). Two runs give identical numbers. No `src/` change, no default change. `npm test` passes.
- **Done (2026-11-15, PR #115):** `bench/colors.js` + `docs/COLOR.md` (two runs identical, 23 s). Findings: the model causes the shift (Lanczos exact on all 27; the mix scales it by 0.75–0.86); the biggest deviations are within 16 px of the image border (blue 24 → 4, magenta 36 → 6 away from it); saturated green also has an interior shift of 10–14 (desaturation). Fix idea (unmeasured upper bound, needs owner decision + quality gate): mirror-pad 16 px before the model and crop. Extra column added to the table vs the task: model-only max deviation away from the border. No `src/` change.

### [x] DOC13 — (done 2026-11-15, README Known limits + test/readme-links.test.js) README "Known limits": add the edge overshoot and flat-colour shift findings (after BK8 and BK10)
- **Goal:** two measured behaviours of `fast` are only in `docs/`; a reader of the README does not see them.
- **Accept:** in README "Known limits / next steps", two short bullets: (1) hard edges: `fast` overshoots a hard edge more than plain Lanczos but has a sharper edge, with the numbers from the BK8-regenerated `docs/EDGES.md` (copy them; say they are synthetic); (2) flat saturated colours: the byte shift measured in `docs/COLOR.md` (copy the largest per-channel number for the shipped `fast` and name the colour), with the cause BK10 found. Each bullet links its doc (anchors or file links must resolve; `test/readme-bench.test.js` or a new `test/readme-links.test.js` checks that every `docs/*.md` link in the README points at an existing file). If BK8 or BK10 is not `[x]` yet, set this task back to `[ ]` with a note instead of writing numbers that do not exist. Docs and test only. `npm test` passes.
- **Done (2026-11-15, PR #116):** two bullets added to README "Known limits" (hard edges: 2–18 bytes more overshoot than Lanczos, sharper edges; flat colours: 29 bytes on magenta's blue channel, 26 on green, model-caused, border band ~8 px), numbers copied from `docs/EDGES.md` / `docs/COLOR.md`. New `test/readme-links.test.js`: every `docs/*.md` link in the README resolves to a file and, when it has one, to a heading anchor (GitHub slug rules; all existing links pass; three mutations fail it: a bad anchor, a bad file name, a link to a missing file). No `src/` change.

### [x] BK11 — (done 2026-11-15, bench/pad.js + docs/PAD.md) Research: does mirror-padding the input before the model remove the border band on real images? (bench-only, no `src/` change)
- **Goal:** `docs/COLOR.md` (BK10) found that most of `fast`'s flat-colour error sits within about 8 px of the image border, and that on uniform images mirror-padding 16 px before the model and cropping afterwards removes it. Uniform images are not photos. Measure it on the real set before anyone proposes a `src/` change (which needs an owner decision and the quality gate, playbook §2).
- **Accept:** `bench/pad.js` (usage line in its first 15 lines; listed in README "Development", enforced by `test/readme-bench.test.js`). Needs `bench/out/sub20` (`bash bench/fetch_testset.sh`, about 5 minutes; if the fetch fails, mark the task `[blocked]` with the error). **Construction (chosen so the 1000 px output cap in `src/index.js` is never hit and the crop is exact for every aspect ratio):** factor 2.0, reference 800 px, input 400 px. Copy the construction from `bench/bench.js` (lines 62–70; it has no exports, do not refactor it) with the reference built at 800 px on its longest side (lanczos3, `fit: 'fill'`) and the degraded input made from it by the same cubic downscale to 400 px, JPEG q85, decode. Per image, run `fast` (via `_run`, shipped settings, factor 2.0) twice: (1) as is: 400 px in, 800 px out; (2) padded: the 400 px input mirror-padded by 16 px on every side (sharp `extend`, `extendWith: 'mirror'`, so 432 px in), `_run` at factor 2.0 (864 px out, under the cap), then cropped by 32 px on every side. Because 2.0 × (n + 32) = 2n + 64 for every n, the crop is exactly the as-is output size for any aspect ratio; assert that (output sizes equal, and equal to the reference size, clipping both to the shared area by 1 px as `bench/bench.js` does if they differ). Scoring uses `bench/metrics.js` unchanged (its `psnr`, `ssim`, `gmsd` take two packed buffers and a size and return one mean): (a) the whole image; (b) the interior: a centre crop that leaves out 32 px on every side; (c) the border band as four strips (top, bottom, left, right; each 32 px thick, full length, corners counted in the top and bottom strips), scored strip by strip; average the four strip values weighted by pixel count (for PSNR do not average dB values per strip: a flat white border gives an infinite PSNR when the error is 0; pool the squared error of the four strips into one MSE and take the PSNR of that, and say so). Each metric is the mean over the 20 images. Skip, and list in `docs/PAD.md`, any image whose output is under 100 px on the short side (the 32 px strips and interior crop do not fit). If a source is smaller than 800 px on its longest side, the reference is an upscale: say how many such images there are. State in `docs/PAD.md` that SSIM and GMSD treat the edges of each cropped buffer differently (blur clamp, GMSD skips the outer pixel), so (b) and (c) are comparable between the two variants but not with (a). `docs/PAD.md`: the commands, one table (as is / padded × whole / interior / border band × PSNR / SSIM / GMSD), the runtime ratio (median of ≥ 5 runs per variant at 400 px in), and one sentence: "propose to the owner" if the padded variant's whole-image scores pass the playbook §2 gate against the as-is variant (PSNR drop ≤ 0.02 dB, SSIM drop ≤ 0.001, GMSD rise ≤ 0.001) **and** the border band improves on at least two of the three metrics (means over the images) and gets worse on none; otherwise "drop". Say that this measures factor 2.0 on 400 px inputs only and that the gate runs at 400 and 800 px with the shipped factor (`bench/bench.js --sizes 400,800`), which a later quality-gate run would do if the owner agrees. No `src/` change, no default change. `npm test` passes.
- **Done (2026-11-15, PR #119):** `bench/pad.js` + `docs/PAD.md` (20 sub20 images, ~45 s, scores identical over two runs). Result: padding changes nothing measurable on real photos (whole PSNR −0.001 dB, SSIM −0.00000, GMSD +0.00003; border band PSNR +0.001, SSIM −0.00003, GMSD +0.00015); gate passes, border band better on 1 of 3 and worse on 2, so the rule says **drop**; runtime ×1.1–1.2. DOC14 should therefore record "dropped, no decision needed" for the padding idea. Environment note: `bash bench/fetch_testset.sh` failed here at first because `pip` installs for Python 3.13 while `python3` is 3.11 with a broken system Pillow; worked by putting a `python3` → python3.13 symlink first on PATH (nothing changed in the repo). No `src/` change.

### [x] DOC14 — (done 2026-11-15, docs/OWNER_DECISIONS.md + test/readme-links.test.js) `docs/OWNER_DECISIONS.md`: add the edge/colour findings that need a decision (after BK11)
- **Goal:** the mirror-pad idea (BK10, BK11) would change default output, and `high` not being better than `fast` on edges (BK9) bears on T8. The owner list should say so.
- **Accept:** `docs/OWNER_DECISIONS.md` gets one entry for the border padding (with the BK11 recommendation and numbers, linking `docs/COLOR.md` and `docs/PAD.md`; if BK11 says "drop", the entry says that and asks for nothing) and one sentence added to the T8 entry about the BK9 edge result (link `docs/EDGES.md`). Links resolve (extend `test/readme-links.test.js` to cover `docs/*.md` links inside `docs/OWNER_DECISIONS.md`, or add a short test). No decision is made in the file. If BK11 is not `[x]`, set this task back to `[ ]` with a note. `npm test` passes.
- **Done (2026-11-15, PR #120):** entry 8 added (border padding: **dropped**, BK11 found no measurable gain; asks for nothing) and one sentence on the BK9 edge result in the T8 entry (high not better than fast on synthetic edges; UltraSharpV2-Lite's edges not measured). `test/readme-links.test.js` now also checks every `docs/OWNER_DECISIONS.md` link (file and anchor; a broken anchor fails it). No decision made in the file. No `src/` change.

### [x] BK12 — (done 2026-11-15, test/edges-border.test.js) Test: `bench/edges.js` really skips the border rows by default (BK8 reviewer gap)
- **Goal:** the BK8 reviewer's mutation check showed that disabling the border skip in `bench/edges.js` fails no test. Pin it.
- **Accept:** in `test/edges-args.test.js` (or a new `test/edges-border.test.js`) run `node bench/edges.js --factors 1.5` and `node bench/edges.js --factors 1.5 --include-border` (about 2 to 10 s each; two model runs per feature) and assert: the `disc` rows are identical in both runs; the `step | 1.5 | fast` overshoot in the default run is lower than with `--include-border`; the `lanczos` rows for the step differ or are equal as you measure first (state which in a comment); every row has a finite overshoot. Mutation check in the PR: removing the skip fails the test. The file adds under 40 s to `npm test`. No `src/` change. `npm test` passes.
- **Done (2026-11-15, PR #118):** new file `test/edges-border.test.js` (4 tests, ~4 s: two `bench/edges.js --factors 1.5` runs, with and without `--include-border`). Asserts six finite rows per run; disc rows identical; step `fast` overshoot lower by default (12 vs 14); Lanczos step rows equal (10 / 10, measured; also line 13/13 and 11/11 at 1.5, noted in a comment). Mutation: removing the border skip fails the step test (3 pass, 1 fail). Limit (adversary): skipping only the bottom 40 rows, or changing `BORDER` from 40 to 10, is not caught; the test proves that border rows are skipped, not both ends or the width. No `src/` change.

### [x] EX1 — (done 2026-11-15, test/exit.test.js) Test: a process that called `upscale` exits by itself (no handle keeps the event loop alive)
- **Goal:** a script or CLI that awaits `upscale()` must end on its own. If an ONNX Runtime session, a timer or the queue kept the process open, a user's batch job would hang after the last image. Nothing tests this today (`test/package.test.js` and `scripts/pack-smoke.sh` check the tarball, not process exit).
- **Accept:** a new file `test/exit.test.js` spawns `node -e` (child process, `process.execPath`) that requires `src/index.js`, upscales a 400×4 RGB image once with `PUSHUP_QUALITY=fast PUSHUP_DEVICE=cpu`, prints the output size, and does **not** call `process.exit`. Assert exit code 0, the printed size, and that the child ended within 20 s (kill it and fail with a clear message on timeout). Add a second case with two calls started together. Measure the time first and state it in a comment. If a handle does keep the process alive, do not add `process.exit` or `unref` hacks in the test: record the finding and the fix needed in `src/index.js` on this task and mark it `[blocked]` for the next run (a `src/` change is allowed only if it is that fix and the tests pass byte-identically). `npm test` passes.
- **Done (2026-11-15):** `test/exit.test.js`, two cases (1 call, 2 calls started together) spawn `node -e` with `fast`/CPU on a 400×4 image, no `process.exit`; assert exit code 0, the output size/stride (4800/1200) and exit within 20 s (measured ~0.15 s each). A child with a leftover `setInterval` makes both cases fail, so it can detect a held handle. No handle is kept alive; no `src/` change. The second case checks queue cleanup, not concurrency (calls are serialised).

### [x] DOC15 — (done 2026-11-15, docs/CONTRACT_TESTS.md) `docs/CONTRACT_TESTS.md`: add the tests landed since DOC4 (tiling, extremes, downscale, tiny factor, session retry)
- **Goal:** the contract map stops at the batch-reject tests. Tests added since then that pin contract rows (BK1 `test/tiling.test.js`, BK4 `test/extremes.test.js`, BK5 `test/downscale.test.js`, R14 `test/tiny-factor.test.js`, R12 `test/session-retry.test.js`) are not listed. R13 (`test/env-per-call.test.js`) was named here by mistake: it pins how the env settings are read (configuration), not a contract row (amended 2026-11-15 after the first review, see Done).
- **Accept:** add each of these to the section of the contract row it pins (Output, `upscale_factor`, Async), as a bullet with the exact test name when the name is a string literal (`test/contract-tests.test.js` checks it) or an "Also covered by … (generated names, not checked)" sentence otherwise. Do not list a test under a row it does not pin; say in the PR description which row you chose for each file and why. No test is added, renamed or changed; no `src/`, README or `CLAUDE.md` change. `npm test` passes (including `test/contract-tests.test.js`).
- **Done (2026-11-15):** `upscale_factor`: `test/tiny-factor.test.js` (literal name) and `test/downscale.test.js` (sentence, generated names). Output: `test/extremes.test.js` and `test/tiling.test.js` (sentences, generated names; tiling is the output-fidelity of the tiled path, same size and pixels within fixed bounds). Async: `test/session-retry.test.js` (literal name; a failed session creation is not cached, so the next call retries and succeeds: the test makes sequential calls, so it pins session retry, not the queue itself). **Not listed:** `test/env-per-call.test.js` (R13) — the task text named it by mistake and was amended (Goal and title); it pins how `PUSHUP_QUALITY` is read, which is configuration, not a row of the contract table or the async sentence; listing it would claim coverage it does not give. No test, `src/`, README or `CLAUDE.md` change.

### [x] R16 — (done 2026-11-15, test/batch-reject.test.js) Test: an invalid `PUSHUP_QUALITY` / `PUSHUP_DEVICE` mid-batch rejects that call alone (extends R10, R11, R13)
- **Goal:** R10/R11 pin a bad size, stride, factor and `arr` type in the middle of a batch; `test/device.test.js` pins the invalid-setting error for a single call only. The env is read on every call, so a bad value set while calls are queued must reject only the calls that read it.
- **Accept:** one new test in `test/batch-reject.test.js` (or `test/env-per-call.test.js`): start call A (good), then set `process.env.PUSHUP_QUALITY='ultra'` and start call B, then restore the env and start call C (good), all without awaiting in between. Work out from `src/index.js` when the env is read (at the call or when the queued job starts) and assert what actually happens: B rejects with `RangeError` naming `PUSHUP_QUALITY`, A and C resolve with bytes identical to the same inputs upscaled alone. If the read time makes B succeed or A/C fail, state that in a comment and in the PR and assert the real behaviour only if it is consistent with README "Quality modes and GPU"; if the README and the code disagree, mark the task `[blocked]` with both quotes (owner decision). The env is restored in a `finally`. No `src/` change. `npm test` passes.
- **Done (2026-11-15):** two tests in `test/batch-reject.test.js` (`PUSHUP_QUALITY=ultra` and `PUSHUP_DEVICE=tpu`), reusing `checkBatch`: good / call made while the bad value is set (env restored in a `finally` right after the call) / good. Behaviour found: the env is read synchronously inside `upscale()` on the default path (nothing is awaited before `resolveEngine()`), so only the middle call rejects, with a `RangeError` naming the setting and value; A and C are byte-identical to solo runs. README "Quality modes and GPU" ("read on every call") agrees with the code. Mutation: delaying the env read by one microtask in `run()` fails both tests. No `src/` change.

### [x] EL1 — (done 2026-11-15, bench/eventloop.js + docs/PERF.md "Event loop") Measure whether `upscale` blocks the event loop (research, bench-only, no `src/` change)
- **Goal:** `CLAUDE.md` and README ("Calls are async; the model runs off the main thread") say inference runs off the main thread. A quick check on 2026-11-15 (4 vCPU, Node 22, onnxruntime-node 1.31.1) found that timers scheduled with `setInterval(…, 2)` did not fire at all for most of a call: one `fast` 800×600 `upscale` (1.56 s) gave 17 ticks, with the biggest gap about 1.5 s, and a bare `session.run` of the same input gave 0 ticks in 1.4 s (also with `intraOpNumThreads` 1, 2 and 3). If that holds, a server that calls `upscale` is unresponsive for the length of every call, which the docs do not say. This task measures it properly; it does not fix it.
- **Accept:** a new `bench/eventloop.js` (options `--sizes`, `--calls`, `--threads`, default sizes 400,800, `fast`, CPU, factor 1.5; one fresh warm-up call, argument validation in the style of `bench/memory-creep.js`) that, for each size, runs a `setInterval(…, 2)` probe during (a) a full `upscale()` call and (b) a bare `session.run` with the same input, and prints: call time, number of ticks, longest gap between ticks, and the sum of the time the loop was blocked (gaps above 10 ms). A table in a new section "Event loop (EL1)" in `docs/PERF.md` with two runs per size (400×300 and 800×600), `--threads` 1 and the default for the bare `session.run`, and one plain sentence per row group saying whether the loop is blocked for the whole call, only for part of it, or not at all. Also say which stage it is when the data shows it (bare `session.run` blocks → ONNX Runtime, not PushUP's JS). No recommendation to change the code or a default (owner decision). `test/readme-bench.test.js` (DOC6) requires every `bench/*.js` to have a `// Usage:` line in its first 15 lines and to be named in the README: add both (README "Development" list). State in `docs/PERF.md` that the numbers are for the 4 vCPU machine named there and will differ elsewhere. A test for the argument validation (like `test/memory-creep-args.test.js`; first stderr line of each bad value, under 5 s). `npm test` passes.
- **Done (2026-11-15):** `bench/eventloop.js` (+ `test/eventloop-args.test.js`, 9 cases; README Development line; `// Usage:` line) and a PERF.md section "Event loop (EL1, 2026-11-15)" with two runs (400×300 and 800×600; `upscale()` and bare `session.run`, 1 and default threads; plus an idle control: 142 ticks, 3 ms longest gap). **Finding:** the loop is blocked for 96–98% of every `upscale()` call (about 0.4 s at 400 px, 1.8 s at 800 px) and for 100% of a bare `session.run` (0 ticks in 24 calls, also with 1 thread), so the block is inside onnxruntime-node 1.31.1, not PushUP's JS; the few ticks of `upscale()` come at the end (probably resize/mix; inferred, not traced). `high` mode and a GPU were not measured. **For DOC16:** the loop is blocked, so DOC16 changes the README sentence and adds the owner row (reword `CLAUDE.md` or run inference in a `worker_threads` worker). No `src/` change.

### [x] DOC16 — (done 2026-11-15, README + docs/OWNER_DECISIONS.md row 9) README and owner list: say what EL1 found about the event loop (after EL1)
- **Goal:** README line "Calls are async; the model runs off the main thread" must say what is true. `CLAUDE.md` has the same sentence, but only the owner changes it.
- **Accept:** only after EL1 is merged. If EL1 found that the loop is blocked for (most of) a call: in README replace that sentence by one that says timers and I/O in the same process are delayed for most of each call, with the numbers of EL1 for 400 and 800 px and a link to `docs/PERF.md`; add one row to `docs/OWNER_DECISIONS.md` (decision: reword the `CLAUDE.md` sentence, or run inference in a `worker_threads` worker so the loop stays free; evidence: EL1; to unblock: say which) and keep that file's link test (`test/readme-links.test.js`) passing. If EL1 found the loop is free, change nothing and mark this task `[x]` closed with that evidence. `CLAUDE.md`, `src/` and tests other than README-reading tests unchanged. `npm test` passes. If EL1 is not merged, mark this task `[blocked]` on EL1 and move on.
- **Done (2026-11-15):** EL1 found the loop blocked (96–98% of every `upscale()` call), so: README "Calls are async…" sentence replaced by one that says timers and I/O are delayed for about the length of the call (0.4 s at 400×300, 1.8 s at 800×600, 4 vCPU, `fast`), that the block is inside ONNX Runtime, links PERF.md "Event loop", and says `high`/GPU were not measured; `docs/OWNER_DECISIONS.md` row 9 (reword the `CLAUDE.md` sentence, or move inference to a `worker_threads` worker). `CLAUDE.md` and `src/` unchanged. The README's remark that a separate process or worker thread should keep the loop free is marked "not tested here".

### [x] EX2 — (done 2026-11-15, test/esm.test.js) Test: the package loads from an ES module (`import { upscale } from …`)
- **Goal:** README says the package is CommonJS, but many users have ESM projects. `import { upscale }` works today (checked 2026-11-15: named export `upscale`, and `default` is the whole `module.exports` object), and nothing pins it, so a change of how `module.exports` is built could break ESM users silently.
- **Accept:** a new `test/esm.test.js` that spawns `node --input-type=module -e` (child process) which does `import { upscale } from <src/index.js URL>` and `import pushup from <same URL>`, upscales one 400×4 RGB image at factor 1 (`fast`, CPU), prints the output length and stride, and does not call `process.exit`. The child and the `require` call in the test process both run with `PUSHUP_QUALITY=fast PUSHUP_DEVICE=cpu` (set in the child's env; set and restore it around the in-process call) so the bytes are comparable. Assert exit code 0 and that the bytes (print a short hash or the whole length plus first 12 bytes) equal those of the same call made with `require` in the test process; assert `typeof upscale === 'function'`, `pushup.upscale === upscale`, and, in a comment, state what `default` really is: the namespace's `default` is the whole `module.exports` object (so `pushup` above is that object), and `pushup.default` is the `upscale` alias (`module.exports.default = upscale` in `src/index.js`); assert `pushup.default === upscale` only if you want that alias pinned, and say in the PR that it is then a public promise. 20 s limit with a clear failure message as in `test/exit.test.js`. No `src/` or README change; if README says nothing about ESM, do not add anything. `npm test` passes.
- **Done (2026-11-15):** `test/esm.test.js`, one test (~0.3 s): a child started with `node --input-type=module -e` does `import { upscale }` and `import pushup` from the `file://` URL of `src/index.js`, upscales a 400×4 image at factor 1 (`fast`, CPU, env set in the child and set/restored around the in-process `require` call) and prints a length/stride/sha256 digest; the test asserts exit code 0, `typeof upscale === 'function'`, `pushup.upscale === upscale` and a digest equal to the one from `require` in the test process; 20 s limit. `pushup.default` (the `upscale` alias) is deliberately **not** asserted, explained in a comment. Mutation: `module.exports = upscale;` (no named export) fails the test. No `src/` or README change (README says nothing about ESM).

### [x] EL2 — (done 2026-11-15, bench/worker.js + docs/PERF.md "Worker") Measure the cost of running `upscale` in a `worker_threads` worker (research, bench-only, no `src/` change)
- **Goal:** EL1 found that `upscale()` blocks the event loop for the whole call, and `docs/OWNER_DECISIONS.md` row 9 asks the owner whether to reword `CLAUDE.md` or move inference to a worker. An adversary check on 2026-11-15 saw the main loop stay free (639 ticks, longest gap 9 ms) with `upscale` inside a worker, but nobody measured what a worker costs. The owner needs those numbers to decide.
- **Accept:** a new `bench/worker.js` (options `--sizes` default `400,800`, `--calls` default 5, same validation style and one-line messages as `bench/eventloop.js`, `// Usage:` line, README Development line, and a `test/worker-args.test.js` for the bad values) that, for each size, with `fast` on CPU and factor 1.5: (a) starts a `worker_threads` Worker that requires `src/index.js` and answers `{arr, stride, factor}` messages with `upscale()` results (input sent as a transferred `ArrayBuffer`, output transferred back), (b) measures the first call (worker start + session creation) and the median of the next `--calls` calls from the main thread's view, against the same calls made directly in the main thread (the existing `bench/cold.js` numbers are the reference), (c) runs the EL1 timer probe (2 ms `setInterval`, ticks and longest gap) on the main thread during a worker call, (d) prints RSS of the process after the last call (main + worker share one process). Check that the output bytes from the worker equal those from a direct call (assert in the script, print `bytes equal: yes/no`). A section "Worker (EL2)" in `docs/PERF.md` with the table (two runs per size) and one plain sentence each on: latency overhead per call, extra cold-start cost, memory difference, and whether the main loop stays free. State that numbers are for the machine named there. No recommendation to change a default or the code (owner decision, row 9). `npm test` passes.
- **Done (2026-11-15):** `bench/worker.js` (+ `test/worker-args.test.js`, 8 cases; README Development line; `// Usage:` line) and PERF.md section "Worker (EL2, 2026-11-15)", two runs, one fresh process per row. Result (4 vCPU, `fast`, CPU, factor 1.5): the main loop stays free with the worker (190–195 ticks / 6 ms longest gap at 400×300; 824–826 / 7 ms at 800×600, against 0.4 s and 1.7 s longest gaps direct); median call latency +0 ms at 400×300 (−6/−4 ms, noise) and +31/+48 ms (2–3%) at 800×600; first call more by tens of ms up to about 200 ms (noisy, and it includes loading `src/` in the worker: +16–72 ms at 400, +190–221 ms at 800 in the table, +106 and +72 ms in a later check run); RSS about +40 MB at 800×600 and between −1 and +52 MB at 400×300 (up to about 45 MB cannot be ruled out); output bytes equal in every pair. Not measured: `high`, GPU, worker pools, a separate process. No `src/` change, no recommendation (owner row 9).

### [x] EL3 — (done 2026-11-15, bench/eventloop.js --quality + docs/PERF.md "high mode (EL3)") Does `high` mode block the event loop too? (add `--quality` to `bench/eventloop.js`, research)
- **Goal:** EL1 measured only `fast`; README says "`high` mode and a GPU were not measured". `high` runs 192 px tiles, so it may yield between tiles. On a CPU a `high` call takes about 30× longer than `fast`, so the answer matters more there.
- **Accept:** `bench/eventloop.js` gets `--quality fast|high` (default `fast`; one-line error `--quality must be fast or high` before any model is loaded; `PUSHUP_QUALITY` is set from it; for `high` the bare `session.run` rows use `_MODES.high.modelPath` on one 192 px tile input `1×3×(192+2·16)×(192+2·16)`, i.e. what one tile feeds; `_MODES.high` has no pad field, the 16 is `DEFAULT_TILE_PAD` in `src/index.js` and is not exported, so hard-code 16 in the script with a comment pointing there; with `--quality high` only the `high` rows are run, not the `fast` ones), extend `test/eventloop-args.test.js` for the new flag, and run `node bench/eventloop.js --quality high --sizes 400 --calls 1` twice (about 15 s per `upscale()` call on 4 vCPU; budget the run). Add the rows to the "Event loop (EL1, 2026-11-15)" section of `docs/PERF.md` under a sub-heading for `high`, with one plain sentence: is the loop blocked for the whole call, only per tile (give the longest gap), or free between tiles? Say that 800 px and a GPU were not measured. No recommendation to change code. `npm test` passes.
- **Done (2026-11-15):** `bench/eventloop.js --quality fast|high` (`--quality must be fast or high` before any model is loaded; for `high` the bare rows are `tile.run` on a 1×3×224×224 input, 16 hard-coded with a comment pointing at `DEFAULT_TILE_PAD`) and 3 new cases in `test/eventloop-args.test.js`; PERF.md sub-section "`high` mode (EL3, 2026-11-15)", two runs at 400×300. **Finding:** `high` blocks the loop too: 99.9% of the call is in gaps above 10 ms (12.1 s and 11.5 s calls; 8–9 ticks; longest gap 3.8 s and 3.4 s, about one bare tile run of 3.9–4.1 s with 0 ticks). 800 px and a GPU not measured. README unchanged (DOC17 updates it). No `src/` change.

### [x] DOC17 — (done 2026-11-15, README event-loop paragraph + docs/OWNER_DECISIONS.md row 9) README: update the event-loop paragraph with the `high` and worker results (after EL2 and EL3)
- **Goal:** README's event-loop paragraph (DOC16) says "`high` mode and a GPU were not measured" and "should keep the main loop free (not tested here)". EL2 and EL3 produce those answers.
- **Accept:** only after EL2 and EL3 are merged: change those two clauses, and only those, to what the two sections of `docs/PERF.md` say (numbers equal, link to the section), keep "a GPU was not measured", and update `docs/OWNER_DECISIONS.md` row 9's evidence cell with the EL2 numbers (latency overhead, memory). `CLAUDE.md` and `src/` unchanged; README tests (R2, Q6, D3, D6, DOC6, readme-links) pass. `npm test` passes. If either task is not merged, mark this one `[blocked]` on it and move on.
- **Done (2026-11-15):** EL2 and EL3 are merged. README: the clause "should keep the main loop free (not tested here)" now says what EL2 measured (worker, `fast` only: longest gap 6–7 ms; no measurable change in call time at 400×300 and about 30–50 ms (2–3%) more at 800×600, first call tens of ms up to about 200 ms more, about +40 MB at 800×600, not resolved at 400×300; a worker with `high` and a separate process not tested) and the clause "`high` mode and a GPU were not measured" now says `high` blocks the loop too (about 12 s for 400×300, timers delayed up to 3.8 s at a time), keeping "A GPU was not measured"; links to PERF.md "Worker" and "`high` mode (EL3)". `docs/OWNER_DECISIONS.md` row 9 evidence cell gets the EL2/EL3 numbers. `CLAUDE.md`, `src/` unchanged.

### [x] SM1 — (done 2026-11-15, test/bench-exports.test.js) Test: every `bench/*.js` script is valid JavaScript and every `src/` export it uses exists
- **Goal:** the `bench/` scripts reach into `src/index.js` through underscore exports (`_run`, `_MODES`, `_sessionOptions`, `_toTensor`, `_copyFromTensor`, `_mixLanczos`, and `_reset` in `bench/saas/`; `_gpuProviders` is used by a test only). If one is renamed or removed, only the script that uses it breaks, and nobody notices until someone runs it (most take minutes). R3 and Q8 (`test/profile-sync.test.js`) pin only `bench/profile.js` and `bench/threads.js`.
- **Accept:** a new `test/bench-exports.test.js` that (1) runs `node --check` on every `bench/*.js` and every `bench/saas/*.js` (cheap, no model; `scripts/` holds only `pack-smoke.sh`, so nothing there) and (2) reads each `bench/*.js` and finds the names it takes from `require('../src/index.js')` / `require('../src')` (in `bench/saas/` the path is `../../src`; accept any `require` whose path ends in `src` or `src/index.js`) (destructuring `const { a, b } = require(...)`, which may be indented or inside a function and may appear twice in one file with different names, as in `bench/memory-breakdown.js`; `const x = require(...)` followed by `x.name` uses; and the inline form `require('../src/index.js')._NAME`, as in `bench/throughput.js`) and asserts that every such name is an own property of the real export object. Files that do not require `src` at all (`bench/aspect.js`, `gate.js`, `metrics.js`) are fine and must not fail. State in a comment which forms of use the check understands, and make the test fail with the file name and the missing export. Write the check as a function that takes the exports object as a parameter, so the mutation check can pass it an object with one export renamed (e.g. `_MODES` removed) without touching the repo, and assert that it then fails; also assert that the scan finds at least the known names (`_run`, `_MODES`, `_sessionOptions`, `_toTensor`, `_copyFromTensor`, `_mixLanczos`, `_reset`) across all files, so a scan that silently finds nothing cannot pass. Say in the PR that the mutation check was done. No `src/` or `bench/` change unless the test finds a real broken reference: then fix that reference and say so. `npm test` passes and the new test takes under 5 s.
- **Done (2026-11-15):** `test/bench-exports.test.js` (4 tests, about 0.6 s): `node --check` on all 17 `bench/*.js` and the 2 `bench/saas/*.js`; a scan (plain regexes: destructuring at any indentation, the inline `require(...)._NAME` form, `const x = require(...)` + `x.name`) whose result is checked against the real exports, with a floor on the names it must find (`_run`, `_MODES`, `_sessionOptions`, `_toTensor`, `_copyFromTensor`, `_mixLanczos`, `_reset`, `upscale`); a mutation test on a copy of the exports object (without `_MODES`) that must report the uses, including the inline form in `bench/throughput.js`; and a test of each form of use on small texts. Real mutation done by hand: renaming `module.exports._MODES` in `src/index.js` made the second test fail naming all six scripts that use it (arena, eventloop, memory-breakdown, profile, threads, throughput); `src/` restored. The floor assertion caught two bugs in my first regexes (a backreference to the wrong group, and `[^}]*` spanning an outer `{`). No broken reference was found in `bench/`; no `src/` or `bench/` change. After the review the scan was hardened (comments stripped, `...rest` keys skipped, `/index` accepted without `.js`) and two more cases were added to the forms test; the header comment of the test lists what is still not understood.

### [x] EX3 — (done 2026-11-15, test/quiet.test.js) Test: a normal `upscale` call writes nothing to stdout or stderr
- **Goal:** a library must be quiet. onnxruntime can print warnings to stderr in some environments (a 2026-11-15 check on 4 vCPU with `fast`/CPU printed none: 0 bytes), and nothing pins that PushUP itself prints nothing (`process.emitWarning` is used on purpose only for `PushupWarning` when a GPU fails, which is not a console write but can reach stderr).
- **Accept:** a new `test/quiet.test.js` that spawns a child (`process.execPath -e`, as in `test/exit.test.js`) which requires `src/index.js`, upscales one 400×4 RGB image at factor 1 with `PUSHUP_QUALITY=fast PUSHUP_DEVICE=cpu`, and prints nothing itself; assert exit code 0, empty stdout and empty stderr, 20 s limit. A second case runs two calls, one of them rejected with a `RangeError` (caught in the child), and asserts the same (a rejected call must not leave output behind). If the environment makes onnxruntime print something (check by running it ten times), do not filter it in the test: record the finding on the task and mark it `[blocked]` for an owner decision. No `src/` change. After the adversary pass the child also checks that it got a 400×4×3-byte result (a stubbed `upscale` returning nothing made both cases fail). `npm test` passes.
- **Done (2026-11-15):** `test/quiet.test.js`, two cases (~0.4 s together): a child (`process.execPath -e`, `PUSHUP_QUALITY=fast PUSHUP_DEVICE=cpu`, 400×4 image) that prints nothing itself makes (a) one normal call, (b) one call rejected with `RangeError` (399×4, caught in the child) and then a normal call; asserts exit code 0, empty stdout, empty stderr, 20 s limit. Before writing it, ten runs of a normal call wrote 0 bytes to both streams (no onnxruntime warning in this environment, so no `[blocked]`). Mutation: `console.error` inside `upscale` made both cases fail; `src/` restored. Node 20 and 24 were not available here (CI runs them). No `src/` change.

### [x] DOC18 — (done 2026-11-15, docs/PERF.md Worker) `docs/PERF.md` Worker section: make the first-call deltas match the table
- **Goal:** the PR #130 and #132 reviews found that PERF.md's prose says the worker's first call costs "16–72 ms at 400×300 and 190–221 ms at 800×600", while the table cells differ by 16–73 and 189–222 ms (row 9 of `docs/OWNER_DECISIONS.md` quotes +16 to +222 ms). Same data, three slightly different roundings.
- **Accept:** in the "Worker (EL2, 2026-11-15)" section only, compute the first-call differences from the table's own cells (run 1 and run 2 of both sizes) and write them in the prose exactly as the arithmetic gives (e.g. "16–73 ms" and "189–222 ms"), keeping the sentence about noise and the later check run; make the "What was not measured" and bullet sentences agree with it. Row 9's cell and the README stay as they are if they already agree with those numbers; if not, change only the numbers. No new measurement, no change to any other section, `CLAUDE.md` or `src/`. README tests and `test/readme-links.test.js` pass. `npm test` passes.
- **Done (2026-11-15):** the Cold start bullet of "Worker (EL2)" now gives the first-call differences as the arithmetic of the table (worker minus direct): +73 and +16 ms at 400×300, +222 and +189 ms at 800×600 (was "16–72" and "190–221"), keeps the noise sentence and the later check run (+106/+72 ms), and says the largest difference is 222 ms next to "about 200 ms". Row 9 ("+16 to +222 ms") and the README ("tens of ms up to about 200 ms") already agree and are unchanged. The "What was not measured" bullet has no first-call numbers, so nothing to change there. No new measurement, no other section, `CLAUDE.md`, `src/` or README change.

### [x] F-2026-11-15-0733 — (done 2026-11-15, src/index.js + test/ort-loglevel.test.js + D16) CI red on `main`: `test/quiet.test.js` fails on GitHub runners, onnxruntime prints a warning to stderr
- **Goal:** EX3 (`test/quiet.test.js`, merged in #135) failed in CI (`test (22)` and `test (24)`, run 43685153516): with `PUSHUP_DEVICE=cpu`, the first `upscale` call writes this to stderr on the GitHub runner: `[W:onnxruntime:onnxruntime-node, device_discovery.cc:95 GetPciBusId] Skipping pci_bus_id for PCI path at "/sys/devices/LNXSYSTM:00/..." because filename "..." did not match expected pattern of [0-9a-f]+:[0-9a-f]+:[0-9a-f]+[.][0-9a-f]+`. It did not appear in the sandbox (10 of 10 runs clean), so EX3 was merged green locally; the CI result of its last head was not checked before the merge (a process slip: wait for CI on the final head). Real users on VMs with ACPI devices see the same line, so the library is not quiet there. EX3 said not to filter the output in the test and to record a finding; the test stays as it is.
- **Accept:** (1) the cause is found in `node_modules/onnxruntime-node`/`onnxruntime-common` (the node binding creates its ORT environment once, at first use, with `env.logLevel`, default `warning`, and the warning comes from that environment, not from a session); (2) a fix in `src/index.js` that does not touch the global setting of an application that chose its own level: when `ort.env.logLevel` still has its default (`'warning'`), set it to `'error'` before the first session is created; leave any other value alone; errors (e.g. the CUDA load error that README "Quality modes and GPU" documents) stay visible; (3) a test that a child process which sets `ort.env.logLevel = 'verbose'` before requiring `src/index.js` keeps it (so an explicit choice wins) and that a child with the default ends with `error`; (4) CI is the oracle for the warning itself: the PR's CI must be green on all jobs, including `test/quiet.test.js` on the runner; do not merge on a red or unfinished CI; (5) a note in `docs/DECISIONS.md` (new D-number) and one line in PROGRESS.md (W46 block) for this choice, since it sets a log level for a shared library setting. No other `src/` change; no change to output bytes. `npm test` passes.
- **Done (2026-11-15):** cause: `onnxruntime-node` calls `initOrtOnce(logLevel, ...)` once with `ort.env.logLevel` (default `'warning'`; `node_modules/onnxruntime-node/dist/binding.js`), and device discovery logs through that environment logger. Fix: in `src/index.js`, `if (ort.env.logLevel === 'warning') ort.env.logLevel = 'error';` right after requiring onnxruntime-node (explicit levels are kept). `test/ort-loglevel.test.js`, 3 cases, each in a child process: default becomes `error` with nothing on stderr; `verbose` chosen by the app is kept and shows the `device_discovery` start-up lines (so the level controls that logger; it is the mechanism check, because the CI warning itself cannot be reproduced in the sandbox); `fatal` is kept. Without the fix the first case fails. D16 and a PROGRESS line added. **Process note:** CI on the final head of a PR must be green before merging; the EX3 merge (#135) skipped that check, and the local run could not show the runner-only warning.

### [x] DOC19 — (done 2026-11-15, docs/DECISIONS.md D16 "Edge cases") `docs/DECISIONS.md` D16: two edge cases the PR #137 adversary found
- **Goal:** D16 (ONNX Runtime log level `error` unless the application chose one) does not say two things its reviewers established: (a) the check is `env.logLevel === 'warning'`, and the default cannot be told apart from an application that set `'warning'` itself before requiring PushUP, so that application also gets `error` (it can set `'warning'` again after requiring PushUP, before the first call); (b) `env` is a separate copy in each `worker_threads` worker, so the fix runs in a worker that requires PushUP too, and a level set on the main thread does not carry over to workers.
- **Accept:** add these two points to D16 (one or two sentences each, in the "Cost" or a new "Edge cases" bullet), nothing else in the file or the repo changes. Link test and README tests pass; `npm test` passes.

### [x] HP1 — (done 2026-11-18, test/bench-run-profile-threads.test.js) Test: a valid run of `bench/profile.js` and `bench/threads.js` prints its table
- **Goal:** the argument tests (BA2) only cover rejected flags. No test runs either script to the end, so a change in `src/` exports or in the table code can break a documented command (README "Development") and stay green. `node --test --experimental-test-coverage` (2026-11-18) shows `bench/profile.js` 26.6% and `bench/threads.js` 31.9% of lines.
- **Accept:** a new `test/bench-run-profile-threads.test.js` runs, as child processes, `node bench/profile.js --runs 1 --sizes 400` (about 1.6 s on 4 vCPU, 2026-11-18) and `node bench/threads.js --runs 1 --sizes 400 --threads 1` (about 4 s) and asserts exit code 0, one info line, one header line, then one data row per size (`400x300`; for `threads.js` one row for 1 thread and one for N = `os.availableParallelism()`, with `bytes_equal_N` `true` and `max_abs_diff` `0`), that every timing cell is a finite number, and that stdout holds no other lines (the CPU count may differ from 4: do not hard-code it). Set `PUSHUP_DEVICE=cpu` in the child so the onnxruntime line that `auto` writes to stderr on a machine without CUDA (see GP1) is not in play; do not assert on stderr text beyond "no `Error`/`TypeError`". Each case under 30 s. No change to the scripts unless a case exposes a real bug (say so in the PR). `npm test` passes.
- **Done (2026-11-18):** `test/bench-run-profile-threads.test.js`, 2 cases (about 6 s together), each script run as a child with `PUSHUP_DEVICE=cpu`: exit 0, no `Error` on stderr, info line, exact header cells, one `400x300` row of finite cells; `threads.js` rows for 1 and `os.availableParallelism()` threads with `bytes_equal_N` `true`, `max_abs_diff` `0`. No script change, no bug found.

### [x] HP2 — (done 2026-11-18, test/bench-run-throughput-cold.test.js) Test: a valid run of `bench/throughput.js` and `bench/cold.js` prints its table
- **Goal:** same gap as HP1 for the two scripts that start child processes (coverage 30.3% and 43.1%, 2026-11-18). A broken `--child` entry point would only show when a person runs the command.
- **Accept:** a new `test/bench-run-throughput-cold.test.js` runs `node bench/throughput.js --seconds 0.5 --sizes 100` (about 2 s) and `node bench/cold.js --modes fast --sizes 400 --warm 1` (about 1 s) with `PUSHUP_DEVICE=cpu`, and asserts exit 0, the info and header lines, three data rows for `throughput.js` (`1 x N`, `2 x N/2`, `4 x N/4`, with N from `os.availableParallelism()`; the 4-vCPU run shows `1 x 4`, `2 x 2`, `4 x 1`; image counts integers ≥ 1, `vs_1xN` of the first row `1.00x`) and one row for `cold.js` (cold and warm medians finite numbers). Do not assert absolute times. Under 30 s per case. No script change unless a case exposes a bug (say so). `npm test` passes.
- **Done (2026-11-18):** `test/bench-run-throughput-cold.test.js`, 2 cases (about 3 s together), children run with `PUSHUP_DEVICE=cpu`: exit 0, no `Error` on stderr, info and exact header cells, rows per configuration, finite cells, `vs_1xN` of the first row `1.00x`; `cold.js` one row with finite, positive cold and warm times and `warm n=1`. **Correction to this task's text:** the middle configuration of `bench/throughput.js` is `floor(N/2) x 2` (processes x threads; only when N >= 4), not `2 x N/2`; the test derives the rows from `os.availableParallelism()` like the script. No script change, no bug found.

### [x] HP3 — (done 2026-11-18, test/bench-run-memory.test.js) Test: a valid run of `bench/memory.js`, `bench/memory-breakdown.js` and `bench/memory-creep.js`
- **Goal:** same gap as HP1 for the three memory scripts (coverage 45.2%, 24.1%, 84.9%, 2026-11-18); they also start children.
- **Accept:** first run each at its smallest valid setting by hand (`--sizes 400`, `--high-sizes ''` for `memory.js`, which skips `high`; for `memory-creep.js` the smallest call count its flags allow) and put the wall time in the PR. A new `test/bench-run-memory.test.js` runs those that finish in under 20 s each (record in the test file any script left out, with its measured time, instead of dropping it silently; `high` runs are never included) with `PUSHUP_DEVICE=cpu`, and asserts exit 0, the header line, one row per size and factor (`memory.js` prints one row per factor, 1 and 1.5 by default), for `memory-breakdown.js` also the second table "whole-image arrays and tiles (arithmetic)" is present (say in the test whether its numbers are asserted), RSS cells finite and > 0 and not above 4000 MB. No absolute memory assertion tighter than that. No script change unless a case exposes a bug (say so). `npm test` passes.
- **Done (2026-11-18):** measured by hand (4 vCPU, `PUSHUP_DEVICE=cpu`): `memory.js --sizes 400 --high-sizes ''` 1.2 s (rows for factor 1 and 1.5); `memory-creep.js --calls 6 --size 400` 2.7 s; `memory-breakdown.js --sizes 400` 12.4 s and 882 MB peak, and it always loads `high`, so it is **left out** (recorded in the test file). `test/bench-run-memory.test.js`, 2 cases (about 4 s): exit 0, no `Error` on stderr, exact header, finite RSS cells > 0 and < 4000 MB, one row per factor for `memory.js`; for `memory-creep.js` the five output lines (title with `6 sequential calls`, `after call`, `RSS`, summary, median). No script change, no bug found.

### [x] HP4 — (done 2026-11-18, test/bench-run-arena-eventloop-worker.test.js) Test: a valid run of `bench/arena.js`, `bench/eventloop.js` and `bench/worker.js`
- **Goal:** same gap as HP1 for the remaining measuring scripts (coverage 31.4%, 33.7%, 30.0%, 2026-11-18).
- **Accept:** same method as HP3: measure the smallest valid run of each by hand first (`fast`, 400 px, fewest runs the flags allow; never `high`), then a new `test/bench-run-arena-eventloop-worker.test.js` runs those under 20 s with `PUSHUP_DEVICE=cpu` and asserts exit 0, the header line, the expected rows, finite numeric cells, and for `arena.js` that the output bytes of arena on and off are reported equal (the README and PERF.md say they are). Any script left out is recorded in the test file with its time. No script change unless a case exposes a bug (say so). `npm test` passes.
- **Done (2026-11-18):** measured by hand (4 vCPU, `PUSHUP_DEVICE=cpu`, `fast`, 400 px, fewest runs): `arena.js --runs 1 --cases fast:400` 2.4 s; `eventloop.js --sizes 400 --calls 1 --quality fast` 2.0 s; `worker.js --sizes 400 --calls 1` 2.2 s; none left out. `test/bench-run-arena-eventloop-worker.test.js`, 3 cases (about 7 s, 3 runs stable): exit 0, no `Error` on stderr, exact headers, expected rows, finite cells; `arena.js` arena-off row `bytes_equal_on` `true`, `max_abs_diff` `0`; `eventloop.js` idle, upscale and session.run rows; `worker.js` direct and worker rows and `bytes equal: yes`. No tick counts, gaps, times or RSS figures asserted (they depend on the machine). No script change, no bug found.

### [ ] GP1 — Do not try the CUDA provider on Linux when its libraries are not installed (no error line in `auto` mode)
- **Goal:** README "Quality modes and GPU" says that on Linux without CUDA the first call in `auto` mode logs one red onnxruntime error and that the user should set `PUSHUP_DEVICE=cpu` to avoid it. That makes the default setup noisy, which `test/quiet.test.js` (EX3) deliberately does not cover (it pins `PUSHUP_DEVICE=cpu`). Checked 2026-11-15 in this sandbox (`npm install --onnxruntime-node-install-cuda=skip`, so no CUDA libraries): `PUSHUP_QUALITY=fast PUSHUP_DEVICE=auto` on a 400×4 image succeeds, stdout is clean, and stderr holds one `[E:onnxruntime:..., provider_bridge_ort.cc:...] Failed to load library .../node_modules/onnxruntime-node/bin/napi-v6/linux/x64/libonnxruntime_providers_shared.so ... No such file or directory`. The failing file is `libonnxruntime_providers_shared.so`, **not** `libonnxruntime_providers_cuda.so` as README line ~89 says (so that README quote is wrong); the CUDA download puts `_shared.so`, `_cuda.so` and `_tensorrt.so` together in that binding directory (`node_modules/onnxruntime-node/script/install.js`, `BIN_FOLDER`).
- **Accept:** (1) reproduce it first and put the stderr in the PR; (2) in `src/index.js` add a small helper (exported with an underscore name, so a test can stub the directory) that returns whether `libonnxruntime_providers_shared.so` and `libonnxruntime_providers_cuda.so` both exist in the directory of the loaded onnxruntime-node binding (derive it from `require.resolve('onnxruntime-node')`, do not hard-code an install path; the binding lives in `bin/napi-v6/linux/x64/` below the package); call it from `getGpuSession` (not from `gpuProviders`, which `test/device.test.js` pins) and skip the `cuda` attempt only on Linux x64 and only when the helper says a file is missing; **if the directory cannot be resolved or read (bundlers, Electron asar, symlinked installs, an unexpected layout), attempt as before**: the check may only skip an attempt that would fail, never block one; when both files exist, behaviour is unchanged (the attempt, the fallback to CPU on any failure, `gpuBroken`); `dml` and `coreml` are untouched; no change in output bytes, mode choice or the contract; `PUSHUP_DEVICE=gpu` still warns `PushupWarning` when no provider can load; (3) tests: a unit test of the helper with a stubbed directory (both files / one missing / unreadable directory → "attempt as before"); a child process with `PUSHUP_DEVICE=auto PUSHUP_QUALITY=fast` that writes nothing to stdout/stderr when the files are absent (skip it with a clear message when they are present, as on a runner that downloads CUDA, where the attempt is expected); `test/device.test.js` and `test/device-fallback.test.js` pass unchanged; (4) README: correct the quoted file name, say the message now appears only where the CUDA libraries are installed but cannot be loaded (for example no driver), and keep `PUSHUP_DEVICE=cpu` as the way to skip the attempt; a D-number in `docs/DECISIONS.md` that says the check is by file existence in the binding directory and why it only skips, names the known risk (a later onnxruntime-node that renames or moves the CUDA provider libraries would make the check skip a working setup silently, so upgrading onnxruntime-node means re-checking these two file names; the README already says which CUDA version it expects) and says what `PUSHUP_DEVICE=gpu` prints when the check skips (the existing `PushupWarning`; name the missing file in it if that is a one-line change); (5) CI must be green on all jobs on the final head before the merge (CI runners download CUDA, so the skip branch is not exercised there: say so in the PR).

### [x] DOC20 — (done 2026-11-16, README "Quality modes and GPU") README: name the file that actually fails when CUDA libraries are missing
- **Goal:** README "Quality modes and GPU" (line ~89) says the first call on Linux without CUDA logs `Failed to load library ... libonnxruntime_providers_cuda.so`. Checked 2026-11-15 (GP1, PR #140): the file named in the real message is `libonnxruntime_providers_shared.so` (`PUSHUP_DEVICE=auto` on a 400×4 image, onnxruntime-node installed with `--onnxruntime-node-install-cuda=skip`). The quote is wrong, and a user searching for the message will not find it. GP1 (PR #140, not merged; blocked there on an owner decision) may change this paragraph later; this fix does not depend on that decision. GP1's Accept (4) also renames this file in the README: once DOC20 has landed, that part of GP1 is already done.
- **Accept:** in that README paragraph, only the quoted file name changes to `libonnxruntime_providers_shared.so`; the rest of the paragraph (harmless, caught, once per process, `PUSHUP_DEVICE=cpu` skips it) stays. Reproduce the message first and put the real stderr line in the PR. Check `grep -rn providers_cuda README.md docs src test` and change any other place that quotes the message the same way (not places that name the CUDA library as a requirement). No change to `src/`, tests or `CLAUDE.md`. README tests (`test/readme-*.test.js`) and `npm test` pass.

### [x] GATE2 — (done 2026-11-16, test/gate.test.js) Test: `bench/gate.js` rejects unreadable or wrongly shaped `--json` input
- **Goal:** `bench/gate.js` line 23 (the `throw` of the `expected {images, rows: [...]}` error, inside the `if` at line 22) is the only line of that file no test reaches (coverage 97.1%, from `node --test --experimental-test-coverage test/gate.test.js`, 2026-11-15). The `cannot read bench --json output` case (line 20) is already tested for a non-JSON file in `test/gate.test.js` (~line 111), but that test does not check that the message names the file. A broken input file must fail the gate with a clear message, never pass it.
- **Accept:** extend `test/gate.test.js` (same temp-dir fixture style, no new file) with cases that run `node bench/gate.js` and assert exit code 1 and the message: (a) extend the existing not-JSON case (do not duplicate it) to assert the message names the file; (b) a missing file; (c) valid JSON without `images` (e.g. `{"rows":[]}`); (d) valid JSON with `images` not an integer; (e) valid JSON whose `rows` is not an array; each for the `before` and the `after` argument (at least one case per argument). The message must name the file. No change to `bench/gate.js` unless a case exposes a real bug (say so in the PR). Coverage of `bench/gate.js` reaches 100% lines (put the figure in the PR). `npm test` passes.

### [x] BM1 — (done 2026-11-16, bench/method.js + test/bench-method.test.js) Test: the method names `bench/bench.js` accepts (`sr-full`, `sr-<px>`, `sr:<path>`, `@mix`, `#tile`)
- **Goal:** `method()` in `bench/bench.js` parses names like `sr-full#192@0.2` and `sr:models/x.onnx` inline, so nothing tests the parsing (the body of `method()`, lines 37–53, is the uncovered part of that file). A wrong parse silently benchmarks the wrong setting.
- **Accept:** move the name parsing into a pure function `parseMethod(name)`. `bench/bench.js` runs on load (it reads `process.argv` and starts its async body at the top level, and has no `module.exports`), so either put `parseMethod` in its own file `bench/method.js` that `bench.js` requires, or guard the run with `require.main === module` as `bench/gate.js` does; a test must be able to require it without starting a benchmark. Export it with a test-only underscore name if it stays in `bench.js` (as `src` does) returning `{ kind, opts }` or equivalent, with `method()` calling it; the benchmark output for `--methods lanczos,sr-full` on `bench/out/sub20` (if present; otherwise on three images from `bench/out/set`, or on a generated 400×300 image) is the same JSON before and after, ignoring timing fields such as `ms` (record both in the PR; if the set is not available, compare `parseMethod` against the old inline logic on the cases below and say so). A new `test/bench-method.test.js` pins: `lanczos`; `sr-full`; `sr-600` (`modelInputMax` 600); `sr-full@0.2` (`lanczosMix` 0.2); `sr-full#192` (`tile` 192); `sr-full#192@0.2` (`tile` 192 and `lanczosMix` 0.2: the supported order, `#tile` then `@mix`); `sr-full@0.2#192` (today `@` is cut first, so the mix is `Number('0.2#192')` = NaN and the tile is lost, name `sr-full`: pin what the code does as a known quirk, do not change the parse, and note it in the PR); `sr:models/4xLSDIRCompactC3.onnx` resolves to an absolute `modelPath`. No change to what the benchmark measures or prints. `test/readme-bench.test.js` and `npm test` pass.

### [x] DOC21 — (done 2026-11-16, docs/OWNER_DECISIONS.md row 10) `docs/OWNER_DECISIONS.md`: add the GP1 decision (skip the CUDA attempt vs. keep the tests unchanged)
- **Goal:** GP1 (PR #140, branch `overnight/2026-11-15-GP1`) is blocked on an owner choice, but `docs/OWNER_DECISIONS.md` ("one list of what is waiting for the owner") has no row for it (`grep -c GP1 docs/OWNER_DECISIONS.md` gives 0, checked 2026-11-16), so the owner would not find it there.
- **Accept:** add row 10 to the table in `docs/OWNER_DECISIONS.md`, same four columns as the other rows: the decision (skip the `cuda` provider attempt on Linux x64 when `libonnxruntime_providers_shared.so` or `libonnxruntime_providers_cuda.so` is missing next to the binding, which silences the red onnxruntime line in `auto` mode, vs. only fixing the README quote, which DOC20 already did); the evidence (the "Blocked (2026-11-15 ...)" paragraph of GP1 on its branch and PR #140, plus the four stubbing tests that expect a CUDA attempt on Linux x64: `high + GPU failing at run time retries on CPU...`, `high: after one run-time GPU failure...`, `an empty setting means auto`, `a GPU that fails while running falls back to CPU and retries`); and what to say to unblock (**(a)** "let those tests stub the helper (`pushup._missingCudaLibs = () => []`), assertions unchanged", then a run rewrites GP1's Accept and sets it to `[ ]`; or **(b)** "drop the skip", then a run closes GP1). Update the "last updated" date. Check the four test names against `test/device.test.js` and `test/device-fallback.test.js` on `main` and fix the row if a name differs. Docs only: no change to `src/`, tests, `CLAUDE.md`. `npm test` passes.

### [x] BM2 — (done 2026-11-16, test/bench-method.test.js) Test: the edge cases of `parseMethod` that the BM1 tests did not catch
- **Goal:** when BM1 landed (2026-11-16, `bench/method.js`), a mutation run showed two changes that `test/bench-method.test.js` does not catch: making the `lanczos` check `name.startsWith('lanczos')` (today only the exact name `lanczos` is the plain resize, so `lanczos@0.2` goes down the model path), and changing `at > 0` to `at >= 0` (a name that starts with `@` or `#` is not parsed as a suffix). A benchmark command with a typo would otherwise measure the wrong thing silently.
- **Accept:** extend `test/bench-method.test.js` (no new file) to pin what the code does today, with a comment saying these are the current behaviours of a benchmark tool, not a contract: `lanczos@0.2` is `{kind:'sr', opts:{lanczosMix:0.2}}` (name `lanczos` then goes to `modelInputMax: NaN`: assert `Number.isNaN`); `@0.2` and `#192` (suffix at index 0: no `lanczosMix`/`tile` key; `modelInputMax` NaN); `sr-` (`modelInputMax` 0, since `Number('')` is 0, so it is not NaN); the empty string (`modelInputMax` NaN, since `''.split('-')[1]` is undefined); `sr-full@` (`lanczosMix` 0, same reason as `sr-`). Check the test fails for both mutations named above (apply each by hand in a throwaway copy, say so in the PR). No change to `bench/method.js` or `bench/bench.js`. `npm test` passes.

### [x] PD1 — (done 2026-11-16, test/pad-args.test.js) Test: `bench/pad.js` rejects a bad `--limit`, a missing directory and an empty directory
- **Goal:** `bench/pad.js` (BK11) has three input checks (lines ~22, ~23, ~74: `--limit must be a positive integer`, `<dir> does not exist; run bash bench/fetch_testset.sh`, `no images in <dir>`), and no test mentions the script (`grep -l "pad.js" test/*.js` finds none, 2026-11-16). The sibling scripts have such tests (`test/edges-args.test.js`, `test/eventloop-args.test.js`, `test/worker-args.test.js`).
- **Accept:** a new `test/pad-args.test.js` runs `node bench/pad.js` as a child process and asserts exit code 1, the exact first stderr line, and that it returns in under 5 s, for: `--limit 0`, `--limit -1`, `--limit 1.5`, `--limit abc`; `--dir <path that does not exist>` (message names the path); `--dir <empty temp dir>` (message `no images in <dir>`); and a temp dir that holds only a non-image file. Each case must stop before the model is loaded (no stdout). No change to `bench/pad.js` unless a case exposes a real bug (say so in the PR). `npm test` passes.

### [x] BA2 — (done 2026-11-16, bench/threads.js + bench/profile.js + test/threads-profile-args.test.js) Validate `--runs`, `--sizes` and `--threads` in `bench/threads.js` and `bench/profile.js`
- **Goal:** both scripts read their flags with `Number(...)` and no check (`bench/threads.js` lines ~18–21, `bench/profile.js` lines ~15–17), so `--runs abc` or `--sizes 10` fails late with an unrelated error, or loops with `NaN`. Scripts that were already fixed (`bench/edges.js`, `bench/eventloop.js`, `bench/worker.js`, `bench/memory-creep.js`) reject such values at once with one stderr line naming the flag; copy their style (a one-line `console.error` naming the flag, then exit 1, before the model loads; `eventloop.js`, `memory-creep.js` and `worker.js` use a `fail()` helper for it, `edges.js` does it inline).
- **Accept:** `bench/threads.js` and `bench/profile.js` reject, with a one-line message naming the flag and exit 1 before the model loads: `--runs` not an integer ≥ 1; `--sizes` not a comma list of integers from 400 to 800; `bench/threads.js` only: `--threads` not a comma list of integers ≥ 1; `bench/profile.js` only: `--factor` not a positive number. Defaults and valid values behave exactly as before (same output for the default run; do not run it in the test). A new `test/threads-profile-args.test.js` checks the exact first stderr line, exit 1 and under 5 s for each flag and script, and one valid-flag case per script that is stopped by a different bad flag (as in `test/memory-creep-args.test.js`). The usage lines mention the ranges (`test/readme-bench.test.js` still passes). No `src/` change. `npm test` passes.

### [x] BA3 — (done 2026-11-16, bench/arena.js + bench/cold.js + test/arena-cold-args.test.js) Validate `--runs`, `--cases`, `--sizes`, `--modes` and `--warm` in `bench/arena.js` and `bench/cold.js`
- **Goal:** same gap as BA2, for the two scripts that start child processes: `bench/arena.js` (`--runs`, `--cases fast:400,...`, lines ~79–80) and `bench/cold.js` (`--sizes`, `--modes`, `--warm`, `--factor`, lines ~40–43) pass unchecked values to a child, which then fails after the model loads, per case.
- **Accept:** in the parent process (not the child), before any child starts: `bench/arena.js` rejects `--runs` not an integer ≥ 1, and a `--cases` entry that is not `<fast|high>:<400–800>`; `bench/cold.js` rejects `--sizes` not a comma list of integers from 400 to 800, `--modes` containing anything but `fast` or `high`, `--warm` not an integer ≥ 1 (`--warm 0` is not valid today: `warmMs` is empty, `median([])` is undefined and the parent's `wm.toFixed(0)` throws a `TypeError`; add `--warm 0` to the test as a rejected value), `--factor` not a positive number. One stderr line naming the flag, exit 1. The child entry points (`--child`) and valid runs are unchanged. A new `test/arena-cold-args.test.js` checks the exact first stderr line, exit 1 and under 5 s for each flag and script. Update the usage lines if they do not give the allowed values. No `src/` change. `npm test` passes.

### [x] BM3 — Test: `parseMethod` rejects nothing, but its trailing-junk results should be pinned (`sr-full#192x`, `sr-full2`, `sr-600x`, `sr-full@0.2x`) (done 2026-11-17, test/bench-method.test.js)
- **Goal:** the BM2 mutation run (2026-11-16) found two mutants of `bench/method.js` that no test catches: `Number(...)` replaced by `parseFloat(...)` on the `#<tile>` value (`sr-full#192x` is a NaN tile today; with `parseFloat` it would silently be 192), and `name !== 'sr-full'` replaced by a prefix check (`sr-full2` has `modelInputMax` NaN today). A typo in a benchmark command must not silently measure a different setting.
- **Accept:** extend `test/bench-method.test.js` (no new file) with, as the current behaviour of a benchmark tool (say so in a comment, as BM2 does): `sr-full#192x` → `{kind:'sr', opts:{tile: NaN}}`; `sr-full2` and `sr-600x` → `modelInputMax` NaN (no other key); `sr-full@0.2x` → `lanczosMix` NaN; `sr-600-1` → `modelInputMax` 600 (only the second `-` part is read); `sr:` → `modelPath` equal to `path.resolve('')` (an empty path resolves to the current directory). Use `Number.isNaN`. Check that the test fails for both mutants named above (apply by hand to a throwaway copy, say so in the PR). No change to `bench/method.js` or `bench/bench.js`. `npm test` passes.

### [x] BA4 — Validate `--seconds` and `--sizes` in `bench/throughput.js`, and `--sizes` in `bench/memory-breakdown.js` (done 2026-11-17, bench/throughput.js + bench/memory-breakdown.js + test/throughput-breakdown-args.test.js)
- **Goal:** same gap as BA2/BA3. `bench/throughput.js` (`main()`, lines ~114–115) reads `--seconds` and `--sizes` with bare `Number(...)`, and `bench/memory-breakdown.js` (line ~96) reads `--sizes` with `.filter(Boolean).map(Number)`, so `--seconds abc` makes the measure loop end at once or never (`NaN`), and a trailing comma in `--sizes` is dropped silently. **The valid ranges differ per script** (checked 2026-11-16): `throughput.js` only calls `session.run` on a synthetic input (never `upscale`), so a decimal `--seconds 0.5` and `--sizes 200` work today and must keep working; `memory-breakdown.js` calls `_run`, which enforces the contract range 400–800.
- **Accept:** in the parent (`main()` / the non-child branch), before any child starts: `throughput.js` rejects `--seconds` that is not a finite number ≥ 0.5 (message `--seconds must be a number >= 0.5`; a decimal such as `0.5` stays valid, checked 2026-11-16; below that the loop can end with zero images in a configuration and the table row throws, e.g. `--seconds 0.0001` crashes with a `TypeError` on `toFixed`) and `--sizes` that is not a comma list of integers from 1 to 800 (message `--sizes must be a comma list of integers from 1 to 800`; `--sizes 200` stays valid; the cap is the contract maximum, because a whole-image model run at 4000 px was killed for lack of memory in this sandbox on 2026-11-16); `memory-breakdown.js` rejects `--sizes` that is not a comma list of integers from 400 to 800 (message `--sizes must be a comma list of integers from 400 to 800`). In both, a trailing comma or an empty entry is rejected, not dropped. One stderr line naming the flag, exit 1, no stdout (copy `bench/threads.js` / `bench/arena.js` after BA2/BA3: a `fail()` helper, `String(arg(...))` so a flag without a value is rejected too). The `--child`, `--tiles` entry points, the `--arena` switch and valid runs are unchanged (run one valid run of each by hand and say so in the PR; `bench/throughput.js` with `--seconds 1 --sizes 400` and `bench/memory-breakdown.js --sizes 400`; also `bench/throughput.js --seconds 0.5 --sizes 200` must still run). Usage lines state the allowed values (`test/readme-bench.test.js` still passes). New `test/throughput-breakdown-args.test.js`: exact first stderr line, exit 1, empty stdout, under 5 s, per flag and script, plus one valid-`--sizes` case stopped by a bad `--seconds`, and the accepted-value cases `--seconds 0.5` and `--sizes 200` and `--sizes 800` for `throughput.js` (stop each run with a following bad flag, e.g. `--seconds 0.5 --sizes x`, so no model starts and the message names the later flag). No `src/` change. `npm test` passes.
- **Decision (2026-11-17, resolves the review's open issue):** the `throughput.js` `--sizes` floor is **100**, not 1: `--sizes 1` made thousands of latency entries per child and rows went missing (`--sizes 2` and `3` printed all). 100 is far below the contract's 400–800, so it keeps every useful value. As the first step, run `node bench/throughput.js --seconds 30 --sizes 100` (and `--seconds 0.5 --sizes 100`) and check every row prints; if a row is missing, raise the floor until all rows print and record the measured bound in the Done note. Also check `--seconds 0.5 --sizes 800` once. Any other floor in this task that says 1 for `--sizes` means 100, including the exact message (`from 100 to 800`, not `from 1 to 800`).
- **Done (2026-11-17):** floor 100 measured: `--seconds 0.5 --sizes 100,800` and `--seconds 30 --sizes 100` print every row (100x75: 1121/1226/1294 images in 30 s for 1x4/2x2/4x1; 800x600 at 0.5 s: 1/2/4 images, one per configuration); the bound stayed 100. Valid runs by hand: `throughput.js --seconds 1 --sizes 400`, `memory-breakdown.js --sizes 400`. 28 new test cases, `npm test` 307/307.

### [x] BA5 — Validate `--sizes`, `--factors` and `--high-sizes` in `bench/memory.js` (done 2026-11-17, bench/memory.js + test/memory-args.test.js)
- **Goal:** `bench/memory.js` (lines ~45–47, parent branch) reads `--sizes` and `--high-sizes` with bare `Number(...)` and `--factors` as raw strings, which are passed to a child (`factor` becomes `Number(process.argv[5])` there), so a bad value fails after the model has loaded. `--high-sizes ''` is allowed today (`filter(Boolean)`: no `high` jobs) and must stay allowed, since it is the way to skip `high` (check the README and `docs/PERF.md` for how `bench/memory.js` is invoked).
- **Accept:** in the parent, before any child starts: `--sizes` not a comma list of integers from 400 to 800 is rejected; `--high-sizes` is rejected unless it is empty or a comma list of integers from 400 to 800; `--factors` not a comma list of positive finite numbers is rejected (the default `1,1.5` and the documented values keep working). One stderr line naming the flag, exit 1, no stdout, using the style of `bench/arena.js`. Valid runs and the child entry point are unchanged (one valid run by hand: `--sizes 400 --factors 1 --high-sizes ''`; say so in the PR). Usage line states the allowed values. New `test/memory-args.test.js` (name must not collide with `test/memory-creep-args.test.js`): exact first stderr line, exit 1, empty stdout, under 5 s, per flag, plus one valid-`--sizes` case stopped by a bad `--factors`, and a check that `--high-sizes ''` is not rejected (run with a bad `--factors` after it and see that the `--factors` message comes, not a `--high-sizes` one). No `src/` change. `npm test` passes.

### [x] BE3 — `bench/bench.js`: reject a missing or empty image directory and a bad `--limit` / `--sizes` with one clear line (done 2026-11-17, bench/bench.js + test/bench-args.test.js)
- **Goal:** `node bench/bench.js` without a directory, or with a directory that does not exist, ends in a Node stack trace (`Error: ENOENT: no such file or directory, scandir ...`, checked 2026-11-16 with `/nonexistent`), and an empty directory silently prints an empty table. `--limit` and `--sizes` are read with bare `Number(...)`. This is the script every quality gate runs, so a typo should say what is wrong. `bench/pad.js` already does this for its directory (`test/pad-args.test.js`).
- **Accept:** `bench/bench.js` (flag parsing at the top, lines ~14–25, before the async body): no `<dir>` argument, **or a first argument that starts with `--`** (today `node bench/bench.js --sizes 400` takes `--sizes` as the directory) → one line `usage: node bench/bench.js <dir-of-HR-images> [...]`-style message and exit 2 (the convention of `bench/gate.js`: 2 = usage error); a directory that does not exist → `<dir> does not exist; run bash bench/fetch_testset.sh` and exit 1; a directory without images (same extension filter as the script) → `no images in <dir>` and exit 1; `--limit` not an integer ≥ 1 → `--limit must be a positive integer` and exit 1; `--sizes` not a comma list of integers from 1 to 4000 → `--sizes must be a comma list of integers from 1 to 4000` and exit 1 (**no 400–800 range**: the `lanczos` method never calls `_run`, so other sizes work today with `--methods lanczos`; `--sizes 4000` works there and `--sizes 100000` ends in a sharp pixel-limit stack trace, both checked 2026-11-16; the model methods already fail on their own for sizes outside 400–800). A flag given without a value (`--sizes` as the last argument, `opt()` returns `undefined`) is rejected like a bad value: wrap the values in `String(...)` first. No change to what the benchmark measures or prints for valid input: compare `--methods lanczos --sizes 400 --json` on three generated images before and after (same JSON, ignoring `ms`) and put it in the PR. New `test/bench-args.test.js` (exact first stderr line, exit code, empty stdout, under 5 s, per case, including a first argument that is a flag and a flag without a value; temp dirs for the empty and non-image cases; accepted cases `--methods lanczos --sizes 200` and `--sizes 4000` run on a generated image dir, with their JSON checked for `images` 1, and a rejected `--sizes 4001`). `test/bench-json.test.js` and `test/readme-bench.test.js` pass unchanged. No `src/` change. `npm test` passes.

- **Decision (2026-11-17, resolves the review's open issue):** (1) 4000 is a deliberate sanity cap: `--sizes` above 4000 is rejected on purpose even though some larger values run today (the sharp JPEG limit is near 65500, not tested). (2) The `--sizes` floor is **100**, not 1: on a 1000×10 PNG `--sizes 1` and `--sizes 4` crash in sharp because the height rounds to 0, `--sizes 100` works. Where the Accept list above says a floor of 1 or a different bound for `--sizes`, read integers 100–4000; the exact message says `from 100 to 4000`, not `from 1 to 4000`.

### [x] BU1 — `bench/flags.js`: reject an unknown or misspelled flag in `bench/bench.js`, `bench/throughput.js`, `bench/memory.js` and `bench/memory-breakdown.js` (done 2026-11-17, bench/flags.js + test/flags.test.js)
- **Goal:** BA2–BA5 and BE3 made the *values* of known flags fail early, but a misspelled flag is still ignored and the run silently uses the defaults. Checked 2026-11-17: `node bench/bench.js <dir> --methods lanczos --size 400 --json` and `--sizes=999` both run with the default sizes (the `=` form is not parsed at all), and `node bench/memory-breakdown.js --sizess 400` runs the default sizes. For the quality gate (`bench/bench.js`) a typo like that gives numbers for the wrong setting.
- **Accept:** a new pure module `bench/flags.js` exporting `checkFlags(argv, { values: [...], switches: [...] })` (argv = the arguments after the script name, without any directory argument the script takes first): returns `null` when every `--...` token is a listed value flag (`--sizes`, followed by its value) or a listed switch (`--json`), otherwise a one-line message `unknown flag <token>; allowed: <comma list>` for the first unknown `--` token; a token `--name=value` is unknown (message says `use "--name value"`). The value that follows a value flag is skipped, not checked as a flag (so `--sizes --json` is not reported as unknown: the script's own value check then rejects `--json` as a bad `--sizes` value with its normal message, and a test asserts that real message). Call it in the parent of the four scripts, before their own value checks (in `bench/bench.js` after the existing first-argument usage check, as `checkFlags(args.slice(1), ...)`: a missing directory or a flag in first position stays the exit-2 usage error, so the bench.js test case passes an existing directory first), with their real flag lists (read each script; keep internal `--child` / `--tiles` entry points working: they are argv[2] / `process.argv.includes('--child')`, never passed by a user, and must not be rejected). One stderr line, exit 1, empty stdout, as in BA2–BE3. Valid runs unchanged (one by hand per script, said in the PR; for `bench/bench.js` the JSON of `--methods lanczos --sizes 400 --json` on three generated images is identical before and after, ignoring `ms`). New `test/flags.test.js` (unit tests of `checkFlags`: unknown, `=` form, value-flag skip, switch, empty list; one test that each of the four scripts rejects `--size` / `--sizes=400` with the exact first stderr line, exit 1, empty stdout, under 5 s) and the existing `test/*-args.test.js`, `test/readme-bench.test.js`, `test/bench-json.test.js` pass unchanged. No `src/` change. `npm test` passes.
- **Notes:** one run: one small module, four call sites, one test file. The remaining bench scripts are BU2.
- **Done (2026-11-17):** `bench/flags.js` `checkFlags`, called in `bench/bench.js` (after the usage check, `args.slice(1)`), `throughput.js`, `memory.js`, `memory-breakdown.js` (`--arena` is a switch there). One consequence for an existing test: `test/readme-bench.test.js` fails for any new `bench/*.js` file without a `// Usage:` line, so `flags.js` was added to its exempt list with a reason, as `method.js` was in BM1 (no assertion changed or weakened). 18 tests in `test/flags.test.js`, `npm test` green.

### [x] BU2 — Apply `bench/flags.js` to the other bench scripts (run after BU1) (done 2026-11-17, nine bench scripts + 7 *-args tests)
- **Goal:** the same silent-typo gap in the rest of the bench scripts with flags: `bench/arena.js`, `bench/cold.js`, `bench/threads.js`, `bench/profile.js`, `bench/eventloop.js`, `bench/worker.js`, `bench/memory-creep.js`, `bench/edges.js`, `bench/pad.js`. Scripts that take no flags (`bench/colors.js`, `bench/aspect.js` is a library) are out of scope.
- **Accept:** each script calls `checkFlags` (from BU1) in its parent branch before its own value checks, with its real flag lists, read from the script and its `Usage:` comment (`edges.js` has switches `--include-border`; `--arena` is a **switch** in `memory-breakdown.js` but a **value flag** (`--arena on|off`, documented in README) in `memory-creep.js`: list it as such, or `--arena off` is wrongly rejected; `pad.js` has `--dir` and `--limit`; child entry points stay unchanged). One stderr line, exit 1, empty stdout, before any model loads. Extend each script's existing `test/*-args.test.js` with one unknown-flag case and one `--name=value` case (exact first stderr line, under 5 s), or add `test/flags-scripts.test.js` for the scripts without an args test; no existing assertion changes. One valid run per script by hand is not needed (the existing tests and `test/readme-bench.test.js` cover valid values); say in the PR that none of the documented invocations in README / `docs/PERF.md` is rejected (`grep -rn 'node bench/' README.md docs` and run `checkFlags` over each line's flags in a throwaway script, report the count). No `src/` change. `npm test` passes.
- **Notes:** only start after BU1 is merged; split into two PRs by script if the diff gets large (record the split on the task).
- **Done (2026-11-17):** `checkFlags` in `arena.js`, `cold.js`, `threads.js`, `profile.js`, `eventloop.js`, `worker.js`, `memory-creep.js` (`--arena` is a value flag there), `edges.js` (switch `--include-border`), `pad.js`; one PR (no split). Two cases (`--bogus 1`, `--sizes=400`) appended to each of the seven existing `*-args` test files (the args tests of arena+cold and threads+profile cover two scripts each); `test/flags-scripts.test.js` was not needed. All 40 documented `node bench/...` invocations of twelve of the thirteen scripts that use `checkFlags` (these nine plus throughput, memory, memory-breakdown, not bench.js; 31 of them for the nine here) in README, docs, CLAUDE.md, package.json and `.claude` pass `checkFlags` (throwaway script, 0 rejected). `npm test` green.

### [x] DOC22 — README "Development": say that bench scripts reject bad and unknown flags before any model loads (run after BU2) (done 2026-11-17, README Development + test/readme-bench.test.js)
- **Goal:** README "Development" lists the bench scripts (DOC6) but does not say that a typo in a flag or value now ends in one clear line (BA2–BA5, BE3, BU1, BU2), so a reader may expect a stack trace or silent defaults.
- **Accept:** one short paragraph in README "Development" under the bench script list: every `bench/` script that takes flags checks them before loading a model (`bench/colors.js` takes none, `bench/gate.js` is positional), prints one line naming the problem and exits 1 (`bench/gate.js` and the `bench/bench.js` usage error exit 2), and unknown flags and the `--flag=value` form are rejected; name `test/flags.test.js` and the `*-args.test.js` files as the tests that keep it true. Extend `test/readme-bench.test.js` or `test/readme-links.test.js` with a check that the files named in the paragraph exist (follow how they check other README paths). Docs and test only, no `src/` or `bench/` change. `npm test` passes.

### [x] PD2 — `bench/pad.js --dir <a file>` ends in one clear line, not a stack trace (done 2026-11-17, bench/pad.js + test/pad-args.test.js)
- **Goal:** found 2026-11-17 by the DOC22 adversary and checked by hand: `node bench/pad.js --dir README.md` prints a multi-line `Error: ENOTDIR: not a directory, scandir ...` stack trace and exits 1 (`bench/pad.js` line ~76, the `readdirSync`). A missing directory and an empty directory already give one line (`test/pad-args.test.js`, PD1); a path that is a file does not.
- **Accept:** `bench/pad.js` checks that `--dir` is a directory (`fs.statSync(dir).isDirectory()`) in the same place as the existing "does not exist" check, before the model is loaded, and prints one line `<dir> is not a directory` to stderr, exit 1, empty stdout (the same wording as `bench/bench.js` after BE3). A missing path and an empty directory keep their current messages. Add one case to `test/pad-args.test.js` (a temp file passed as `--dir`: exact first stderr line, exit 1, empty stdout, under 5 s) and keep the other cases unchanged. No `src/` change. `npm test` passes.
- **Notes:** one run, one script, one test case.

### [x] BU3 — `bench/flags.js`: reject a stray word that no flag consumes (done 2026-11-17, bench/flags.js + test/flags.test.js)
- **Goal:** after BU1/BU2 an unknown flag is rejected, but a stray plain word is still ignored. Checked 2026-11-17: `node bench/throughput.js --seconds 0.5 --sizes 400 800` runs only size 400 (the `800` is silently dropped, the table has no 800 row); the same holds for the other scripts (e.g. `--sizes 400, 800`, which the shell splits into two arguments). A comma list typed with a space is a likely typo and gives numbers for fewer sizes than intended.
- **Accept:** `checkFlags(argv, spec)` gets an optional `positional` count (default 0; `bench/bench.js` keeps calling it with `args.slice(1)`, so it needs no other value; the stray-word check there runs after the flag check, because `bench.js` reads its own values with `indexOf`: a non-flag token that is not the value of a value flag and is beyond the allowed positional count returns `unexpected argument <token>; a flag takes one value, write a list as "400,800" without spaces` (for a word after a switch: `unexpected argument <token> after the switch <flag>`). A token that follows a **switch** (`--json`, `--include-border`, `--arena` on `memory-breakdown.js`) is stray too. Negative numbers (`-1`) are plain words and reach the script's own value check as the value of their flag, as today. All thirteen call sites (arena, bench, cold, edges, eventloop, memory-breakdown, memory-creep, memory, pad, profile, threads, throughput, worker) keep passing their current specs, so every documented invocation still passes (re-run the `grep -rn 'node bench/' README.md docs CLAUDE.md package.json .claude` check from BU2 and report the count). One stderr line, exit 1, empty stdout, before any model loads. Extend `test/flags.test.js` with unit cases (stray word after a value, stray word after a switch, stray word first, empty-string value of a value flag is a value, `--sizes 400 800`) and add one stray-word case per script as a table in `test/flags.test.js` (extend its `SCRIPTS` table, today four scripts, to all thirteen), with this argv per script: `--sizes 400 800` for `cold.js`, `threads.js`, `profile.js`, `eventloop.js`, `worker.js`, `throughput.js`, `memory.js`, `memory-breakdown.js`; `--runs 1 2` for `arena.js`; `--calls 6 7` for `memory-creep.js`; `--limit 1 2` for `pad.js`; `--factors 1.5 2` for `edges.js`; `<dir> --limit 1 2` for `bench.js` (an existing temp directory first); plus a switch case `--arena maybe` for `memory-breakdown.js` (exact first stderr line, exit 1, empty stdout, under 5 s). No `src/` change. `npm test` passes.
- **Notes:** `--high-sizes ''` (an empty string value) must stay valid on `bench/memory.js`; `bench/memory-breakdown.js --arena maybe` becomes rejected, which is intended (check that no test or doc relies on it).
- **Done (2026-11-17):** `checkFlags` has a `positional` count (default 0; no call site needs more). A stray plain word is `unexpected argument <token>; a flag takes one value, ...` or `... after the switch <flag>`. The existing unit test "plain words and negative numbers are not flags" asserted that `['dir', '-1', '']` passes; it now passes `positional: 3` (the stray-word rule is the point of this task; the assertion about what is not a flag is unchanged). New stray-word table in `test/flags.test.js` for all thirteen scripts (a separate `STRAY_ARGV` table, the `SCRIPTS` table stays at four) plus `--arena maybe`. Documented invocations: 34 real invocations of the twelve scripts in README, docs, CLAUDE.md, package.json and `.claude` pass (6 more lines are bracketed usage templates like `node bench/profile.js [--runs 5]` in `docs/PERF.md:5`, not runnable). `--high-sizes ''` stays valid (valid run by hand). `npm test` 415/415.

### [x] BM4 — `bench/bench.js --methods`: reject a method name that parses to NaN or is not a known form (done 2026-11-17, bench/method.js validateMethod + bench/bench.js + test/bench-method-validate.test.js)
- **Goal:** found 2026-11-17 by the DOC22 adversary and checked by hand: `node bench/bench.js <dir> --methods sr-ful --sizes 400 --json` runs and prints a row `400px sr-ful` with PSNR 12.87 — `parseMethod('sr-ful')` gives `modelInputMax: NaN`, which the model path accepts, so a typo in a method name produces meaningless numbers in the script every quality gate runs. `test/bench-method.test.js` (BM1–BM3) pins the NaN results of `parseMethod` as the current behaviour; this task must not change `parseMethod` itself.
- **Accept:** add `validateMethod(name)` to `bench/method.js` (exported next to `parseMethod`; pure) returning `null` for a valid name and otherwise a one-line message `unknown method <name>; use lanczos, sr-full, sr-<max input px>, sr:<model path>, each with optional #<tile> and @<mix 0-1>`. Valid: `lanczos`; `sr-full`; `sr-<n>` with n matching `^[1-9]\d*$`; `sr:<non-empty path>`; and, for the `sr` forms only, an optional `#<n>` tile (n matching `^[1-9]\d*$`) and an optional `@<m>` mix (m matching `^(0(\.\d+)?|1(\.0+)?)$`, so `0`, `0.2`, `1`, `1.0` pass and `.5`, `1.`, `00.5`, `2`, `1e-1` do not), in the order `#tile@mix`. `--methods` as the last argument (no value) is handled like the other flags: `String(opt(...))` first, then the same message `--methods must be a comma list of method names` (also for an empty entry such as `lanczos,`). The same split as `parseMethod` applies (the `@` part is cut first, then `#`), so a model path that itself contains `@` or `#` cannot be used, as today. Everything else is invalid, including an empty suffix (`sr-full@`, `sr-full#`, `sr:@0.1`), `sr-600-1` (`parseMethod` reads 600 from it; the validator rejects it), a mix or tile written as `1e-1`, `0x1` or with a space, and `sr-ful`, `sr-full2`, `sr-600x`, `sr-full#192x`, `sr-full@0.2x`, `sr-full@2`, `sr:`, `lanczos@0.2`, `sr-` and the empty string (check each against the pinned or computed `parseMethod` results (`test/bench-method.test.js` pins most; compute the rest, e.g. `sr-full@2`, `1e-1`) and list in the PR which of them `parseMethod` parses to NaN and which it parses to a number: `sr-` gives `modelInputMax` 0, `sr:` gives the current directory, `sr-full@2` an out-of-range mix, `sr-full@` a mix of 0). `bench/bench.js` calls `validateMethod` on every `--methods` entry in its argument checks (after the flag check, before any image is read) and exits 1 with that line, empty stdout; the documented method names (`grep -rn -- '--methods' README.md docs CLAUDE.md package.json .claude`, including `sr-full#192@0.2`-style names if documented) must all pass: report the list and count in the PR (6 method-name hits today: README.md:189, 199, 201, 215, CLAUDE.md:43, `.claude/agents/bench-runner.md:18`, all `lanczos,sr-full`; the script's own default `lanczos,sr-full,sr-500,sr-250` must pass too; README.md:341 is the sentence to rewrite). `bench/bench.js` output for valid methods is unchanged (compare `--methods lanczos,sr-full --sizes 400 --json` on one generated image before and after, ignoring `ms`). New tests in a new `test/bench-method-validate.test.js` (unit cases for every name above, plus one script-level case: `--methods sr-ful` gives the exact first stderr line, exit 1, empty stdout, under 5 s, and a mutation check by hand that dropping the NaN/range checks fails it) and `test/bench-method.test.js`, `test/bench-args.test.js` pass unchanged. Update README line ~341 ("The names given to `bench/bench.js --methods` are not checked: an unknown name runs ..."), which becomes false, to say the names are checked; no test pins that wording today (grep `test/` to confirm). No `src/` change. `npm test` passes.
- **Notes:** one run. If a documented or CI-used method name turns out to be invalid under this rule, record it on the task and widen the rule instead of changing the name.
- **Done (2026-11-17):** `validateMethod` in `bench/method.js`, called in `bench/bench.js` after the flag, `--sizes` and `--limit` checks; `--methods` with no value or an empty entry gives `--methods must be a comma list of method names`. `parseMethod` is unchanged. Documented names: 6 hits, all `lanczos,sr-full`, plus the script's default `lanczos,sr-full,sr-500,sr-250` and the model-path forms in `.claude/agents/bench-runner.md` and `docs/TEXTURE.md` (`sr:...#192@0`, `sr:...@0.1`): all valid. README line ~341 rewritten. 7 tests in `test/bench-method-validate.test.js`; mutation by hand (dropping the tile/mix checks) fails 5 of 7. `npm test` 422/422.

### [x] CV1 — (done 2026-11-17, test/branches.test.js) Test: the two `src/index.js` branches no test reaches (default `upscale_factor` of `_run`, model output already at target size)
- **Goal:** `node --test --experimental-test-coverage --test-reporter=lcov` (2026-11-17, `main` at 2f2a5c3) reports 100% lines but 98.44% branches for `src/index.js`; the two never-taken branches are `BRDA:254` (`if (upscale_factor === undefined) upscale_factor = 1.0;` in `run`, taken only when `_run` is called without a factor; `upscale` always passes one) and `BRDA:311` (`sr.width === outW && sr.height === outH ? sr.data : resizeRaw(...)`, the case where the 4× model output is already the target size, which happens only when `modelInputMax` shrinks the model input, as the bench's `sr-250` method does; no Lanczos step runs then). Both are real behaviour: the first is the documented default, the second skips a resize.
- **Accept:** (1) a test in a new `test/branches.test.js` calls `_run(arr, stride)` without a factor on a 400×4 image (`PUSHUP_QUALITY=fast`, `PUSHUP_DEVICE=cpu`) and asserts the output equals `upscale(arr, stride)` byte for byte and the output size is 400×4; (2) a test for the model-output-at-target-size branch: it arises only when the model input is shrunk with the `modelInputMax` option (4× of the shrunk input is exactly the target). Use `_run` on a 400×400 image (N must be a multiple of 8 for the heights to match: `4*round(0.625N) = 2.5N`; 400×200 also works) with factor 2.5 (target 1000 px, the cap), opts `{ modelInputMax: 250, lanczosMix: 0 }` (then `modelMax = max(ceil(1000/4), min(400, 250)) = 250`, the model sees 250 px, its 4× output is 1000 px, so `sr.width === outW`), and assert the output size is 1000 on the long side and that no Lanczos resize step ran (compare the returned bytes with the model's own 4× output, obtained by calling the exported helpers or the session directly in the test; do not compare against a second `_run` call, which would pass either way; and do a by-hand mutation check: replace the `? sr.data` arm by `resizeRaw(...)` in a scratch copy, confirm the test fails or, if the bytes are identical because a same-size resize is a no-op, say so in the PR and keep the test as a coverage test). If the branch still cannot be reached without a `src/` change, do **not** change `src/`: record the finding and mark `[blocked]`, and keep test (1); (3) re-run the lcov command and put the new `src/index.js` branch percentage in the PR (target 100% if (2) is possible, otherwise 99.2% or better). No `src/` change, no change to existing tests. `npm test` passes.
- **Notes:** one run, one new test file.
- **Done (2026-11-17):** `test/branches.test.js`, 2 cases. (1) `_run(arr, 1200)` on 400×4 equals `upscale` byte for byte. (2) `_run` 400×400, factor 2.5, `{ modelInputMax: 250, lanczosMix: 0 }` gives 1000×1000 and equals an independent reference (sharp lanczos3 to 250×250, shipped model through onnxruntime, `_toTensor`/`_copyFromTensor`). Branch coverage of `src/index.js`: 130/130 (was 128/130; lcov). Mutations by hand: default factor 1.0 → 2.0 fails case (1). Replacing the `? sr.data` arm by `resizeRaw` does **not** fail case (2): a same-size lanczos3 resize returns identical bytes, so (2) is a coverage test plus a check that the output equals the model output, as the task allowed. No `src/` change.

### [x] CV2 — (done 2026-11-17, bench/edges-real.js + docs/EDGES.md) Real-photo edge check: does the synthetic `fast` overshoot (README "Hard edges") show up on a real photo's strongest edges?
- **Goal:** README "Known limits" says the hard-edge numbers come from synthetic images only ("real photos were not measured"). That is a stated gap. This task measures it for `fast` on the 20 images of `bench/out/sub20`, research only, no change to the product.
- **Accept:** needs `bench/out/sub20` (`bash bench/fetch_testset.sh`, about 5 minutes; if the fetch fails, mark the task `[blocked]` with the error). New `bench/edges-real.js` (usage line in its first 15 lines, uses `bench/flags.js` `checkFlags`, listed in README "Development" as `test/readme-bench.test.js` requires; `--dir` and `--limit` flags as in `bench/pad.js`) that, per image, builds the 800 px reference and the 400 px degraded input exactly as `bench/pad.js` does (copy, do not refactor `bench/bench.js`), runs `fast` (via `_run`, factor 2.0, shipped settings) and plain sharp lanczos3 to 800 px, then on the luminance of the reference takes the 200 pixels with the largest gradient magnitude whose 9×9 neighbourhood has a dark/light contrast of at least 80 levels, and reports for `fast` and for Lanczos the mean over those pixels of the overshoot (how far the output goes beyond the min/max of the reference's 9×9 neighbourhood, in levels, 0 when inside it). Mean over the 20 images per method. `docs/EDGES.md` gets a new section "Real photos (CV2)" with the command, the table (method × mean overshoot, share of edge pixels with overshoot > 4 levels), the number of images used, and one sentence that compares it with the synthetic figures above it; README "Hard edges" keeps its text but the sentence "Synthetic images only; real photos were not measured." becomes a sentence that links the new section and says what the real-photo figure is. A small unit test (`test/edges-real.test.js`) for the overshoot function on a hand-made 9×9 neighbourhood (inside, 10 above, 7 below) and for the argument checks (unknown flag, bad `--limit`). No `src/` change, no default change. `npm test` passes.
- **Notes:** one run. Runtime: `fast` at 400 px is ~0.5 s per image. If fewer than 15 of the 20 images yield 200 qualifying pixels, say so and use the pixels there are.
- **Done (2026-11-17):** `bench/edges-real.js` (`--dir`, `--limit`, `checkFlags`; listed in README Development), `test/edges-real.test.js` (overshoot on a hand-made 9×9 window: inside 0, 10 above, 7 below; edge picker; 6 argument cases). `docs/EDGES.md` "Real photos (CV2)": 20 of 20 images, 200 edge pixels each; mean overshoot `fast` 0.001 vs Lanczos 0.000 levels, 3 vs 1 of 4000 pixels with any overshoot, largest 1.98 vs 1.84. Result: the synthetic overshoot does not show on real edges under this measure (soft reference edges; caveat written in the doc). README sentence replaced. The `bench/out` set needed a venv (`pip install pyarrow pillow`) because the system Pillow import was broken in this sandbox; nothing in the repo changed for that.

### [x] CV3 — (done 2026-11-17, bench/edges-real.js + docs/EDGES.md) `bench/edges-real.js`: sample beside the edge (the ringing lobes) and add a positive control
- **Goal:** CV2 (docs/EDGES.md "Real photos (CV2)") found ~0 overshoot at the max-gradient pixels, but the adversary pass showed that measure is blind to ringing lobes (they sit 1–2 px beside the edge, the sampled pixels sit on it) and that it has no positive control. The README "Hard edges" sentence now says it cannot show halos are absent. This task makes the real-photo number mean something, or says it cannot.
- **Accept:** (1) **Beside-edge samples.** For each of the 200 edge pixels `p` (as picked today), take the Sobel gradient `(gx, gy)` at `p` (the same sums `pickEdges` computes; export a helper that returns them), round the direction `(gx, gy) / max(|gx|, |gy|)` component-wise to the nearest of the 8 steps (each component in -1, 0, 1), and sample the two pixels `p ± 2·step`. A sample whose 13×13 window (6 px each side) would leave the image is skipped (so an edge pixel closer than 6 px to the border contributes no beside-edge sample; count the skipped samples and print the count). The score of a sample is the overshoot of the *output* luma at the sample pixel against the min/max of the *reference* luma in the 13×13 window **centred on the edge pixel `p`** (not on the sample), so the window spans the dark-to-light range and the lobe pixel is judged against it. Implement it by giving `overshoot9` an optional parameter object, `overshoot9(out, ref, w, x, y, { half = 4, cx = x, cy = y } = {})`: the window is centred on `(cx, cy)` with half-width `half`, the scored pixel is `(x, y)`; the existing 5-argument calls and `test/edges-real.test.js` stay unchanged. The on-edge set is unchanged (9×9). (2) **Positive control**, run by the script first and printed. Reference: an 800×600 vertical step, dark 40 on the left, light 215 on the right, edge between x = 399 and x = 400 (the same dark and light levels as `bench/edges.js`). Input: that reference degraded exactly as the photos are (cubic halving to 400×300, JPEG q85, decode), then `fast` at factor 2.0 and lanczos3, as for the photos. Edge pixels are picked **only from rows 100 to 499** (an ideal step has the same gradient in every row, so the index tie-break would otherwise take them all from the first rows, the border region `bench/edges.js` excludes by its `BORDER = 40`); with `pickEdges` unchanged this is done by passing the control's luma plane cropped to those rows (and the 200 picks all lie at x = 399 and 400; the 13×13 window of a sample is read from the full 800×600 reference, so the skip rule of (1) tests against the full image, not the cropped plane; add 100 back to the row of every pick before reading the full reference). The 12 to 17 figure of `bench/edges.js` is a largest value on an un-degraded step, while this rule compares a mean on a JPEG-degraded step, so "inconclusive" is an expected and acceptable outcome; report it as such. Both sample sets are scored; print the control's numbers for `fast` and for Lanczos next to the real-photo numbers. (3) **Decision rule, written in the doc and printed by the script:** if `fast`'s mean beside-edge overshoot on the control is below 4 levels, the measure cannot see the overshoot that `bench/edges.js` shows (12 to 17), and the real-photo part is reported as "inconclusive", not as a result; otherwise the real-photo beside-edge numbers are reported as the result, with the control next to them. The on-edge set on an ideal step is about 0 by construction; say so, and do not use it for the rule. (4) `docs/EDGES.md` "Real photos (CV2)": add one table (rows: control, real photos; columns: set, method, mean overshoot, share > 4, largest, samples skipped) and replace the "blind to ringing lobes" paragraph by what was found; adjust the README "Hard edges" sentence to match (it must stay true under `test/readme-*.test.js`). (5) Tests: extend `test/edges-real.test.js` with a case for the direction rounding and the beside-edge samples on a hand-made vertical step (the two samples are 2 px left and right of the edge pixel; a sample whose window leaves the image is skipped) and for `overshoot9` with `{ half: 6, cx, cy }` (a pixel 2 px from the window centre scored against a 13×13 window). No `src/` change, no default change. `npm test` passes.
- **Notes:** one run (~20 s for the script). Needs `bench/out/sub20` (`bash bench/fetch_testset.sh`; if the sandbox Pillow import is broken, build the set with a venv holding pyarrow and pillow, as CV2 did).
- **Done (2026-11-17):** `bench/edges-real.js`: `overshoot9(out, ref, w, x, y, { half, cx, cy })`, `sobel`, `stepOf`, `besideSamples` (13×13 window on the edge pixel; samples near the border skipped and counted), the positive control (800×600 step, degraded like the photos, picks from rows 100–499, row offset added back) and the printed decision rule. Result: control `fast` beside the edge 2.05 levels (< 4) → **real-photo result inconclusive** (real photos beside the edge: `fast` 0.024 mean, 0.3 % above 4, largest 8.97; Lanczos 0.057, 0.5 %, 11.74; 54 samples skipped). `docs/EDGES.md` section "Beside the edge, with a positive control (CV3)" and the README "Hard edges" sentence say so. `test/edges-real.test.js`: 3 new cases (direction rounding, beside-edge samples incl. the border rule on the left, right and top, mutation-checked: BHALF 6→5 and `x >= w - BHALF`→`x > w - BHALF` each fail the test, `overshoot9` with `{ half: 6, cx, cy }`). `npm test` passes. No `src/` change.
- **Follow-up idea (needs a new task, not done here):** a measure that separates `fast` from Lanczos on a degraded step (signed lobe amplitude against a matched, un-degraded reference); not started.

### [x] CV4 — (done 2026-11-17, bench/degrade.js + test/degrade.test.js) One shared helper for the degraded-input construction in `bench/pad.js` and `bench/edges-real.js`
- **Goal:** `bench/pad.js` and `bench/edges-real.js` (CV2) both copy the same construction: a `raw()` helper, the 800 px lanczos3 reference, and the 400 px cubic JPEG q85 input (about 8 lines). Two copies can drift: a change in one would silently make the two reports incomparable. `bench/bench.js` keeps its own copy by decision (it has no exports; do not touch it).
- **Accept:** a new `bench/degrade.js` exporting `raw` and `async function degrade(file)` that returns `{ gt, inp }` (each `{ data, w, h }`) exactly as the two scripts compute them today (reference: source resized so its longest side is 800 px, lanczos3, `fit: 'fill'`; input: the reference downscaled by 2 with the cubic kernel, JPEG q85, decoded). `bench/pad.js` and `bench/edges-real.js` use it (their own `raw` copies are removed). `bench/degrade.js` is a module, not a script: it has no `// Usage:` line and README "Development" does not list it; add it to the `exempt` map in `test/readme-bench.test.js` the way `metrics.js` and `flags.js` are (this one test edit is part of the task). Before the change record SHA-256 of `gt.data` and `inp.data` for the first 3 images of `bench/out/sub20` and the output of `node bench/pad.js` and `node bench/edges-real.js` **without the lines that print a runtime** (pad.js prints a "runtime ... ms" line; drop it before comparing); after the change the hashes and the compared output are identical on this machine (put both in the PR; the hashes depend on the sharp build, so they are a before/after check on one machine, not a pinned test value). A new `test/degrade.test.js` generates a 800×600 synthetic source in a temp file and checks `gt` is 800×600 and `inp` is 400×300, and that a 600×900 source gives `gt` 533×800 and `inp` 267×400 (width `round(600·800/900)` = 533, then halved with `round`); it does not pin hashes. (The old `< 400` skip in both scripts is dead code, since `inp`'s longest side is always 400: leave it, do not remove it in this task.) `test/readme-bench.test.js`, `test/pad-args.test.js`, `test/edges-real.test.js` and `npm test` pass. No `src/` change.
- **Notes:** one run. If the scripts' outputs differ after the change by even one digit, revert and record why on the task.
- **Done (2026-11-17):** `bench/degrade.js` exports `raw` and `degrade(file)`; `bench/pad.js` and `bench/edges-real.js` use it (their `raw` copies removed; `pad.js` keeps its own `metadata()` call for the small-source count). `degrade.js` is on the `exempt` map of `test/readme-bench.test.js`. Before/after on this machine, first 3 images of `bench/out/sub20`: SHA-256 of `gt.data` and `inp.data` identical (abo_0002b541 `c14db8a1…` / `dbe48c27…`, abo_002a7de9 `cb58b151…` / `082ad5b6…`, abo_005e60bd `9464a9f1…` / `e3207581…`); `node bench/pad.js` (without its runtime line) and `node bench/edges-real.js` byte-identical before and after (`cmp`). `test/degrade.test.js`: 6 cases (800×600 → 800×600 / 400×300; 600×900 → 533×800 / 267×400; 650×900 → 578×800 / 289×400 (catches round→floor on `gt`); small and large sources → 800 / 400 longest side; `raw` drops alpha; determinism); sizes only, no pinned hashes: hand mutations of the halving round, 800→799 and `removeAlpha` fail it; a change of the JPEG quality or of either kernel does not, that is caught by the before/after check only. `bench/edges-real.js` keeps a third copy of the cubic/q85 halving for its synthetic control (a different construction on purpose; not moved). `npm test` passes. No `src/` change.

### [x] HP5 — (done 2026-11-19, test/bench-run-pad.test.js) Test: a valid run of `bench/pad.js` on a generated image directory
- **Goal:** `bench/pad.js` is at 69% line coverage (`node --test --experimental-test-coverage`, 2026-11-18, uncovered lines 32–36, 38–45, 49–61, 63–74: the crop, luma, score and variant helpers; the run loop and printing after them are also never reached by a test): `test/pad-args.test.js` only covers the argument checks, and the real run needs `bench/out/sub20`, which CI does not have. A change to `bench/degrade.js` or the pad/crop arithmetic (`2 * (n + 32) - 64 = 2n`) would not be noticed.
- **Accept:** a new `test/bench-run-pad.test.js` writes 2 small generated images (e.g. a 900×600 and a 600×900 PNG with a gradient plus a few hard edges, so the source is larger than 800 px on one side and the 400 px input is valid) to a temp dir and runs `node bench/pad.js --dir <tmp> --limit 2` with `PUSHUP_DEVICE=cpu` (a child process, under 30 s; measure it by hand first and put the time in the PR). It asserts exit 0, empty stderr, the header line `images scored: N of M; ...` with N equal to 2, and the three variant rows `as is`, `padded 16 px`, `padded - as is` (`bench/pad.js` lines ~104–110; the regions whole, interior and border band are nine metric columns, PSNR/SSIM/GMSD each), every metric cell finite. It must not assert absolute quality numbers (they depend on the sharp build). A second case with `--limit 1` prints a count of 1. No change to `bench/pad.js` unless a case exposes a bug (say so). `test/pad-args.test.js` and `npm test` pass.
- **Notes:** one run, one new test file. Test-only.
- **Done (2026-11-19):** `test/bench-run-pad.test.js`, 2 cases. Measured by hand: `bench/pad.js --dir <tmp> --limit 2` on a generated 900×600 and 600×900 PNG takes about 10.5 s (4 vCPU, `PUSHUP_DEVICE=cpu`). Case 1: exit 0, empty stderr, `images scored: 2 of 2`, the rows `as is`, `padded 16 px`, `padded - as is` with 9 finite metric cells each, the whole-image gate line; case 2: `--limit 1` gives `images scored: 1 of 1`. No absolute quality value asserted. No script change, no bug found.

### [x] HP6 — (done 2026-11-19, test/bench-run-edges-real.test.js) Test: a valid run of `bench/edges-real.js` on a generated image directory
- **Goal:** `bench/edges-real.js` is at 59.7% line coverage (2026-11-18, uncovered lines 100–176: the per-image loop, the positive control and the printed decision rule). `test/edges-real.test.js` covers the helper functions and the argument checks only; the printed decision rule (CV3) is what `docs/EDGES.md` quotes.
- **Accept:** a new `test/bench-run-edges-real.test.js` generates 2 images with strong edges (a large dark/light checkerboard, longest side above 800 px) in a temp dir and runs `node bench/edges-real.js --dir <tmp> --limit 2` with `PUSHUP_DEVICE=cpu`. Measure the time by hand first (put it in the PR); if it is over 30 s, use `--limit 1`. Asserts exit 0, empty stderr, that the positive-control block is printed before the real-photo block, that the final `control:` decision line matches `/inconclusive|result/i` (the script prints `INCONCLUSIVE` in capitals), that the numeric cells of the table rows (mean overshoot, share > 4 — printed like `0.0 %`, strip the `%` before `Number` —, largest) are finite (the skipped column may print `-`, and `N of M` cells are not numbers), and that the number of images used is as many as were given. No absolute overshoot value is asserted. No change to `bench/edges-real.js` unless a case exposes a bug (say so). `npm test` passes.
- **Notes:** one run, one new test file. Test-only.
- **Done (2026-11-19):** `test/bench-run-edges-real.test.js`, 1 case. Measured by hand: `bench/edges-real.js --dir <tmp> --limit 2` on a generated 1000×800 and 800×1000 checkerboard takes about 1.9 s (4 vCPU, `PUSHUP_DEVICE=cpu`), so `--limit 2` is kept. Asserts exit 0, empty stderr, `images used: 2 of 2`, 4 `control` rows before 4 `real photos` rows with 8 cells each (mean, share without `%`, largest finite; `N of M` format; skipped `-` on-edge, integer beside-edge), one `control:` line after them matching `/inconclusive|a result/i`. No absolute overshoot value asserted. No script change, no bug found.

### [x] HP7 — (done 2026-11-19, test/throughput-stop.test.js) Test: `bench/throughput.js` stops its children when one fails and on SIGTERM / SIGINT
- **Goal:** P5 (done 2026-11-12) added `killAll()`, the `SIGINT`/`SIGTERM` handlers and the `P5_FAIL_CHILD` test hook, but coverage shows `bench/throughput.js` lines 36–39 and 94–96 never run in the test suite (`grep -l P5_FAIL_CHILD test/*.js` finds only `test/readme-env.test.js`, which does not run it). A regression would leave model processes running after a failed benchmark.
- **Accept:** a new `test/throughput-stop.test.js` (child processes, `PUSHUP_DEVICE=cpu`, the smallest valid run `--seconds 1 --sizes 400`; measure each case by hand first and put the times in the PR): (a) with `P5_FAIL_CHILD=load` (these two cases cover the failure path, lines 94–96, and the exit code; the failing child is the only one forked in the first configuration, so they cannot show that `killAll()` works: say that in the test file and do not claim it) the parent exits 1 with a message on stderr and, within 5 s after exit, none of the child PIDs it started is alive (find the PIDs through a parent/child process listing by the parent PID taken before the run; read how the script forks children and use the least fragile way, e.g. `process.kill(pid, 0)`); (b) the same for `P5_FAIL_CHILD=run`; (c) sending SIGTERM to the parent once its first stdout line has appeared (or, if it prints none before the measure, 1.5 s after start; these two are the cases that prove the children are killed: assert that at least one child PID was alive just before the signal) gives exit code 143 and no child left; (d) the same with SIGINT, exit code 130. Skip (c)/(d) with a printed reason on Windows. Each case must finish in under 30 s; a case that cannot be made stable is left out with its measured flakiness written in the test file, not retried until green. No change to `bench/throughput.js` unless a case exposes a bug (say so). `npm test` passes.
- **Notes:** one run, one new test file. Test-only.

### [x] F-2026-11-19-0025 — (done 2026-11-19, test/bench-run-pad.test.js) `bench-run-pad.test.js` times out on the CI runner
- **Found:** PR #177's CI (`test (24)`, run 44418915327) failed in the HP5 test merged by PR #176: both cases got `status null` (the child was killed by the 60 s `spawnSync` timeout). Locally `bench/pad.js` takes ~8–10 s alone (16 s unrestricted, 25 s on 2 cores, 44 s on 1 core for the whole test file, measured by the adversary). **Hypothesis, not demonstrated:** on the runner `npm test` runs test files in parallel (whole job 430 s) and thread oversubscription slowed it past 60 s; a Node-24-specific hang is not excluded (only `test (24)` was reported failing). The test now prints `signal` and `error` when stderr is empty, and still prints its elapsed time. `main` is therefore red until this lands (PR #176 merged on a green check_suite that did not include the failing job).
- **Fix:** the child timeout of that test is 300 s (was 60 s). No assertion changed or weakened; `bench/pad.js` unchanged.
- **Check on the next CI run:** the `test (20)` / `test (22)` / `test (24)` durations and the printed `bench/pad.js two-image run: N ms`. If it still fails or takes minutes, it is a hang, not load: record it on a new task.
- **Open risk (not done):** the other `test/bench-run-*.test.js` files use 30 s child timeouts and passed in the same CI run; if one of them ever times out the same way, raise it the same way.
- **Done (2026-11-19):** `test/throughput-stop.test.js`, 4 cases (about 1 s together; measured by hand: `P5_FAIL_CHILD=load` 0.1–0.2 s, `=run` 0.7 s; SIGTERM/SIGINT cases under 1 s each; 3 runs stable). (a)/(b) exit 1 with `forced crash`/`child exited` on stderr. (c)/(d) wait for the first stdout line, find the children with `ps --ppid`, assert at least one is alive, send the signal, assert exit 143 / 130 and that no child is alive 5 s later (a zombie counts as dead). Skipped off Linux with a reason. **Finding (mutation by hand):** removing the signal handlers fails (c) and (d); emptying `killAll()` fails nothing, because forked children exit on their own when the parent's IPC channel closes. So the test pins the exit codes and that no process is left behind, not that `killAll()` itself does the stopping; written in the test file. No script change, no bug found.

### [x] BL1 — (done 2026-11-19, test/owner-decisions.test.js) Test: every task ID named in `docs/OWNER_DECISIONS.md` exists in `TASKS.md`
- **Goal:** `docs/OWNER_DECISIONS.md` is maintained by hand ("last updated 2026-11-16") and is the only place the owner looks for open decisions. A renamed or removed task ID would leave a row pointing at nothing, and nothing checks it (the README and `docs/` links have tests: `test/readme-links.test.js`).
- **Accept:** a new `test/owner-decisions.test.js` that reads both files and asserts: (a) each table row has four non-empty cells; (b) extract the IDs from the rows themselves with a pattern (`/\b[A-Z]{1,4}\d+[a-z]?\b/g`, then drop D-numbers such as `D14` and any non-task match, listed in the test), and assert each is a heading ID in `TASKS.md` (headings matched by `^### \[[^\]]+\] (\S+)`); extracting from the rows, not from the headings, is what lets a dead ID fail; (c) the task named in a row's "Decision" column must not be `[x]` unless the row says dropped/done/closed (IDs only cited in "Evidence" may be `[x]`; row 10 names `DOC20`, which is `[x]`, and is an allowed exception, listed in the test with a comment). Measure by hand first which rows pass today; do not edit `docs/OWNER_DECISIONS.md` except to fix a real dead reference found, and say so in the PR. Mutation check by hand: rename one ID in a row and see the test fail.
- **Notes:** test only, no `src/` change, no new dependency. Under 1 s.
- **Done (2026-11-19):** `test/owner-decisions.test.js`, 3 cases (about 0.1 s): (a) 10 rows, 4 non-empty cells each; (b) the IDs found in the rows (BK10, BK11, DOC20, EL1–EL3, GP1, I5, M4, M5, M8, P6, R14, T1a, T3c, T8; D13–D15 dropped as decision numbers) are all headings in `TASKS.md`; (c) Decision-column IDs that are `[x]` need dropped/done/closed in the row, with row 10 / DOC20 as the one listed exception. Mutation checks by hand: renaming `T8` to `T88` in a row fails (b); removing the DOC20 exception fails (c). No dead reference found, `docs/OWNER_DECISIONS.md` unchanged.

### [x] BL2 — (done 2026-11-19, test/bench-run-arena-eventloop-worker.test.js) Test: the `high` code path of `bench/arena.js` (lines 57–66, tile loop) runs, opt-in
- **Goal:** `node --test --experimental-test-coverage` (2026-11-19) shows `bench/arena.js` at 91.5% lines, uncovered 57–66: the tiled `high` pass of the child. `high` costs about 15 s per 400 px image on CPU, over the 20 s budget that HP4 set for default tests, so it was left out.
- **Accept:** extend `test/bench-run-arena-eventloop-worker.test.js` (no new file) with one case `arena.js --runs 1 --cases high:400` that runs only when `PUSHUP_SLOW_TESTS=1`, otherwise `t.skip('set PUSHUP_SLOW_TESTS=1')` with that reason; the skip reason must be visible in the `npm test` output. Measure the wall time by hand first and write it in the test comment. This opt-in case is exempt from BL3's 5× rule (it is skipped by default). One case may set its own `timeout` of at least 120 s (the shared helper's 30 s is too short: 2 children × 2 passes × about 15–18 s); only that case changes, no existing case's timeout or assertion. Asserts exit 0, the header, a `high:400` row with finite numbers, and that output bytes with the arena on and off are equal (as the existing `fast` case does). Document the variable in one line in the README "Tests" section if one exists, else in `docs/CONTRACT_TESTS.md`. CI keeps running without it (no workflow change).
- **Notes:** never weaken the existing cases; default `npm test` time must not grow by more than 0.5 s.
- **Done (2026-11-19):** measured by hand (4 vCPU, `PUSHUP_DEVICE=cpu`): `arena.js --runs 1 --cases high:400` 50.6 s whole run (median per call arena on 10.9 s, off 13.1 s; RSS 1201 / 691 MB; bytes equal, diff 0). New case in the existing file, opt-in via `PUSHUP_SLOW_TESTS=1` (otherwise `# SKIP set PUSHUP_SLOW_TESTS=1` shows in `npm test`), own 120 s timeout through a new optional `timeout` argument of `run()` (default stays 30 s; no other case changed). With the variable set: 4/4 pass. Default `npm test`: 456 tests, 455 pass, 1 skipped. One line in README "Development" (the README has no "Tests" section; the task's fallback was `docs/CONTRACT_TESTS.md`, which is organised by contract rule, so the README was chosen: a deliberate small deviation).

### [x] BL3 — (done 2026-11-19, docs/PERF.md + test/bench-run-timeouts.test.js) Test: every `test/bench-run-*.test.js` child timeout is at least 5× the time recorded for its run
- **Goal:** the F-2026-11-19-0025 note ("Open risk") says the other `test/bench-run-*.test.js` files use 30 s child timeouts and passed in the same CI run where `bench-run-pad` timed out at 60 s. Nothing records how much headroom each has.
- **Accept:** first list, per `test/bench-run-*.test.js`, its child timeout and the measured wall time of each case (`node --test` per file, 3 runs, 4 vCPU), as a table in `docs/CONTRACT_TESTS.md` (new section "Bench-run test timeouts"). If any case has less than 5× headroom (timeout / measured time), raise only that timeout to 5× rounded up to 10 s, with no assertion changed. Add a small test `test/bench-run-timeouts.test.js` that greps the constant timeout values from those test files and fails if a value is below 20 s (the glob must tolerate a file with no timeout constant, including this new file; the BL2 opt-in case is exempt), so a later edit cannot lower one by accident (pin the current minimum, with a comment saying it is a guard rail, not a contract).
- **Notes:** no `bench/` script change; keep each file's own test time unchanged.
- **Done (2026-11-19):** measured 3 runs per file (4 vCPU, CPU): the lowest headroom is `threads.js` 30 s / 3.65 s = 8x; all 12 cases have at least 8x, so **no timeout was raised**. Table in `docs/PERF.md` "Bench-run test timeouts" (not `docs/CONTRACT_TESTS.md` as the task said: `test/contract-tests.test.js` requires every section there to list tests; a deliberate deviation). `test/bench-run-timeouts.test.js`, 2 cases (about 0.05 s): the scan finds at least 6 files with a numeric timeout; none is below 20 s. Mutation by hand: `bench-run-memory` timeout 30000 -> 10000 fails with the file name. The scan does not read itself and does not see the 120 s of the opt-in BL2 case (a call argument).

### [x] BL4 — (done 2026-11-19, test/decision-refs.test.js) Test: every `D<number>` cited in `README.md`, `PROGRESS.md`, `TASKS.md` and `docs/` exists in `docs/DECISIONS.md`
- **Goal:** decisions are cited by number (`D8`, `D14`, `D16`, ...) from the README, `PROGRESS.md`, `TASKS.md` and `docs/`. A mistyped or renumbered D-number would point at the wrong or a missing decision, and nothing checks it (links have `test/readme-links.test.js`; task IDs in the owner list have `test/owner-decisions.test.js`).
- **Accept:** a new `test/decision-refs.test.js` that (a) collects the headings of `docs/DECISIONS.md` that define a D-number (measure the heading format by hand first and say it in the PR); (b) scans `README.md`, `PROGRESS.md`, `TASKS.md`, `CLAUDE.md` and every `docs/*.md` for `\bD\d+\b` and asserts each match is defined in (a); the scan ignores matches that are not decision numbers (list each such exclusion in the test with a reason, e.g. `D65` and `D140`, which this task's own text uses as examples, or a hex digest), and must not read `docs/DECISIONS.md`'s own headings as citations; (c) asserts the defined numbers are unique and consecutive from `D1` (if the real file has gaps, pin the gaps in the test with a comment instead of editing the file). Put the number of citations checked in the PR. Mutation check by hand (say so in the PR): change one cited `D14` to `D140` in a throwaway copy and the test fails with the file name and the number. Fix a real dead reference if the scan finds one (say so in the PR).
- **Notes:** test only, no `src/` change, no new dependency, under 1 s.
- **Done (2026-11-19):** `test/decision-refs.test.js`, 3 cases (about 0.1 s). Heading format `## D<n> — title`; D1–D16 unique and consecutive (no gaps to pin). 77 citations checked in README, PROGRESS.md, TASKS.md, CLAUDE.md and `docs/*.md`; all defined. The only exclusions are `D65` and `D140` in `TASKS.md` (BL4's own examples), and a third case asserts they are not defined. No dead reference found. Mutation by hand: appending a digit to one citation in `docs/PERF.md`, and to one in `docs/OWNER_DECISIONS.md`, each fails with the file name and the number (files restored; the examples are not written out here because the scan reads this file). `npm test` 461 tests, 460 pass, 1 skipped.

### [x] BL5 — (done 2026-11-19, test/bench-run-memory.test.js) Test: the opt-in `bench/memory-breakdown.js` run (`PUSHUP_SLOW_TESTS=1`), as BL2 did for `arena.js`
- **Goal:** `bench/memory-breakdown.js` is at 24.1% line coverage (`node --test --experimental-test-coverage`, 2026-11-19): its valid run was left out of `test/bench-run-memory.test.js` because it always loads the `high` model (HP3 measured 12.4 s for `--sizes 400`; HP3's rule is that `high` runs stay out of the default suite). A broken child or table row would show only when a person runs it.
- **Accept:** extend `test/bench-run-memory.test.js` (no new file, no change to its existing cases, timeouts or assertions) with one case `memory-breakdown.js --sizes 400` that runs only when `PUSHUP_SLOW_TESTS=1` and otherwise shows `# SKIP set PUSHUP_SLOW_TESTS=1` in the `npm test` output (same mechanism as the BL2 case). Measure the wall time by hand first, three runs, and write it in the test comment; give it its own timeout of at least 5× the longest measured time and not below 60 s (the BL3 guard rail ignores a call argument, as it does for BL2). Asserts: exit 0, no `Error` on stderr, the exact header line `input   rss_require  rss_session  peak_sampled  max_rss  rss_after_call  (MB)`, one `400x300` row with five finite positive numbers where `rss_session >= rss_require`, the arithmetic table with one `400x300` row (tiles > 0), and no `max_rss growth` line (only one size). Update the "Left out on purpose" comment at the top of the file to say the case exists and is opt-in. With the variable set the file passes; default `npm test` time grows by at most 0.5 s. Put the new coverage of `bench/memory-breakdown.js` (with the variable set) in the PR.
- **Notes:** `--arena` stays untested (it runs the model again twice per size); say so in the comment. No `bench/` change unless a case exposes a real bug (say so in the PR).
- **Done (2026-11-19):** measured by hand (4 vCPU, `PUSHUP_DEVICE=cpu`, `--sizes 400`, 3 runs): 15.2 s, 15.8 s, 15.5 s (exit 0, 882 MB max RSS). New case in the existing file, opt-in via `PUSHUP_SLOW_TESTS=1` (`# SKIP set PUSHUP_SLOW_TESTS=1` otherwise), own 90 s timeout through a new optional `timeout` argument of `run()` (default stays 30 s; no other case changed). With the variable set the file passes 3/3 (19.7 s); coverage of `bench/memory-breakdown.js` goes from 24.1% to 69.0% lines (the rest is `--child`/`--tiles` entry points run in children, the one-failed-child branch and the `--arena` part). Mutation by hand: renaming a header word in `bench/memory-breakdown.js` fails the case (restored). The "Left out on purpose" comment is rewritten. README "Development" line and `docs/PERF.md` (BL3 exemption sentence) name the new opt-in case. `npm test`: 462 tests, 460 pass, 2 skipped.

### [x] BL6 — (done 2026-11-19, docs/PERF.md "Test suite time (BL6)" + test/suite-time.test.js) Doc: where the 3-minute `npm test` time goes (per-file durations), with a guard against one file growing unnoticed
- **Goal:** on 2026-11-19 `npm test` on `main` took 172 s on 4 vCPU (458 tests). Which files cost most is not recorded, so a new slow test is not noticed until CI or a run is slow (`bench-run-pad` once timed out on a loaded runner).
- **Accept:** measure by hand with `node --test --test-reporter=spec test/<file>` (or the `duration_ms` of each file from `node --test --test-reporter=tap`), one run per file, then one more for the five slowest (do not export `PUSHUP_DEVICE=cpu` for the whole suite: `test/device.test.js` "a GPU that fails while running falls back to CPU and retries" fails with it set; run without it and say so); add a table "Test suite time" to `docs/PERF.md` with the file, its duration in s and the share of the total, sorted slowest first, and the date, CPU count and `PUSHUP_DEVICE=cpu`. Say in one sentence which three files cost the most and why (model runs, child processes). No test is deleted, skipped or weakened; if a file has a clearly avoidable cost (the same expensive call repeated with no new assertion), list it as a follow-up idea in the doc, do not change it here. Add `test/suite-time.test.js` only if it can stay under 0.2 s: it asserts that the table in `docs/PERF.md` lists every `test/*.test.js` file that exists (by file name), so a new test file must be added to the table or the test fails; there is no exclusion list; if `BL4` has landed first, its `test/decision-refs.test.js` must be in the table. The README test/doc-link tests (`test/readme-*.test.js`) and `npm test` pass.
- **Notes:** docs plus one cheap test, no `src/` or `bench/` change, no CI change.
- **Done (2026-11-19):** each of the 64 files timed alone (4 vCPU, no `PUSHUP_DEVICE`; sum 164 s against 172 s for the whole `npm test`); the five slowest run twice and agree within 0.4 s. Slowest: `device` 17.9 s, `upscale` 16.1 s, `bench-run-pad` 14.9 s, `aspect` 14.0 s, `device-fallback` 8.5 s; most files are under 2 s. Table with shares in `docs/PERF.md` "Test suite time (BL6)". `test/suite-time.test.js`, 2 cases (about 0.1 s): the table lists exactly the existing `test/*.test.js` files, sorted slowest first, shares about 100%. Mutation by hand: removing one table row fails case 1 naming the file (and the share sum in case 2); swapping two rows fails case 2 (restored). No test changed, skipped or weakened.

### [x] BL7 — (done 2026-11-19, test/bench-run-colors.test.js) Test: `bench/colors.js` runs and prints the figures that README and `docs/COLOR.md` quote (opt-in, `PUSHUP_SLOW_TESTS=1`)
- **Goal:** no test file mentions `bench/colors.js` (`grep -l colors.js test/*.js` finds none, 2026-11-19), so it is the one bench script no test runs. The README "Known limits" (flat saturated colours: largest single-channel shift 29 bytes on magenta, 26 on saturated green) and `docs/COLOR.md` rest on its output; a change to the model or the mix could move those figures with no test noticing. `docs/COLOR.md` measured about 23 s on 4 vCPU, over the 20 s default budget of the `bench-run-*` tests.
- **Accept:** measure by hand first (3 runs, wall time, 4 vCPU, `PUSHUP_DEVICE=cpu`) and write the times in the test comment. A new case in a new file `test/bench-run-colors.test.js` (same `run()` style and opt-in mechanism as the BL2 and BL5 cases: `skip` with the visible reason `set PUSHUP_SLOW_TESTS=1` unless `PUSHUP_SLOW_TESTS=1`), own timeout of at least 5× the longest measured time (the bench-run tests have 8× or more, see `docs/PERF.md` "Bench-run test timeouts") and at least 60 s. Asserts: exit 0, no `Error` on stderr, the markdown table has the 27 colour rows (one table, with columns for the shipped pipeline, the model only and the Lanczos reference; read the script and `docs/COLOR.md` for the exact shape), the largest deviation of the shipped `fast` pipeline equals the figure the README quotes today (29, channel B, colour 255,0,255) and the one for saturated green (26) — if the numbers the script prints today differ from the README, do not change the README here: pin what the script prints, put both in the PR and add a follow-up task. The test compares to the README figures with `===`: say in a comment that a deliberate model change must update the README, `docs/COLOR.md` and this test together. Add the file to the "Test suite time" table in `docs/PERF.md` (`test/suite-time.test.js` requires it). The BL3 guard (`test/bench-run-timeouts.test.js`) still passes; add the case to the opt-in sentence in the README "Development" and to the BL3 exemption sentence in `docs/PERF.md`.
- **Notes:** test and docs only, no `bench/` or `src/` change. With the variable unset the default `npm test` time grows by at most 0.5 s.
- **Done (2026-11-19):** measured by hand (4 vCPU, `PUSHUP_DEVICE=cpu`, 3 runs): 25.2 s, 24.2 s, 23.7 s, exit 0, empty stderr, byte-identical output. New file `test/bench-run-colors.test.js`, one case, opt-in via `PUSHUP_SLOW_TESTS=1` (`# SKIP set PUSHUP_SLOW_TESTS=1` otherwise), own 150 s timeout. Asserts the exact header, 27 colour rows in order with 7 cells each, the shipped max deviation of 255,0,255 = 5/5/29 and of 0,255,0 = 22/16/26, the overall maximum 29, a `0` Lanczos deviation for every colour, and at most 1 for black. The figures the script prints today **match** the README (29 on blue of magenta, 26 on saturated green) and `docs/COLOR.md`, so nothing was changed there and no follow-up task is needed. With the variable set the case passes (28.8 s including start-up). Mutation by hand: changing the pinned 29 to 30 makes it fail (restored). README "Development" line and the BL3 exemption sentence in `docs/PERF.md` name the new opt-in case; the file is in the "Test suite time" table (0.1 s, skipped by default). `test/bench-run-timeouts.test.js` guard: the 150 s constant is above its 20 s floor. `npm test`: 468 tests, 465 pass, 3 skipped (all opt-in).

### [x] BL8 — (done 2026-11-20, test/doc-links.test.js) Test: relative links and `#anchors` in `docs/*.md`, `PROGRESS.md` and `TASKS.md` point at files and headings that exist
- **Goal:** `test/readme-links.test.js` (DOC13) checks the `docs/*.md` links of the README, and its DOC14 case those of `docs/OWNER_DECISIONS.md`. The other `docs/*.md` files, `PROGRESS.md` and `TASKS.md` also link to each other (for example `PERF.md#threads-p3-2026-11-11`), and a renamed heading breaks those links silently.
- **Accept:** a new `test/doc-links.test.js` that, for `PROGRESS.md`, every `docs/*.md` and `TASKS.md`, extracts the inline markdown links (text in square brackets followed by a target in parentheses) whose target is relative (not `http`, not `mailto`), strips a `#anchor`, resolves the path against the file's own directory, and asserts the file exists and, when an anchor is given, that the target file has a heading with that GitHub slug (reuse the `slug`/`anchorsOf` logic of `test/readme-links.test.js` by moving the two functions into a small shared `test/helpers/links.js` that both tests require; no behaviour change for the README and DOC14 cases, which keep passing unchanged). Ignore links inside fenced code blocks and inside inline code spans (backticks), so that task text which describes a link does not count as one. First measure by hand how many relative links there are and which, if any, are dead today; fix a real dead link in the same PR (say so) or, if the fix needs an owner decision, list it in a documented exclusion list in the test with a comment. Report the number of links checked. Mutation check by hand (say so in the PR): break one anchor in `docs/PERF.md` in a throwaway copy and the test fails naming the file and the link. The new file must be added to the table in `docs/PERF.md` "Test suite time" (`test/suite-time.test.js` requires it); put it where its measured duration puts it.
- **Notes:** test only, no `src/` change, no new dependency, under 1 s. Do not write a literal broken-link example into `TASKS.md` or `docs/` (the new test scans them): describe it in words.
- **Done (2026-11-20):** `test/doc-links.test.js` (2 cases, ~0.05 s) and `test/helpers/links.js` (`slug`, `anchorsOf`, `inlineLinks`, shared with `test/readme-links.test.js`, whose cases pass unchanged). 28 relative links checked today (DECISIONS.md 2, OWNER_DECISIONS.md 15, PERF.md 11), none dead, so no doc edit and the exclusion list is empty. Mutation by hand: `PERF.md#threads-p3-2026-11-11` changed to `#threads-p3-BROKEN` in `docs/DECISIONS.md` fails with `docs/DECISIONS.md:120 links PERF.md#threads-p3-BROKEN, but docs/PERF.md has no such heading` (restored). Row added to the "Test suite time" table in `docs/PERF.md`.

### [x] BL9 — (done 2026-11-19, test/tasks-format.test.js) Test: `TASKS.md` stays machine-readable (unique IDs, valid statuses, the claim and done conventions)
- **Goal:** the overnight playbook depends on `TASKS.md`: claims are found by the `[~]` status and the ID in the heading, finished tasks carry a done note, and `test/owner-decisions.test.js` and `test/decision-refs.test.js` read its headings. Nothing checks that the file still follows its own conventions, so a duplicated ID, a status typo (`[blockd]`) or a `[x]` task with no done note would go unnoticed until a run picks the wrong task.
- **Accept:** a new `test/tasks-format.test.js` that reads `TASKS.md` and asserts: (a) every `### ` heading under "Backlog" matches `^### \[(?: |~|x|blocked|split)\] (\S+)` (measure by hand which headings do not today and why; pin any legitimate exception in the test with a comment instead of editing old tasks); (b) IDs are unique (today's duplicates, if any, are pinned with a comment); (c) every `[x]` task has a `(done ...` marker in its heading or a `**Done` line in its block (measured 2026-11-19: only `T4`, whose heading says "closed 2026-11-09"; pin `T4` as a named legacy set with a comment, so that new ones cannot); (d) every `[~]` heading contains a `YYYY-MM-DD` date (the claim step says "with today's date" and does not fix the wording, so the test must not require more; no `[~]` task exists today, so test the rule on a string in the test itself) and every `[blocked]` block contains the word `Blocked` or `blocked` after the heading. Report counts per status in the PR. Mutation check by hand: change one status to a typo, duplicate one ID, remove one done marker in a throwaway copy; each fails naming the task ID. Add the new file to the table in `docs/PERF.md` "Test suite time".
- **Notes:** test only, no `src/` change; do not edit old tasks except to fix a real format error found (say so). Under 1 s. The test file's own comments must not contain task headings.
- **Done (2026-11-19):** `test/tasks-format.test.js`, 3 cases (about 0.09 s). Measured on `TASKS.md` before writing it: 146 headings (137 finished, 4 blocked, 3 ready, 1 split, 1 claimed), all with a valid status and an ID, no duplicate IDs, all 4 blocked tasks say "blocked" in their text, and exactly one finished task with neither a done marker in the heading nor a `**Done` line: `T4` ("closed 2026-11-09"), pinned as the legacy set (a case checks it still lacks the marker). The rules live in a `check(text)` function, run on the real file and on small made-up files: a status typo, a duplicate ID, a missing done marker (and the `**Done` line form), a claimed task with no date and a blocked task that does not say why each produce the matching message. Mutation by hand on the real `TASKS.md` (restored each time): a status typo on T3c, a duplicate T3c ID on a finished task, and the done marker removed from BL5 each fail naming the task. No old task edited. Row added to the "Test suite time" table in `docs/PERF.md`. `npm test`: 467 tests, 465 pass, 2 skipped.

### [x] BL10 — (done 2026-11-20, test/doc-tables.test.js) Test: every markdown table in `README.md` and `docs/*.md` has the same number of cells in each row
- **Goal:** the docs carry many hand-edited tables (`docs/PERF.md` has about 215 table lines, `docs/OWNER_DECISIONS.md` rows with many `|`). A missing or extra `|` breaks the rendering on GitHub silently, and a literal `|` inside a cell is easy to forget to escape.
- **Accept:** a new `test/doc-tables.test.js` that reads `README.md`, `docs/*.md`, `PROGRESS.md` and `TASKS.md`, ignores fenced code blocks and inline code spans, finds each table (a header line, a separator line made of `---` cells, then rows up to the first non-table line) and asserts every row has as many cells as the header (count cells with unescaped `|`, ignore the outer pipes). Failure messages name file, line and expected/actual count. First measure by hand how many tables exist and which rows fail today; fix a real broken row in the same PR (say so) or list it in a documented exclusion list with a comment. A self-check case runs the checker on made-up text (good table, short row, long row, table inside a code fence). Mutation by hand (say so in the PR): delete one `|` in a `docs/PERF.md` row in a throwaway copy and the test fails naming file and line. Report the number of tables and rows checked. Add the new file to the table in `docs/PERF.md` "Test suite time" where its measured duration puts it.
- **Notes:** test only, no `src/` change, no new dependency, under 1 s. Do not write a literal broken table into `TASKS.md` or `docs/` (describe it in words).
- **Done (2026-11-20):** `test/doc-tables.test.js` (2 cases, about 0.07 s) and `test/helpers/tables.js` (`cellsOf`, `checkTables`). Measured: 44 tables and 316 rows in README, PROGRESS, TASKS and `docs/*.md` (README 8, PERF 23, EDGES 4, TEXTURE 3, others 1 each); none broken, so no doc edit and the exclusion list is empty. Pipes inside inline code spans count as cell separators unless escaped, because that is how GitHub renders them (so code spans are not stripped here, unlike in `doc-links`); fenced blocks are skipped. Mutation by hand: removing a `|` in a `docs/PERF.md` row fails with `docs/PERF.md:642 row has 2 cells, expected 3` (restored). Row added to the "Test suite time" table in `docs/PERF.md`.

### [ ] BL11 — Test: the Node versions in `package.json` `engines`, the CI matrix and the README agree
- **Goal:** `package.json` says `"node": ">=20.9"`, `.github/workflows/ci.yml` tests Node 20, 22 and 24, and the README names a minimum Node version. Nothing checks that they stay consistent, so raising one and forgetting another would go unnoticed (CI would keep testing a version the package no longer supports, or the README would promise one that CI never runs).
- **Accept:** a new `test/node-versions.test.js` that parses `engines.node` (the `>=X.Y` form; fail with a clear message on any other form so the test is updated on purpose), the `node-version: [...]` list of the `test` job in `.github/workflows/ci.yml` (plain text parse, no YAML dependency) and the minimum Node version stated in the README (find it by measurement and pin the pattern). Assert: the lowest CI major equals the major of `engines.node`; the README minimum major equals it as well; the CI list is sorted and has no duplicates; the major that the `engines` line allows and that `npm test` runs on locally (`process.versions.node`) satisfies `engines`. Self-check cases on made-up strings for each parser. Mutation by hand (say so): change `engines` to `>=22.0` in a throwaway copy and the test fails naming both files. Add the file to the "Test suite time" table in `docs/PERF.md`.
- **Notes:** test only, no change to `package.json`, CI or README unless the measurement shows a real mismatch (then fix the doc side only and say so; a change of the supported Node range is an owner decision: record it on the task instead). Under 1 s.

### [ ] BL12 — Test: `bench/bench.js` runs the model path (`--methods sr-full`) on a generated image
- **Goal:** `node --test --experimental-test-coverage` (2026-11-20, whole suite) reports `bench/bench.js` at 97.58% lines with lines 65–67 uncovered: the branch of `method()` that calls `_run` for every non-`lanczos` method. Every existing `bench.js` test uses `lanczos` only, so a break in the model path of the benchmark (the one that produces all quality numbers in the PRs) would not fail any test.
- **Accept:** a new `test/bench-run-sr.test.js` that writes two small generated images inline (`test/bench-json.test.js` has no helper: it writes deterministic 1000×750 PNGs; check first that the size you choose works with `--sizes 400`, since `bench/bench.js` downsamples the references to the target size) into a temp directory in the layout `bench/bench.js` expects, runs `node bench/bench.js <dir> --methods lanczos,sr-full --sizes 400 --json` as a child process under `PUSHUP_DEVICE=cpu PUSHUP_QUALITY=fast`, and asserts exit 0, valid JSON, a row for each method, `sr-full` PSNR/SSIM finite and `lanczos` finite, and that the two methods' figures differ (the model really ran). Keep it under 15 s and name the file in `docs/PERF.md` "Test suite time"; add a timeout of at least the 20 s floor that `test/bench-run-timeouts.test.js` enforces (60 s is fine), and make `test/bench-run-timeouts.test.js` (BL3) pass unchanged. Coverage of `bench/bench.js` reaches 100% lines or the PR names the remaining lines. No change to `bench/bench.js` unless a test exposes a real bug (say so).
- **Notes:** test only. Read `bench/bench.js` first to learn the directory layout it expects (reference vs. input images) before writing the fixture.

### [ ] BL13 — Measure the colour shift of the `fast` pipeline on real photos (research, no product code)
- **Goal:** README "Known limits" says the colour shift (up to 29 bytes on flat magenta) was measured on uniform test colours only: "real photos were not measured" (`docs/COLOR.md` says "natural photos were not measured"). Find out whether the model shifts the colours of real product photos, in which direction and by how much, compared with plain Lanczos.
- **Accept:** if `bench/out/set` is missing, run `bash bench/fetch_testset.sh` first. On the `bench/out/sub20` references downscaled to 400 px (the way `bench/bench.js` does) and upscaled back to 1000 px by `fast` (default pipeline) and by plain Lanczos, report per channel: mean signed difference to the reference (bias) and mean absolute difference, over (a) the whole image and (b) pixels more than 16 px from the border, and the 99th-percentile absolute difference; one table in `docs/COLOR.md` ("Real photos") with the method, the numbers and the list of the three images with the largest `fast` bias. Add `bench/colors-real.js` (usage line, `bench/flags.js` validation like the other scripts, exit 2 on bad usage) so the numbers can be reproduced, with a test of its argument errors (`test/colors-real-args.test.js`) and a small valid run on generated images (no real set needed). Update README "Flat saturated colours" bullet: replace "real photos were not measured" by the result, with the link. If `fast` bias on real photos is larger than Lanczos by more than 2 bytes on any channel, record it as a finding in `docs/COLOR.md` and as a new task (do not change defaults).
- **Notes:** no change to `src/`, the model or any default. Needs the benchmark set (about 5 min download, Hugging Face is reachable unattended). One run of about 20 images at 400 px takes about 10 s on CPU.
