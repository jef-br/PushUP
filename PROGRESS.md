# PROGRESS

Append-only run log and hand-off note. Newest entry on top. Every session adds one entry:
what it did, test/bench results, what's next, and any blocker. This is how stateless
overnight runs hand off to each other.

---

## 2026-11-07 — T2: latency profile (branch `overnight/2026-11-07-T2`)

- Added `bench/profile.js` and `docs/PERF.md`. Inference is ~90% of runtime
  (823 / 1933 / 3513 ms at 400 / 600 / 800 px, factor 1.5, 4 vCPU); `fromTensor` is next at ~5–7%.
- Added follow-up task T5 (faster `fromTensor`, byte-identical).
- No library code changed, so no quality benchmark needed. `npm test`: 7/7 pass.
- Note: I1 (CI, PR #7) and I4 (contract tests) were already done on their own unmerged
  `overnight/2026-11-07-*` branches by earlier runs, so I took T2. Merge those PRs.

**Next:** T4 or I3 (or T5); review/merge the open PRs first.

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
