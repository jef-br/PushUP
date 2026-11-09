# PROGRESS

Append-only run log and hand-off note. Newest entry on top. Every session adds one entry:
what it did, test/bench results, what's next, and any blocker. This is how stateless
overnight runs hand off to each other.

---

## 2026-11-09 — Backlog: T1 and T3 split into ready + blocked parts; merge process live

- PR #12 (T4, T5, review process) and PR #13 (T6) were merged by the new 3b process
  (reviewer MEETS + adversary AGREE + working session).
- Owner on T3: no spending. Plan: Claid.ai free trial (50 API credits) → T3a (ready: scoring
  harness for external outputs) and T3b (blocked: owner creates the free trial account and
  saves the API key as a network secret for `api.claid.ai`).
- T1 → T1a (ready: measure text survival with OCR, research only) and T1b (blocked on T1a's
  result + owner go-ahead).
- Ready for overnight runs, in order: T3a, T1a.
- Note for the owner: unattended merges need `mcp__github__merge_pull_request` in the
  `.claude/settings.json` allowlist. Sessions may not add it themselves (self-modification).

---

## 2026-11-09 — T6 GPU when available, CPU always; high-quality mode

- Owner rule: every path runs on CPU; a GPU is used when present. `auto` = Remacri on a GPU,
  4xLSDIRCompactC3 on CPU. Overrides: `PUSHUP_QUALITY=auto|fast|high`,
  `PUSHUP_DEVICE=auto|cpu|gpu` (signature unchanged).
- GPU providers: DirectML (Windows), CUDA (Linux x64; onnxruntime-node 1.31 needs CUDA 13
  libs), CoreML (macOS arm64). Load or run failure → CPU (and `fast` in auto). Verified on this
  CPU-only container: real CUDA load fails cleanly; run-time failure simulated with a stub.
- `models/4x_foolhardy_Remacri.onnx` built from the official .pth (SHA-256 e1a73bd8…, matches
  OpenModelDB; weights identical to the earlier safetensors copy). `models/LICENSES.md` added.
- Benchmark, shipped high mode (`PUSHUP_QUALITY=high PUSHUP_DEVICE=cpu`, sub20, 4 cores):
  400 px 31.12 / 0.8994 / 0.1018 in 14.6 s; 800 px 36.32 / 0.9595 / 0.0388 in 59.9 s.
  Fast mode for comparison: 31.51 / 0.8941 / 0.1076 (0.5 s); 36.28 / 0.9543 / 0.0492 (2.0 s).
- Tests: 25/25 (new `test/device.test.js`). GPU speed unmeasured (no GPU here).

---

## 2026-11-09 — T5 faster tensor-to-bytes conversion (byte-identical)

- `copyFromTensor` in `src/index.js` now uses `floor(v * 255 + 0.5)` inline instead of a
  `Math.round` + clamp helper. For float32 inputs `v * 255 + 0.5` is exact in float64, so the
  bytes are identical; no `Uint8ClampedArray` (it rounds ties to even, which differs).
- New `test/convert.test.js`: compares against the original rounding on 30,000 values,
  incl. every .5 tie in range, near-ties, out-of-range, NaN, ±Infinity and -0; plus a
  sub-region copy test, and an end-to-end tiling test (tiled = whole-frame, byte for byte).
  17/17 tests pass.
- `bench/profile.js` now times the shipped function. Conversion stage, 4 cores, factor 1.5,
  median of 5: 63 → 13 ms @400, 148 → 32 ms @600, 250 → 48 ms @800 (~5x).
- End-to-end gain is ~the stage saving: same-session totals (adversary rerun) 493 → 468 ms
  @400 and 1999 → 1921 ms @800. Earlier totals from separate runs (559 → 452, 2193 → 1792)
  overstated it — inference time varies run to run by more than the saving.
- Benchmark unchanged (sub20 @400: 31.51 / 0.8941 / 0.1076). Inference is now ~95%+ of
  latency; further speed needs a faster model runtime (GPU, int8/fp16), not JS changes.

---

## 2026-11-09 — T4 post-sharpen: negative result, not shipped

Tested sharp's unsharp mask (`.sharpen({ sigma })`) on the final image, after the 20%
Lanczos mix, on `bench/out/sub20` (default model 4xLSDIRCompactC3):

