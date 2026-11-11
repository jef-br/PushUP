# PROGRESS

Decision log, one block per ISO week (newest first). Only decisions, each pointing to where
it's documented — the reasoning lives in `docs/DECISIONS.md` (D-numbers) and the other docs.
Run details and numbers go in the PR description; next steps and blockers go on the task in
`TASKS.md`. When a run makes a decision, add one line to the current week's block (start a
new block on Monday).

---

## 2026-W46 (Nov 9–15)

- **Devices:** every path runs on CPU; a GPU is used when present (DirectML / CUDA / CoreML,
  fallback to CPU on any failure). `auto` = Remacri on GPU, `fast` on CPU; overrides
  `PUSHUP_QUALITY`, `PUSHUP_DEVICE`. — D9 (supersedes D7), README "Quality modes and GPU"
- **No post-sharpening:** lowered every score, added no texture. — D8
- **Byte conversion:** inline `floor(v*255+0.5)`, byte-identical and ~5x faster; not
  `Uint8ClampedArray` (rounds ties to even). — `docs/PERF.md`
- **SaaS comparison** only from vendors' own published samples (no accounts, no spending).
  Claid: PushUP is behind on perceived texture → task T7. — D10, `docs/SAAS.md`
- **Texture gap:** no tested model closes it; UltraSharpV2-Lite is a candidate for `high` (owner decision, T8). — D14, `docs/TEXTURE.md`
- **Merging:** a PR merges when reviewer, adversary and working session agree; the owner
  granted the merge permission. Open PRs are the claim registry. — playbook §1, §3b
- **Follow-ups** with a decision rule (T1a → T1b) are decided by the session, not the
  owner. — D11
- **Runs:** per-task PRs (not a `dev` branch); several tasks per run until the hard stop;
  refill the backlog within limits; quality gate on default changes. — D12, playbook §0–5
- **Benchmark data** is rebuilt by `bench/fetch_testset.sh`, not stored in git. — playbook §0
- **Branches:** repo setting "Automatically delete head branches" is on (owner, Nov 9);
  `main` is the only long-lived branch.
- **Network / permissions:** PushUP environment allows Hugging Face and `claid.ai`;
  `Bash(curl:*)` and `mcp__github__merge_pull_request` are allowed in `.claude/settings.json`.
- **CI:** Node 24 (current LTS) added; the matrix is now Node 20, 22 and 24. `engines` stays
  `>=20.9` (dropping Node 20, EOL since April 2026, is an owner decision). — I5,
  `.github/workflows/ci.yml`
- **Threads:** keep `intraOpNumThreads = os.availableParallelism()`: fewer threads are slower
  per call (near-linear scaling on 4 vCPU) and output bytes don't depend on it. — P3, `docs/PERF.md`

## 2026-W45 (Nov 2–8)

- **Pipeline:** whole image 4x through the model, then Lanczos down; always the full-size
  input; in-memory RGB + stride API. — D2, D3, D4, D5
- **Model:** realesr-general weak-denoise at strength 0 (stock version erased buttons). — D1
  (superseded by D6)
- **Large community models** (Remacri, Siax, UltraSharp) optional, tiled 192 px to bound
  memory. — D7 (superseded by D9)
- **Default model:** 4xLSDIRCompactC3 + 20% Lanczos mix replaces realesr-general-wdn-x4v3:
  better at every size, ~1.75x faster. — D6 (merged to `main` in W46), README "Model choice"
- **Licenses:** non-commercial project, so CC BY-NC-SA models (Remacri) are allowed with
  attribution. — `models/LICENSES.md`
- **Self-running project:** overnight runs follow `docs/OVERNIGHT_RUN.md`, backlog in
  `TASKS.md`, decisions in `docs/DECISIONS.md`, helpers in `.claude/agents/`.
- **CI:** `npm ci` + `npm test` on push to `main` and every PR, Node 20 and 22 (Node 18
  untested, so not in the matrix; Node 24 added in W46, I5). — I1, `.github/workflows/ci.yml`
- **Publishing:** `files` whitelist, `prepublishOnly: npm test`, Node >=20.9. — D13
- **Latency:** inference is ~90% of the time; speed has to come from the model runtime. —
  `docs/PERF.md`
