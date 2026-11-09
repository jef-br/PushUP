# PROGRESS

Append-only run log and hand-off note. Newest entry on top. Every session adds one entry:
what it did, test/bench results, what's next, and any blocker. This is how stateless
overnight runs hand off to each other.

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