| Setting | 400 px PSNR / SSIM / GMSD | 600 px | 800 px |
|---|---|---|---|
| default (no sharpen) | **31.51 / 0.894 / 0.108** | **34.05 / 0.930 / 0.075** | **36.28 / 0.954 / 0.049** |
| sigma 0.5 | 30.75 / 0.887 / 0.107 | 32.99 / 0.926 / 0.075 | 34.88 / 0.953 / 0.050 |
| sigma 1.0 | 28.97 / 0.873 / 0.110 | 30.39 / 0.913 / 0.087 | 31.43 / 0.940 / 0.071 |
| sigma 1.5 | 28.21 / 0.868 / 0.116 | 29.35 / 0.906 / 0.097 | 30.16 / 0.932 / 0.084 |

Every strength lowers PSNR and SSIM; GMSD is flat at best (sigma 0.5). Visually it raises
edge contrast (button outlines, pleats) with faint halos but adds no fabric texture: the
texture is missing information, not low contrast. Code removed; nothing shipped.

---

## 2026-11-09 — Unblocked the overnight runs (interactive session)

**Why runs were stopping after ~30 s:** overnight work sat in unmerged draft PRs, so `main`
kept showing every task as ready; runs (correctly) refused to duplicate open PRs, and T4
needed benchmark images that only existed in an old session. Net: nothing to do.

**Fixed:**
- Merged into `main`: #3 (playbook timing), #4 (community-model converters, tiling,
  4xLSDIRCompactC3 default), #6 (I4 contract tests), #8 (T2 profiling), #9 (I1 CI),
  #10 (I3 publish readiness). Closed duplicates #5, #7 and the log-only #11.
- `docs/OVERNIGHT_RUN.md`: open PRs are now the claim registry — a task with an open
  overnight PR is taken; open the draft PR right after claiming; no log-only PRs.
- `bench/fetch_testset.sh`: downloads the HF sources and builds `bench/out/set` (60) and
  `bench/out/sub20` (20) in ~2 min. Verified byte-identical to the published benchmark set.
- Stale references to the old model fixed in `bench/profile.js`, `test/package.test.js`
  and the `bench-runner` / `model-builder` subagents.
- Tests: 14/14 pass. Profile (4 cores, factor 1.5): 400 px 0.56 s, 600 px 1.18 s,
  800 px 2.19 s end to end. `docs/PERF.md` numbers predate the model switch.

**Next:** T4 is unblocked (data available). T5 ready. T6 (high-quality mode) waits on the
owner's hardware decision.

---

## 2026-11-06 — Community models; new default 4xLSDIRCompactC3

- Added converters: `tools/build_rrdb_onnx.py` (ESRGAN: Remacri, UltraSharp, Siax, x4plus)
  and `tools/build_compact_onnx.py` (compact: LSDIRCompact, Rybu, general-x4v3). Both match
  reference ONNX exports exactly. `tools/pth_weights.py` now reads legacy .pth + safetensors.
- Added tiled inference (`tile` option) — ESRGAN models OOM'd (>14 GB) at 800 px whole-frame;
  tiled 192 px uses ~1.6 GB.
- New default: `models/4xLSDIRCompactC3.onnx` + 20% Lanczos. 20-image subset vs previous
  default: PSNR 31.51 vs 30.96 @400, 34.05 vs 32.96 @600, 36.28 vs 35.13 @800; ~1.75x faster.
- Remacri looks best on fabric (GMSD 0.102 @400, 0.070 @600) but takes 16-60 s on 4-core CPU.
- Licenses: owner confirmed non-commercial use, so CC BY-NC-SA models are allowed.

**Open decision (owner):** ship a slower high-quality ESRGAN mode? Depends on target
hardware (CPU vs GPU). See D7 in `docs/DECISIONS.md`.
## 2026-11-07 — I4: contract-edge tests (branch `overnight/2026-11-07-I4`)

- Added 6 tests to `test/upscale.test.js`: 399/400/800/801 bounds (landscape + portrait),
  stride padding 0–2 with odd/even widths (output matches unpadded within ±1), tight
  `stride_out`, 1000 px cap, factor < 1, invalid factors (0, negative, NaN, Infinity, string).
- `npm test`: 13/13 pass. No source/model change, so no benchmark.
- Reviewer notes applied: reverted stray `package-lock.json` change (I1's PR #5 owns the
  lockfile resync); padding comparison uses a ±1 tolerance instead of bit-exact.
- Not covered (optional follow-up): 3-byte-padding trap (`stride = w*3+3`), missing final-row padding.
- I1 is already in draft PR #5, awaiting human review.

**Next:** T2 (profile latency) or I3 (publish readiness).
## 2026-11-07 — T2: latency profile (branch `overnight/2026-11-07-T2`)

