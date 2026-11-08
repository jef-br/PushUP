# PROGRESS

Append-only run log and hand-off note. Newest entry on top. Every session adds one entry:
what it did, test/bench results, what's next, and any blocker. This is how stateless
overnight runs hand off to each other.

---

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
