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

### [ ] R14 — Test: a tiny `upscale_factor` gives a 1-pixel largest side, not an empty image
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

### [ ] DOC6 — README "Development": list every runnable `bench/` script, with a test that keeps it so
- **Goal:** the README names `bench/profile.js`, `cold.js`, `threads.js`, `bench.js`, `gate.js` and
  `fetch_testset.sh`, but not `bench/memory.js`, `memory-breakdown.js`, `throughput.js` and `arena.js`
  (0 mentions each, checked 2026-11-14); `bench/metrics.js` and `bench/aspect.js` are library modules (no
  command line).
- **Accept:** README "Development" gets one line per missing script (command, one phrase on what it
  measures, as the existing lines do), pointing to the `docs/PERF.md` section that has its results
  ("Memory", "Throughput", "Arena (P6)"; the links must resolve). Extend `test/readme-bench.test.js` (or a
  new test): every `bench/*.js` file that has a `Usage:` comment line near its top must be named in
  README.md; `bench/metrics.js` and `bench/aspect.js` are exempt, listed in the test with the reason. The test fails on the
  current README and passes after. Docs and test only; README tests R2 / Q6 / D3 / D6 still pass; the
  README must not gain a ```js block calling `upscale(`. `npm test` passes.

### [ ] M5 — Measure whether `fast` mode's memory creeps up over repeated calls (docs only)
- **Goal:** M4 saw a second `high` call raise RSS a little (1459 → 1521 MB), measured ad hoc. A server
  that runs `fast` for days needs to know whether memory stays flat over many calls; unmeasured.
- **Accept:** a bench-only script `bench/memory-creep.js` (no `src/` change; fresh process; public
  `upscale` on a synthetic 800×600 image at factor 1.0; `PUSHUP_QUALITY=fast PUSHUP_DEVICE=cpu`) that makes
  `--calls` (default 30) sequential calls and prints RSS after calls 1, 2, 5, 10, 20 and the last, plus the
  max RSS, in MB. A paragraph in `docs/PERF.md` "Memory" with the table, the machine line, how to run, and
  one plain sentence: flat (RSS after the last call within 5% of RSS after call 5), creeping (more than that;
  give MB per call), or unclear. If the process grows without bound (> 2× RSS after call 5), say so and add an
  owner note on this task; do not change `src/`. Run it twice and report both. About 1 minute per run. `npm test` passes.

