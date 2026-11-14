# Decisions waiting for the owner

One list of what scheduled runs have left open because only the owner can decide it. Nothing here is
decided: each entry says where the evidence is and what the owner would have to say to unblock it.
Tasks in `TASKS.md` are named by ID (search for the ID there). Maintained by hand; last updated 2026-11-14.

| # | Decision | Evidence | To unblock, say |
| --- | --- | --- | --- |
| 1 | Use **4x-UltraSharpV2-Lite** as the `high` model instead of Remacri (task T8) | [TEXTURE.md](TEXTURE.md) (GMSD/PSNR better than Remacri, 1.7× faster on CPU, 3× less memory); [DECISIONS.md](DECISIONS.md) D14 | "Go for T8". A run then checks the licence of the Lite weights, builds or hashes the ONNX, runs the quality gate with `PUSHUP_QUALITY=high PUSHUP_DEVICE=cpu`, updates README and `models/LICENSES.md`. |
| 2 | How to fix the text-on-packaging test protocol (task T1a, blocked; PR #19, branch `overnight/2026-11-10-T1a`) | T1a in `TASKS.md`: the fixed protocol finds only 7 usable text crops, it needs 15 | Choose **(a)** add a text-rich image source to the set by an OCR-independent rule, or **(b)** lower the OCR confidence threshold to 0.80. A run then continues from `bench/text/*` on that branch. |
| 3 | Vendor hosts for the network allowlist (task T3c, blocked) | T3c in `TASKS.md`; [SAAS.md](SAAS.md) for the one vendor done so far | Add each vendor's site and image CDN to the environment's network allowlist (an interactive session), or drop T3c. |
| 4 | Raise `engines` to `>=22` and drop Node 20 from the CI matrix | I5 note in `TASKS.md` (Node 20 has been end-of-life since April 2026); [DECISIONS.md](DECISIONS.md) D13 (`>=20.9`) | "Raise engines to >=22". A run then edits `package.json`, the lockfile root, CI matrix and README. |
| 5 | A thread/process setting (several one-thread processes for throughput) | [DECISIONS.md](DECISIONS.md) D15; [PERF.md](PERF.md#threads-p3-2026-11-11) and [PERF.md](PERF.md#throughput-p4-2026-11-11) (+9–15% model calls/s, about 3.5× the latency per image) | "Add a setting" with the shape wanted (env variable or option), or "keep as is". |
| 6 | Turn the ONNX Runtime CPU memory arena off | [PERF.md](PERF.md#high-memory-breakdown-m4-2026-11-13) (M4), [PERF.md](PERF.md#arena-p6-2026-11-13) (P6: bytes identical, 1.2×–1.86× slower, peak RSS about 40% lower), [PERF.md](PERF.md#does-fast-mode-creep-over-repeated-calls-m5-2026-11-14) (M5–M8, incl. the arena-off run: about 0.26 GB instead of 0.93 GB at 800×600, about 1.65× slower) | "Arena off for `high`" and/or "for `fast`", or "keep on". A default-changing run would also pass the quality gate and latency checks. |
| 7 | Should the contract text mention the 1 px floor for tiny `upscale_factor` | R14 note in `TASKS.md` (factors like `0.001` return a 1×1 image; the formula in `CLAUDE.md` would give 0) | Reword the contract row in `CLAUDE.md` / README, or say the code should reject such factors. |
