# Overnight run playbook

The operating instructions for an **unattended scheduled session**. No human is watching, so
be conservative: finish and verify one thing rather than start many.

## 0. Orient (do this first, every run)

1. Check the repo is ready to work on: it must contain `package.json` **and** this file's
   siblings `CLAUDE.md` and `TASKS.md`. If any is missing, the project bootstrap hasn't
   landed on this branch yet — **make no changes, create nothing, and end the run.** Do not
   scaffold code or invent a project.
2. Read `CLAUDE.md`, `PROGRESS.md`, and `TASKS.md`. The last `PROGRESS.md` entry tells you
   where the previous run stopped.
3. Benchmark images are not in git. If a task needs them and `bench/out/set` is missing,
   run `bash bench/fetch_testset.sh` (downloads ~1.9 GB from Hugging Face, ~5 min).

## 1. Pick one task

Overnight work lands on branches; only the owner merges to `main`. So `main`'s `TASKS.md`
can be behind: a task can look ready there while a run is already doing it. **Open pull
requests are the claim registry.**

- List open PRs (`mcp__github__list_pull_requests`, state `open`). Any task whose ID
  appears in an open PR's branch (`overnight/<date>-<task-id>`) or title is **taken**, even
  if `main` shows it as `[ ]`. Never start a task that already has an open PR.
- Take the highest-priority remaining task marked ready (`[ ]`), not `blocked`, not `[~]`.
- Branch `overnight/<YYYY-MM-DD>-<task-id>` off the default branch. Mark the task `[~]`
  with today's date, commit that single change, push, and **immediately open the draft PR**
  (title starts with the task ID). The open PR is your claim.
- If no task is free: do not open a new PR just to log that. Append the reason to
  `PROGRESS.md` on the most recent open overnight PR's branch (or skip logging if the
  previous run already recorded the same reason), then stop.

## 2. Do the work

- Implement the smallest complete version that satisfies the task's acceptance criteria.
- `npm install`, then `npm test`. Add or extend tests for what you changed.
- If the change can affect output quality, run the benchmark (use the `bench-runner`
  subagent) and record the metrics in `PROGRESS.md`.
- Keep the public API contract in `CLAUDE.md` intact unless the task explicitly changes it.

## 3. Land it

- Commit in logical steps with clear messages.
- Update `TASKS.md` (mark the task `[x]`, or back to `[ ]` with notes if unfinished) and
  append a `PROGRESS.md` entry: what you did, test/bench results, what's next, any blocker.
- Record any non-obvious choice in `docs/DECISIONS.md`.
- Push the branch and update your **draft** PR to the default branch. One task = one PR.

## 4. Budget and wrap-up

- Aim for about **3 hours**, and never run past the night's hard stop (Europe/Brussels):
  **05:45** on Mon–Fri mornings, **09:00** on Sat/Sun mornings. The scheduled-run prompt
  restates these limits — they override any other figure.
- As you approach the limit or ~3 hours, stop cleanly even mid-task so you don't overlap the
  next window: commit WIP, write the exact next steps in `PROGRESS.md`, push.
- Prefer finishing one task well over leaving several half-done; don't start work you can't
  finish before the stop time.

## Stop conditions (record the reason in `PROGRESS.md`, push, then stop)

- A dependency, credential, or network host you need is unavailable.
- The task is ambiguous or would change the public contract in a way not spelled out.
- Tests you didn't touch are already failing — report, don't paper over.

## Guardrails

- Never skip/disable/weaken tests to get a green run.
- Never force-push or rewrite history on a branch you didn't create this run.
- Don't change `.claude/` config, permissions, or this playbook to grant yourself more room —
  if the rules block the task, that's a blocker to record, not to route around.
