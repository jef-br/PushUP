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

## 1. Pick one task

- Take the highest-priority task in `TASKS.md` marked ready (`[ ]`), not `blocked` and not
  already `[~]` in-progress.
- Immediately mark it `[~]` with today's date and your branch, commit that single change, and
  push it as your **claim** — so a concurrent window doesn't take the same task.
- Branch name: `overnight/<YYYY-MM-DD>-<task-id>` off the default branch.

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
- Push the branch and open (or update) a **draft** PR to the default branch. One task = one PR.

## 4. Budget and wrap-up

- Target about **4 hours**, then stop cleanly even mid-task so you don't overlap the next
  window: commit WIP, write the exact next steps in `PROGRESS.md`, push.
- Prefer finishing one task well over leaving several half-done.

## Stop conditions (record the reason in `PROGRESS.md`, push, then stop)

- A dependency, credential, or network host you need is unavailable.
- The task is ambiguous or would change the public contract in a way not spelled out.
- Tests you didn't touch are already failing — report, don't paper over.

## Guardrails

- Never skip/disable/weaken tests to get a green run.
- Never force-push or rewrite history on a branch you didn't create this run.
- Don't change `.claude/` config, permissions, or this playbook to grant yourself more room —
  if the rules block the task, that's a blocker to record, not to route around.
