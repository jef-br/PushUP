# Overnight run playbook

The operating instructions for an **unattended scheduled session**. No human is watching.
Work one task at a time and finish it fully (merged, or left open with the reason) before the
next. Keep going until the stop time: a blocker on one task never ends the run.

## 0. Orient (do this first, every run)

1. Check the repo is ready to work on: it must contain `package.json` **and** this file's
   siblings `CLAUDE.md` and `TASKS.md`. If any is missing, the project bootstrap hasn't
   landed on this branch yet — **make no changes, create nothing, and end the run** (the
   only early end besides the one under "Per-task blockers"). Do not scaffold code or
   invent a project.
2. Read `CLAUDE.md`, `PROGRESS.md` (decisions so far) and `TASKS.md`. Where the previous
   run stopped is on the tasks themselves (`[~]` tasks and their open PRs).
3. Benchmark images are not in git. If a task needs them and `bench/out/set` is missing,
   run `bash bench/fetch_testset.sh` (downloads ~1.9 GB from Hugging Face, ~5 min).
4. `npm install`, then `npm test` on `main`. If the install fails downloading the CUDA
   binaries (e.g. a blocked NuGet host), use `npm install --onnxruntime-node-install-cuda=skip`
   (the sandbox has no GPU anyway). If tests already fail on `main`: when the cause is the
   environment (network, missing download, no GPU), record it as a blocker on the affected
   task in `TASKS.md` and carry on with tasks that don't depend on it. When it's a real regression, fixing it
   is your first task: add it to `TASKS.md` as `F-<date>-<HHMM>` and do it like any other
   (never weaken a test). While `main` is red, nothing else can be merged.
5. Work out your stop time (Europe/Brussels, `TZ=Europe/Brussels date`), so runs never
   overlap the next scheduled window:

   | Run started | Hard stop |
   |---|---|
   | 22:00–00:59 | 02:15 |
   | 01:00–03:59 | 05:45 Mon–Fri, 05:15 Sat/Sun |
   | 04:00–07:59 (Sat/Sun) | 09:00 |

   "Mon–Fri" / "Sat/Sun" means the calendar day of the morning the run ends in.

## 1. Pick a task

Overnight work lands on branches and reaches `main` only when its PR is merged (by the
review process in 3b, or by the owner). Until then `main`'s `TASKS.md` is behind: a task can
look ready there while a run is already doing it. **Open pull requests are the claim
registry.**

- List open PRs (`mcp__github__list_pull_requests`, state `open`). Any task whose ID
  appears in an open PR's branch (`overnight/<date>-<task-id>`) or title is **taken**, even
  if `main` shows it as `[ ]`. Never start a task that already has an open PR.
- Take the highest-priority remaining task marked ready (`[ ]`), not `blocked`, not `[~]`.
- Branch `overnight/<YYYY-MM-DD>-<task-id>` off the default branch. Mark the task `[~]`
  with today's date, commit that single change, push, and **immediately open the draft PR**
  (title starts with the task ID). The open PR is your claim.
- If no task is free, go to section 5 (make work) instead of stopping.

## 2. Do the work

- Implement the smallest complete version that satisfies the task's acceptance criteria.
- `npm install`, then `npm test`. Add or extend tests for what you changed.
- If the change can affect output quality, run the benchmark (use the `bench-runner`
  subagent) and put the metrics in the PR description.
- **Quality gate:** a change to default behaviour must not lower quality on
  `node bench/bench.js bench/out/sub20 --sizes 400,800` (CPU, `fast` mode): PSNR may drop
  at most 0.02 dB, SSIM at most 0.001, GMSD may rise at most 0.001 (lower GMSD is better),
  at each size. If it does, ship it off by default or not at all, and record the negative
  result. If the benchmark can't be run, a default-changing PR is not merged: mark the task
  `[blocked]` with the reason. Changes only `high` mode on a GPU would use can't be measured
  here; benchmark them with `PUSHUP_QUALITY=high PUSHUP_DEVICE=cpu` instead.
- Keep the public API contract in `CLAUDE.md` intact unless the task explicitly changes it.

## 3. Land it

- Commit in logical steps with clear messages.
- Update `TASKS.md` (mark the task `[x]`, or back to `[ ]` with next steps / blocker on the
  task if unfinished). Put what you did and the test/bench numbers in the PR description.