- Added `bench/profile.js` and `docs/PERF.md`. Inference is ~90% of runtime
  (823 / 1933 / 3513 ms at 400 / 600 / 800 px, factor 1.5, 4 vCPU); `fromTensor` is next at ~5–7%.
- Added follow-up task T5 (faster `fromTensor`, byte-identical).
- No library code changed, so no quality benchmark needed. `npm test`: 7/7 pass.
- Note: I1 (CI, PR #7) and I4 (contract tests) were already done on their own unmerged
  `overnight/2026-11-07-*` branches by earlier runs, so I took T2. Merge those PRs.

**Next:** T4 or I3 (or T5); review/merge the open PRs first.
## 2026-11-08 — I1: CI workflow

- Added `.github/workflows/ci.yml`: runs `npm ci` + `npm test` on push to `main` and on every
  PR, Node 20 and 22 matrix, npm cache via `actions/setup-node`.
- Local: `npm ci` clean, tests 7/7 pass. Workflow itself not yet observed running on GitHub
  (check the draft PR's checks). No quality-affecting change, so no benchmark.
- Synced stale `package-lock.json` root metadata (version, license, engines) with `package.json`.
- Choice: `npm ci` (lockfile exists) rather than `npm install`; Node 18 omitted from the
  matrix though `engines` allows >=18.14 (untested).

- Reviewer follow-ups applied: least-privilege `permissions`, concurrency cancel, 15 min timeout. I1 left `[~]` until CI is observed green.

- CI observed green on PR #9 (test 20 and test 22 both passed); I1 marked `[x]`.

**Next:** then I4 (contract-edge tests).
## 2026-11-08 — I3 package publish readiness (branch overnight/2026-11-08-I3)

- Found I1 (PRs #5/#7/#9 — three duplicates), I4 (#6) and T2 (#8) already done in open draft
  PRs that were never merged to `main`, so earlier runs kept re-picking I1. Took I3 instead.
  **Human: please merge/close those PRs; consider keeping only one I1 PR.**
- `package.json`: added author/homepage/bugs, `prepublishOnly`, `files: [src, models/*.onnx]`,
  `engines.node >=20.9` (sharp requirement). README gained an Install section.
- New `test/package.test.js` checks `npm pack --dry-run` contents.
- `npm pack`/`npm publish --dry-run`: 5 files (LICENSE, README, model, package.json,
  src/index.js), 4.5 MB. Tests 8/8 pass. No quality change, so no benchmark.
- **Next:** T4 (post-sharpen) or T5 (on the T2 branch) once PRs are merged.

---

## 2026-11-06 — Consolidated onto `main`

- Upscaler code (`package.json`, `src/`, `models/`, `test/`, `bench/`, `tools/`) and the
  overnight-run setup are both on `main`. Activation steps 1 and 2 below are done.
- All feature branches merged and deleted; `main` is the only branch.
- `.claude/settings.json`: added `Bash(curl:*)` so runs can download models and test data
  from Hugging Face.
- Tests: 7/7 pass. Bench (60 e-commerce images, wdn-x4v3 + 20% Lanczos mix vs Lanczos):
  PSNR 30.61 vs 28.71 @400 px, 32.64 vs 30.30 @600 px, 35.87 vs 30.38 @800 px.

**Next:** enable the overnight schedule (human step 3), then work from `TASKS.md`.

---

## 2026-11-06 — System setup (session: Overnight online-only schedules)

Set up the autonomous-development **system**, not project features:

- `CLAUDE.md` — project knowledge + working agreement.
- `docs/OVERNIGHT_RUN.md` — the overnight run playbook.
- `TASKS.md` — seed backlog + task conventions.
- `docs/DECISIONS.md` — decision log (seeded from the README's rationale).
- `.claude/agents/` — `bench-runner`, `model-builder`, `reviewer` subagents.
- `.claude/settings.json` — Stop hook reminding runs to commit + push.
- Two nightly scheduled firings (Europe/Brussels, ~21:37 and ~02:37) created **disabled**,
  pending activation.

**State:** the upscaler code is NOT yet on this branch / `main` — it's being pushed by a
separate session. These scaffolding files live on `claude/adoring-wright-qce6ln` via a draft
PR.

**Next (activation, human step):**
1. Land the upscaler code (`package.json`, `src/`, `models/`, tests) on `main`.
2. Merge the scaffolding PR into `main`.
3. Enable the overnight schedule.

Until step 1–2 are both on `main`, any overnight run will correctly detect the missing
bootstrap and no-op (see `docs/OVERNIGHT_RUN.md` §0).
