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

### [x] T4 — Optional post-sharpen toggle for fine texture (closed 2026-11-09: negative result, not shipped; see PROGRESS.md)
- **Goal:** Evaluate whether a small, optional sharpening step improves perceived fabric
  texture without hurting PSNR/SSIM/GMSD.
- **Accept:** Benchmark comparison in `PROGRESS.md`; ship only if it's a clear win and
  default-off; otherwise record the negative result and close the task.

### [x] I3 — Package publish readiness (done 2026-11-08, branch overnight/2026-11-08-I3)
- **Goal:** Make `package.json` metadata, `files`/`.npmignore`, and `README` ready for
  `npm publish` (dry run only — do not publish).
- **Accept:** `npm pack` produces a tarball that includes `src/`, `models/*.onnx`, `README`;
  excludes `bench/`, `tools/`, test fixtures. `npm publish --dry-run` clean.

### [x] T5 — Faster `fromTensor` (byte-identical output) (done 2026-11-09: ~5x faster stage, see PROGRESS.md)
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

### [ ] T3a — Score externally produced upscales (harness for the SaaS comparison)
- **Goal:** `bench/bench.js` can score a folder of upscaled images produced elsewhere (e.g. by
  a SaaS), using the same inputs and references as every other method.
- **Accept:**
  - `node bench/bench.js <set> --sizes 400,600 --export-inputs <dir>` writes the exact
    degraded inputs the bench feeds every method (downscaled, JPEG q85, *decoded* RGB saved as
    lossless PNG) to `<dir>/<size>/<image-name>.png`.
  - `--external <name>=<dir>` scores `<dir>/<size>/<image-name>.png` as method `<name>`.
    External outputs are resized to the reference size (largest side 1000 px) with Lanczos
    if they differ; missing files are reported and skipped, never silently scored.
  - Check: export inputs, upscale them to 1000 px with Lanczos in a separate script, score
    with `--external`: PSNR/SSIM/GMSD must equal the built-in `lanczos` method **exactly**.
  - Test for the name/size matching and the missing-file report. No network calls.

### [blocked] T3b — Run the comparison against Claid.ai (free trial only, no spending)
- **Plan:** Claid.ai's free trial includes 50 API credits; an upscale costs 2–8 credits, so
  the 20-image subset at one input size (≤1000 px output) may fit (20 × 2 = 40) — or not, if
  Claid charges more. Upscale the T3a inputs (400 px first) through Claid's API, then score
  with `--external claid=<dir>`. If credits run out, score the images that were done and
  report N; compare PushUP on the same N images.
- **Blocked on:** the owner creating a free Claid trial account and saving the API key as a
  network secret for `api.claid.ai` (environment settings). Never buy credits; stop if the
  trial balance would run out mid-set.

### [ ] T1a — Measure how well text on packaging survives (research, no product code)
- **Goal:** Decide with data whether text needs special handling. Text on labels
  (ingredients, brand names, sizes) is where upscalers fail most visibly.
- **Accept:**
  - Text test set: run OCR on the 1000 px references from `bench/out/set`; keep crops of
    ≥64 px around detected text lines whose OCR confidence is high (≥15 crops; list them in
    `docs/TEXT.md` with image name + box).
  - Protocol: upscale the **whole image** from its 400 px and 600 px degraded input (as the
    bench does), then cut the same box from the 1000 px output. Score = OCR character
    accuracy (1 − normalised edit distance) against the text OCR reads on the reference crop.
  - Methods: Lanczos, `fast` and `high` (via `PUSHUP_QUALITY`; `high` takes ~15 s per 400 px
    image on CPU, so budget ~30 min for 15 images × 2 sizes).
  - Decision rule, stated in `docs/TEXT.md`: recommend T1b only if `fast`'s mean character
    accuracy is ≥5 points below the reference-OCR ceiling **and** visibly garbled crops exist;
    otherwise recommend closing T1b.
  - `docs/TEXT.md` has the numbers, ≤6 side-by-side crops (images outside git if large), the
    OCR model used with its license and hash, and the recommendation.

### [blocked] T1b — Text-aware upscaling
- **Goal:** detect text regions, upscale them with a text-specialised path, blend back.
- **Blocked on:** T1a's result and an owner go-ahead — this adds models and complexity.

### [split] T1 — Text-on-packaging upscaler → see T1a (measure) and T1b (build).

### [split] T3 — Quality comparison vs a SaaS upscaler → see T3a (harness) and T3b (run).