- Record any non-obvious choice in `docs/DECISIONS.md` (new D-number) and add one line for it
  to the current week's block in `PROGRESS.md` (decisions only; start a new block on Monday).
- Push the branch and update your **draft** PR to the default branch. One task = one PR.

## 3b. Review and merge (the owner delegated merging to this process)

A PR is merged by the working session only when **three parties align** that it meets the
task's acceptance criteria:

1. **Reviewer** (`reviewer` subagent): give it the branch and task ID. It returns a criteria
   table and `VERDICT: MEETS` / `VERDICT: DOES-NOT-MEET`.
2. **Adversary** (`adversary` subagent): give it the branch, task ID and the reviewer's full
   report. It tries to break the verdict and returns `ADVERSARY: AGREE` / `DISAGREE`.
3. **You** weigh both. Merge only if the reviewer says MEETS, the adversary says AGREE, and
   you agree. Otherwise fix what was raised, push, and run both again — at most **2 refine
   rounds**. Still not aligned → leave the PR open, add a PR comment summarising the
   disagreement, note it on the task in `TASKS.md`, and move on.

To merge: `git merge origin/main` into your branch first if it's behind, re-run `npm test`,
push, then merge the PR (`mcp__github__merge_pull_request`, merge commit). Before merging,
post both final verdict lines as a PR comment. Never merge a PR whose task is `blocked` or needs an owner decision (see `TASKS.md`).
Follow-up decisions that a task defines with an explicit decision rule (e.g. T1a → T1b) are
**not** owner decisions: the session that produces the measurement applies the rule and
unblocks or closes the follow-up itself (D11).
If the merge call is refused (permissions), leave the PR open with the verdicts posted and
note that on the task in `TASKS.md` — the owner merges it.

## 4. Next task, budget and wrap-up

- After a task is merged (or left open after 2 refine rounds), go back to section 1 if at
  least 60 minutes remain before your hard stop. Don't start work you can't finish in time.
- Don't start a 3b review or a merge within 15 minutes of the hard stop; leave the PR open
  with its status noted on the task in `TASKS.md` for the next run.
- At ~30 minutes before the hard stop, stop cleanly even mid-task: push WIP to the task
  branch (only if tests pass; otherwise revert it), write exact next steps and any blocker
  on the task in `TASKS.md` on that branch, and update the PR.

## 5. When nothing is ready — make work

A blocked task is not a reason to stop. In order:

1. Try to unblock a `[blocked]` task from inside the sandbox (download a dataset, write a
   missing script). If it has an open PR, continue on that PR's branch (only if its last push
   is older than 3 hours, so no other run is still on it); set the task back to `[~]` there. Only an owner action (credential, account, network-host approval) is
   a real blocker; record exactly what's needed on the task in `TASKS.md`.
2. Find work: follow-ups in `docs/` and `TASKS.md` notes, `docs/PERF.md` ideas, README "Known limits",
   untested code paths in `src/`, benchmark gaps (product types or sizes the set misses).
3. Add 3–5 new tasks to `TASKS.md` (goal, acceptance criteria, notes; each small enough for
   one run). Land that as its own PR (task ID `BACKLOG-<date>-<HHMM>`) through 3b. At most
   one BACKLOG PR may be open at a time; if one is open, work on its tasks instead — the reviewer
   checks each new task has a goal, verifiable acceptance criteria, one-run scope, and stays
   inside the limits below — then continue with the first new task.

Only work on tasks that are in `TASKS.md`. Self-made tasks may cover speed, quality,
robustness, tests, docs and packaging. Never as a self-made task (these need an
owner-written task): changing the public contract, changing the default model or a default
setting (mode choice, Lanczos mix), adding a model or any new dependency, or editing
`CLAUDE.md`, this playbook or `.claude/`.

## Per-task blockers (record, then move on)

- A dependency, credential, or network host the task needs is unavailable → mark the task
  `[blocked]` with the exact reason, push that to its PR, take the next task.
- The task is ambiguous or would change the public contract in a way not spelled out →
  same.
- End the run early only if no task can be done **and** section 5 produced nothing.

## Guardrails

- Never skip/disable/weaken tests to get a green run.
- Never force-push or rewrite history on a branch you didn't create this run.
- Don't change `.claude/` config, permissions, or this playbook to grant yourself more room —
  if the rules block the task, that's a blocker to record, not to route around.
- Never merge without the reviewer + adversary alignment above, and never merge a PR you
  had to weaken a test for.
