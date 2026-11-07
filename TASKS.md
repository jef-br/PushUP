# TASKS

The backlog for PushUP. Scheduled overnight runs pick work from here; see
`docs/OVERNIGHT_RUN.md`.

## Conventions

- Status: `[ ]` ready · `[~]` in progress · `[x]` done · `[blocked]` waiting on something.
- Each task has an **ID** (stable, used in branch names), a goal, and acceptance criteria.
- One task = one branch (`overnight/<date>-<id>`) = one draft PR.
- Keep tasks small enough to finish and verify in a single ~4-hour window. If a task is
  bigger, split it and add the sub-tasks here first.
- When you claim a task, mark it `[~]` with the date and branch and push that change before
  starting real work.

## Backlog (highest priority first)

> This is a **seed** backlog derived from the README's "Known limits / next steps" plus the
> infrastructure a continuable project needs. Re-prioritise freely; add detail as you learn.

### [~] I1 — CI: run tests on every PR (implemented 2026-11-07, branch overnight/2026-11-07-I1; mark [x] once CI is green on the PR)
- **Goal:** GitHub Actions workflow that runs `npm install` and `npm test` on push/PR.
- **Accept:** `.github/workflows/ci.yml` present; green on a trivial PR; caches npm.
- **Notes:** Keep it to the runtime package; the Python bench/model tooling is out of scope
  for CI unless cheap to add.

### [ ] I4 — Harden tests around the contract edges
- **Goal:** Explicit tests for the `RangeError` bounds (399/400/800/801 px largest side),
  `stride` padding (0–2 bytes, odd widths), and the 1000 px output cap (e.g. 800 px @1.5).
- **Accept:** New tests pass; each contract row in `CLAUDE.md` has at least one test.

### [ ] T2 — Profile and document upscale latency
- **Goal:** Measure per-input-size latency on the standard set and find the dominant cost.
- **Accept:** A short `docs/PERF.md` with a methodology + numbers; one concrete, low-risk
  speed idea written up as a follow-up task (don't implement risky changes unattended).
- **Notes:** README baseline: ~1 s @400 px, ~4 s @800 px on 4 cores.

### [ ] T4 — Optional post-sharpen toggle for fine texture
- **Goal:** Evaluate whether a small, optional sharpening step improves perceived fabric
  texture without hurting PSNR/SSIM/GMSD.
- **Accept:** Benchmark comparison in `PROGRESS.md`; ship only if it's a clear win and
  default-off; otherwise record the negative result and close the task.

### [ ] I3 — Package publish readiness
- **Goal:** Make `package.json` metadata, `files`/`.npmignore`, and `README` ready for
  `npm publish` (dry run only — do not publish).
- **Accept:** `npm pack` produces a tarball that includes `src/`, `models/*.onnx`, `README`;
  excludes `bench/`, `tools/`, test fixtures. `npm publish --dry-run` clean.

### [blocked] T3 — Quality comparison vs a SaaS upscaler (e.g. Claid.ai)
- **Goal:** Score a SaaS upscaler's output against PushUP on the standard set.
- **Blocked on:** a SaaS account + API credentials, and possibly an added network host.
  Record what's needed in `PROGRESS.md`; a human must provide access before this starts.

### [blocked] T1 — Text-on-packaging upscaler
- **Goal:** A text detector + text-specific upscaler for labels/ingredient lists, composited
  with the general result.
- **Blocked on:** design decision — this is large and research-heavy. Before coding, a run
  may do a **research-only** spike (write findings to `docs/`, no code) if nothing else is
  ready, but must not start implementation unattended. Split into sub-tasks here first.
