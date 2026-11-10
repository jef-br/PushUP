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

### [ ] R5 — Test: device-fallback paths not yet covered
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

### [ ] Q6 — README: document the errors `upscale` throws, with a test that keeps it true
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

### [ ] P2 — Faster Lanczos-mix loop (byte-identical output)
- **Goal:** the mix in `run()` calls `Math.round` per byte (~3 M bytes at 1000 px).
- **Accept:** replace it with an equivalent integer-friendly form (e.g. `(a * o + m * p + 0.5) | 0`
  for non-negative values) only if the output is byte-identical (extracting the loop into a helper
  with a test-only `_` export, like `_copyFromTensor`, is allowed): add a test that compares the new
  mix against `Math.round(a * o + m * p)` over all 256×256 byte pairs for the shipped mix share
  (`_MODES.fast.lanczosMix`) and on one real `upscale` output; measure the stage before/after
  (median of ≥ 5 runs at 800 px, factor 1.25) and put the numbers in `docs/PERF.md`. If the
  saving is < 5 ms at 800 px or any byte differs, don't ship it: record the negative result in
  `docs/PERF.md` and close the task. `npm test` passes.

### [ ] T1a — Measure how well text on packaging survives (research, no product code)
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

