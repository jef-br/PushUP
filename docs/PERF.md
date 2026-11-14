# Latency profile

## Methodology

`node bench/profile.js [--runs 5] [--sizes 400,600,800] [--factor 1.5]`

- Synthetic 4:3 images (gradient + noise). Latency depends on pixel count, not content.
- `total` is the public `upscale()` call, median of N runs after one warm-up call (so the
  one-off ONNX session load is excluded). Stage columns replay the same steps in the
  script, median of N runs, and are indicative (they don't sum exactly to `total`).
- Machine: 4 vCPU cloud container (`cpus=4`), Node 22 (v22.23.4 in the 2026-11-11 run), onnxruntime-node 1.31, sharp 0.35,
  `DEFAULT_LANCZOS_MIX` 0.2, full input fed to the model. Re-measure on your own hardware.

## Results (median ms)

Current (2026-11-11, D4): model 4xLSDIRCompactC3, after the faster mix loop (P2).
`PUSHUP_QUALITY=fast PUSHUP_DEVICE=cpu node bench/profile.js --runs 5` (factor 1.5), run twice;
this is the second run. Same machine as above (4 vCPU cloud container, header
`cpus=4 node=v22.23.4`):

| Input | total | toTensor | inference | fromTensor | Lanczos resize | Lanczos mix (incl. plain resize) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 400×300 | 443 | 1 | 428 | 13 | 9 | 13 |
| 600×450 | 1014 | 2 | 932 | 31 | 12 | 21 |
| 800×600 | 1854 | 3 | 1768 | 52 | 15 | 25 |

First run, for the spread (the stage columns differ from the second run by at most 4 ms;
`inference` by up to 62 ms at 600 px):

| Input | total | toTensor | inference | fromTensor | Lanczos resize | Lanczos mix (incl. plain resize) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 400×300 | 455 | 1 | 416 | 12 | 6 | 13 |
| 600×450 | 1038 | 2 | 994 | 32 | 12 | 23 |
| 800×600 | 1874 | 3 | 1751 | 48 | 15 | 27 |

What changed since 2026-11-09 (every cell that moved by more than the spread between the two
runs above, checked cell by cell): the Lanczos mix fell 18 / 36 / 46 → 13 / 21 / 25 ms, the only
change with a code cause (P2), while 400 px `toTensor` 6 → 1 and `inference` 399 → 428, 600 px
`total` 1039 → 1014 and Lanczos resize 11 → 12, and 800 px `total` 1792 → 1854 and Lanczos resize
17 → 15 ms moved with no code change in those stages, so they are session-to-session variation
(single runs on two days; the 400 px inference rise is unexplained and worth re-measuring if it
recurs).

Earlier (2026-11-09): model 4xLSDIRCompactC3, faster byte conversion (T5). Factor 1.5
(800 px input is capped to a 1000 px output). `total` and the stage columns come from
separate timed passes, so stages don't sum exactly to `total`; small stages are noisy:

| Input | total | toTensor | inference | fromTensor | Lanczos resize | Lanczos mix (incl. plain resize) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 400×300 | 452 | 6 | 399 | 13 | 6 | 18 |
| 600×450 | 1039 | 2 | 955 | 32 | 11 | 36 |
| 800×600 | 1792 | 3 | 1784 | 48 | 17 | 46 |

Conversion stage before → after T5 (same machine, median of 5): 63 → 13 ms @400,
148 → 32 ms @600, 250 → 48 ms @800. Same-session end-to-end totals: 493 → 468 ms @400,
1999 → 1921 ms @800 (the gain is about the stage saving; inference dominates).

Earlier (2026-11-07, realesr-general-wdn-x4v3, old conversion): 823 / 1933 / 3513 ms total.
Totals vary run to run by ±100-200 ms (inference); compare stages, or totals measured in
the same session (T5 same-session: 1999 → 1921 ms @800 px).
The model always runs at 4×, so the factor barely changes latency.

## Findings

- **Model inference is ~90-99% of the time** and scales roughly with input pixel count.
- `fromTensor` (float → bytes over the 4× output) was ~6% and is now ~2-3% (T5: inline
  `floor(v*255+0.5)`, byte-identical to `Math.round` + clamp for float32 inputs).
- Pre/post resizing with sharp and the Lanczos mix are each ≲ 1–2%.
- First call additionally pays session creation: small for `fast`, a few seconds for `high`
  (see "Cold start" below).

## Lanczos mix loop (P2, 2026-11-10)

The 20% Lanczos mix used `Math.round(a * o + m * p)` per byte (2.25 M bytes for a 1000×750
output). It is now `(a * o + m * p + 0.5) | 0` in `_mixLanczos` (`src/index.js`): the value is
never negative, so it gives the same bytes. `test/mix.test.js` checks that over all 256×256
byte pairs for the shipped share (0.2) and for shares 0, 0.05 … 1, and on a real `upscale`
output; `bench/profile.js` now calls the shipped function.

800×600 input, factor 1.25 (1000×750 output), `fast`, same machine (4 vCPU, Node 22.23), ms:

| Measurement | Before | After |
| --- | ---: | ---: |
| `profile.js --runs 7 --sizes 800 --factor 1.25`, `lanczosMix` column (includes the plain Lanczos resize), 2 runs | 55, 53 | 28, 29 |
| Mix loop alone on a real model output, median of 15 calls, 5 alternating rounds | 18.1–22.3 | 3.1–3.7 |

So about 15–19 ms less per 800 px call (~1% of the ~2 s total; totals vary by more than that
between runs). Output bytes are unchanged.

## Follow-up ideas (not implemented)

Further speed has to come from inference: fp16/int8 quantisation, thread tuning, or a GPU.
These change output quality or depend on hardware, so they need a human decision first.
Thread tuning was measured in P3 (section "Threads" below): fewer threads are not faster per
call, and the output bytes don't depend on the thread count.

- **Throughput with one thread per process (measured in P4, see "Throughput" below).** In the
  P3 numbers, one thread spends about 11–20% fewer core-milliseconds per image than four threads.
  Run concurrently on 4 vCPU, four 1-thread processes finish 9–15% more model calls per second
  than one 4-thread process (model call only, without tensor conversion, resize or mix), but each
  image takes ~3.5× longer. Worth it only for batch jobs where
  per-image latency doesn't matter; it would need a way to set the thread count (a new setting
  or API: an owner decision).
- **Turn the ONNX Runtime CPU memory arena off (measured in M4 and P6).** M4 found the arena is the
  main reason `high` mode's memory grows with input size. P6 measured the option (`enableCpuMemArena:
  false` and `enableMemPattern: false`): output bytes identical (max difference 0), the model call
  1.2× (`high` 400 px) to 1.75–1.86× (`fast` 800 px) slower, peak RSS about 40% lower at 800 px
  `fast` and 400 px `high`. Changing the session options is an owner decision. Numbers and method:
  [Arena (P6, 2026-11-13)](#arena-p6-2026-11-13) and
  [`high` memory breakdown (M4, 2026-11-13)](#high-memory-breakdown-m4-2026-11-13).

## Cold start (Q3, 2026-11-10)

`node bench/cold.js` runs each measurement in a **fresh process** (sessions are cached per
model, so a second size in the same process would not be cold), on CPU, factor 1.5, synthetic
4:3 image. `require` = loading `src/index.js` (onnxruntime-node, sharp); `cold` = the first
`upscale()` call (includes creating the ONNX session); `warm` = median of the following calls.
Same machine as above (4 vCPU Xeon @ 2.1 GHz, Node 22.23). ms:

| Mode | Input | require | cold (1st call) | warm median | cold − warm | warm calls |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `fast` | 400×300 | 50 | 589 | 522 | 67 | 5 |
| `fast` | 800×600 | 42 | 2203 | 2131 | 72 | 5 |
| `high` | 400×300 | 57 | 15585 | 14254 | 1331 | 1 |
| `high` | 800×600 | 49 | 61150 | 57955 | 3195 | 1 |

A first `fast` run of the same script gave cold − warm of 65 ms @400 and 148 ms @800, so the
`fast` overhead is about 0.07-0.15 s and within run-to-run noise. `high` has one warm call
only (it takes about 14 s @400 and 58 s @800 per call), so its cold − warm figure is rougher;
the 67 MB model costs roughly 1.3-3 s extra on the first call.

**Would pre-warming help?** Not for `fast`: the first call costs about 0.1 s more than later
ones, which is below the noise of one request. For `high` it would save about 1-3 s once per
process, small next to the 14-58 s per call, and `high` is meant for GPU machines anyway
(not measured here). A pre-warm call would need a new API or a dummy upscale at start-up, so
there is no case for it now.

## Threads (P3, 2026-11-11)

`node bench/threads.js [--runs 5] [--sizes 400,800] [--threads 1,2,4]` creates one CPU session
of the `fast` model (`4xLSDIRCompactC3.onnx`) per `intraOpNumThreads` value. By default the
values are {1, 2, N/2, N}, N = `os.availableParallelism()`, with duplicates removed; the other
session options are as in `src/index.js`. It times `session.run` on a deterministic synthetic
whole-image input (4:3, gradient + noise): median of the runs after one warm-up. Only the model
call is timed, so tensor conversion, Lanczos resizing and the mix are not included. Each count's
output is converted to bytes with `_copyFromTensor` (the function `src/` ships) and compared
with the bytes at N threads.

Machine: `Intel(R) Xeon(R) Processor @ 2.10GHz`, N = 4 (4 vCPU cloud container), Node v22.23.4,
onnxruntime-node 1.31.1. `node bench/threads.js --runs 7`, run twice. Median ms, and the
ratio to N threads:

| Input | Threads | Run 1 ms | vs N | Run 2 ms | vs N | Bytes equal to N | Max abs byte diff |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 400×300 | 1 | 1367 | 3.30× | 1589 | 3.37× | yes | 0 |
| 400×300 | 2 | 773 | 1.86× | 834 | 1.77× | yes | 0 |
| 400×300 | 4 (N) | 415 | 1.00× | 471 | 1.00× | — | — |
| 800×600 | 1 | 5999 | 3.20× | 6135 | 3.55× | yes | 0 |
| 800×600 | 2 | 3389 | 1.81× | 3192 | 1.85× | yes | 0 |
| 800×600 | 4 (N) | 1876 | 1.00× | 1728 | 1.00× | — | — |

**Result:** latency scales almost linearly with the thread count: 2 threads are ~1.8× and
1 thread is ~3.2–3.6× slower than 4. No smaller count is within 5% of N's time, so the
current default (`intraOpNumThreads = os.availableParallelism()`) stays the fastest setting
for one call. The output bytes are identical at every thread count, so the thread count doesn't
change results. Only a 4-vCPU machine was measured; on many-core hosts the curve may flatten,
so re-run the script there. For several processes per host, see the throughput idea under
"Follow-up ideas".

## Throughput (P4, 2026-11-11)

`node bench/throughput.js [--seconds 30] [--sizes 400,800]` compares one process using all N
threads with several processes using fewer threads each, all running at the same time:
1 × N, N/2 × 2 (when N ≥ 4) and N × 1 (processes × threads). Each process creates one CPU
session of the `fast` model (`_sessionOptions` from `src/`, only `intraOpNumThreads` changed),
does one warm-up run, waits until all processes are ready, then runs `session.run` on the same
deterministic synthetic whole-image input in a loop for the given wall time. Only `session.run`
is timed (no tensor conversion, resize or mix). `images/s` = images finished by all processes /
wall time until the last one finished (a run that started before the deadline still counts).

Machine: `Intel(R) Xeon(R) Processor @ 2.10GHz`, N = 4 (4 vCPU cloud container), Node v22.23.4,
onnxruntime-node 1.31.1. `node bench/throughput.js --seconds 30`, run twice:

| Input | Processes × threads | Run 1 images/s | vs 1 × 4 | Run 2 images/s | vs 1 × 4 | Median ms per image (run 1 / 2) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 400×300 | 1 × 4 | 2.35 | 1.00× | 2.34 | 1.00× | 418 / 423 |
| 400×300 | 2 × 2 | 2.46 | 1.05× | 2.57 | 1.10× | 803 / 783 |
| 400×300 | 4 × 1 | 2.55 | 1.09× | 2.69 | 1.15× | 1541 / 1497 |
| 800×600 | 1 × 4 | 0.53 | 1.00× | 0.56 | 1.00× | 1860 / 1773 |
| 800×600 | 2 × 2 | 0.58 | 1.09× | 0.57 | 1.02× | 3398 / 3418 |
| 800×600 | 4 × 1 | 0.61 | 1.15× | 0.63 | 1.12× | 6104 / 6356 |

Images finished per configuration: 71–84 at 400×300, only 16–22 at 800×600, so the 800 px rows
are rougher (one image more or less moves images/s by ~5%).

**Result:** running N single-thread processes gives about 9–15% more throughput than one
N-thread process on this 4-vCPU machine (model call only). P3's core-ms figures alone would
predict 12–25% (11–20% fewer core-ms); the measured gain is at the low end of that, but the
difference is within the run-to-run spread above (up to ~7 points), so these runs can't say how
much contention between processes costs. The price is latency: each image takes ~3.5×
longer (1.5 s instead of 0.42 s at 400×300; 6.1–6.4 s instead of 1.8 s at 800×600). PushUP's
default (one process, all cores, one call at a time) is the right choice for interactive use,
where latency matters. A batch user who wants the extra ~10% would need a way to set the
thread count, which PushUP doesn't offer; adding one is an owner decision. Only one 4-vCPU
machine was measured; re-run on the target hardware.

## Memory (M1, 2026-11-12)

`node bench/memory.js` runs each measurement in a **fresh process** (CPU, synthetic 4:3 image,
one `upscale()` call). `peak sampled` = `process.memoryUsage().rss` read every 10 ms during the
call; `max RSS` = `process.resourceUsage().maxRSS` (the OS peak for the whole process, the figure
to use). Same machine as above (4 vCPU Xeon @ 2.1 GHz, 16 GB, Node 22.23). MB:

| Mode | Input | Factor | RSS after `require` | RSS after call | Peak sampled | Max RSS |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `fast` | 400×300 | 1.0 | 68 | 202 | 222 | 222 |
| `fast` | 400×300 | 1.5 | 69 | 205 | 205 | 223 |
| `fast` | 800×600 | 1.0 | 68 | 564 | 564 | 564 |
| `fast` | 800×600 | 1.5 | 68 | 566 | 566 | 566 |
| `high` | 400×300 | 1.0 | 69 | 898 | 902 | 915 |
| `high` | 400×300 | 1.5 | 68 | 898 | 902 | 915 |
| `high` | 800×600 | 1.0 | 67 | 1468 | 1501 | 1501 |
| `high` | 800×600 | 1.0 (2nd run) | 67 | 1454 | 1481 | 1481 |

The two `high` 800×600 rows were added by M3 (2026-11-13), same machine, with
`node bench/memory.js --sizes 400 --factors 1 --high-sizes 800` (the call takes about 47 s;
the command also runs one cheap `fast` 400 px job).

- `fast` needs roughly 0.2 GB at 400 px and 0.57 GB at 800 px for one call; the factor (1.0 vs
  1.5) changes it by under 1%. It grows with the input pixel count (the 4× model output
  alone is 3200×2400×3 floats ≈ 92 MB at 800 px; the rest is ONNX Runtime's intermediate
  buffers and the image copies, which were not broken down).
- `high` at 400 px peaks near 0.9 GB (the 67 MB model plus tiles) and at 800 px near 1.5 GB
  (1.48–1.50 GB in two runs). So tiling does **not** keep memory flat: it still grows with the
  input size (about +0.6 GB from 400 to 800 px; `fast` grows by about +0.35 GB over the same
  range). An earlier README figure of "around 1.6 GB" for tiling was a design
  note (removed in DOC1); the measured 800 px peak is close to it. Where the growth comes from:
  see "`high` memory breakdown (M4)" below.
- Calls run one at a time inside a process, so a process needs about the peak of its largest
  call, not the sum. Several processes (see "Throughput") each need their own copy: four
  `fast` processes at 800 px need about 2.3 GB, plus headroom for the input and output buffers.

### Does `fast` mode creep over repeated calls? (M5, 2026-11-14)

`node bench/memory-creep.js` (one fresh process; `fast` on CPU; the public `upscale()` on a synthetic
800×600 image at factor 1.0; 30 sequential calls) prints the RSS after calls 1, 2, 5, 10, 20 and 30.
Same machine as above (`Intel(R) Xeon(R) Processor @ 2.10GHz`, 4 vCPU, Node v22.23.4, onnxruntime-node
1.31.1). Two runs, MB:

| Run | After call 1 | 2 | 5 | 10 | 20 | 30 | Max RSS | Call 30 vs call 5 | Median call |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 561 | 908 | 934 | 934 | 934 | 934 | 1022 | +0 MB (0.0%) | 1990 ms |
| 2 | 473 | 908 | 934 | 907 | 929 | 929 | 1039 | −5 MB (−0.6%) | 1966 ms |

**Flat after the second call: no creep.** RSS after call 30 is within 1% of RSS after call 5 in both
runs (+0.02 and −0.21 MB per call), so a long-running `fast` process does not keep growing. What the
table shows instead is a **warm-up step**: RSS after the first call is 473–561 MB (what the single-call
rows above measure), after the second call it is 908 MB in both runs, and it then stays at about
0.91–0.93 GB (max RSS 1.02–1.04 GB). So a `fast` process serving 800 px images settles at roughly
**0.93 GB resident (about 1 GB peak), not 0.57 GB**: the first-call figure understates a server that
has handled more than one call. The cause of the extra ~0.35–0.45 GB after call 2 was not investigated
(it could be ONNX Runtime keeping buffers, as M4 found for `high`, but that was not measured for `fast`). Only 800×600 was run here (400 and 600 px: see M6 below). How to run
(about 1 minute): `node bench/memory-creep.js [--calls 30] [--size 800]`.

**Smaller sizes (M6, 2026-11-14).** `node bench/memory-creep.js --size 400` and `--size 600`, two runs each,
same machine and settings (4:3 images, MB):

| Input | Run | After call 1 | 2 | 5 | 10 | 20 | 30 | Max RSS | Call 30 vs call 5 | Median call |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 400×300 | 1 | 199 | 312 | 359 | 368 | 369 | 369 | 369 | +10 MB (2.7%) | 442 ms |
| 400×300 | 2 | 200 | 313 | 360 | 383 | 386 | 386 | 386 | +26 MB (7.2%) | 415 ms |
| 600×450 | 1 | 346 | 590 | 605 | 606 | 606 | 606 | 656 | +1 MB (0.2%) | 994 ms |
| 600×450 | 2 | 395 | 540 | 604 | 605 | 605 | 605 | 655 | +1 MB (0.1%) | 1010 ms |

- **400 px:** the step after call 1 appears (about +0.11 GB at call 2, 0.20 → 0.31 GB), but it is not
  flat by the 5% rule: call 30 is 2.7% above call 5 in run 1 and 7.2% above it in run 2 (over the 5% limit). Both runs
  rise only until call 10 (run 2: 360 → 383) and are unchanged from call 20 on, so it settles at about
  0.37–0.39 GB rather than growing without bound; two runs are too few to say more.
- **600 px:** the step appears too (about +0.15–0.24 GB, 0.35–0.40 → 0.54–0.59 GB at call 2) and it is flat
  after it: call 30 is within 0.2% of call 5 in both runs; it settles at about 0.61 GB (max RSS 0.66 GB).

### `high` memory breakdown (M4, 2026-11-13)

`node bench/memory-breakdown.js` (one fresh process per size, `high` on CPU, factor 1.0; same
machine as above; MB):

| Input | RSS after `require` | RSS after session creation | Peak (sampled) | Max RSS | RSS after the call |
| --- | ---: | ---: | ---: | ---: | ---: |
| 400×300 | 67 | 281 | 890 | 895 | 886 |
| 800×600 | 67 | 281 | 1493 | 1493 | 1493 |

"Session creation" is one call on a thin 400×12 image (inputs under 400 px are rejected), which
loads the 67 MB model and runs three small tiles. Arrays held by `src/index.js`, from the
image size (arithmetic, not measured: `infer()` is not exported, so stage boundaries inside a
call are not observable without a `src/` change):

| Input | Tiles (192 px + 16 px pad) | Largest tile | Packed input | Whole-image 4× output (uint8) | Returned image (factor 1.0) | Largest tile, float32 in / out |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 400×300 | 6 | 224×208 | 0.3 | 5.5 | 0.3 | 0.5 / 8.5 |
| 800×600 | 20 | 224×224 | 1.4 | 22.0 | 1.4 | 0.6 / 9.2 |

**Result:** the whole-image arrays grow by 18 MB from 400 to 800 px, which is **3%** of the
598 MB growth in max RSS, so they explain far less than half. The per-tile tensors are nearly
the same size at both inputs (largest tile 224×208 vs 224×224). RSS after the call equals the
peak (the process keeps what it grew to), and a second `high` call at 800 px in the same process
moved RSS from 1459 to 1521 MB (max 1510 → 1533 MB; ad-hoc check, not in the script), so
memory is retained, not freed between calls, and creeps up a little more.

**The ONNX Runtime CPU memory arena is the main cause.** `node bench/memory-breakdown.js --arena`
runs only the tile loop (ORT inference on the Remacri model, no sharp, no whole-image buffers)
with the shipped session options (`_sessionOptions`, a bench-only use of an existing export) and
again with `enableCpuMemArena: false` and `enableMemPattern: false` added, max RSS in MB:

| Input | Shipped options (arena on) | Arena and mem-pattern off |
| --- | ---: | ---: |
| 400×300 (6 tiles) | 906 | 642 |
| 800×600 (20 tiles) | 1450 | 732 |

With the arena off the 400 → 800 px growth drops from about 540–570 MB to about 60–90 MB (two
runs), and the 800 px peak from about 1.45 GB to about 0.7 GB (ORT inference alone; the full call
adds the sharp and output buffers, estimated at a few tens of MB from the arrays above). So the extra memory is blocks the
arena keeps while tiles of varying shapes run; it is not any one array. Not measured: whether
turning the arena off costs latency, whether it changes output bytes, and what it does for
`fast` mode. `src/` is unchanged and no default is proposed here: changing the session options
is an owner decision (see the note on task M4 in `TASKS.md`). Until then: budget about 1.5 GB per
`high` process at 800 px and expect it to stay allocated.

## Arena (P6, 2026-11-13)

M4 found the ONNX Runtime CPU memory arena to be the main reason `high` grows with input size. This
section measures what turning it off (`enableCpuMemArena: false` and `enableMemPattern: false`, added to
`_sessionOptions(['cpu'])`) costs in time and output. Bench-only; `src/` is unchanged and no default is
proposed here (an owner decision).

Machine: `Intel(R) Xeon(R) Processor @ 2.10GHz`, N = 4 (4 vCPU cloud container), Node v22.23.4,
onnxruntime-node 1.31.1. How to run (about 4 minutes):

```bash
node bench/arena.js                              # --runs 5 --cases fast:400,fast:800,high:400
node bench/arena.js --runs 7 --cases fast:800    # one case
```

Each case runs in a fresh child process per setting: 1 warm-up, then `--runs` timed model calls
(`fast`: one whole-image `session.run`; `high`: one pass of the 192 px tile loop, 6 tiles at 400×300).
Median ms is the model call only. Max RSS is the child's `resourceUsage().maxRSS`. Bytes are the
warm-up output after the shipped `_copyFromTensor`, compared across the two settings.

| Case | Arena | Median ms | Max RSS MB | Time vs on | Bytes equal to on | Max abs byte diff |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| `fast` 400×300 | on | 481 | 331 | 1.00× | – | – |
| `fast` 400×300 | off | 699 | 286 | 1.45× | yes | 0 |
| `fast` 800×600 | on | 1892 | 1012 | 1.00× | – | – |
| `fast` 800×600 | off | 3308 | 569 | 1.75× | yes | 0 |
| `high` 400×300 (6 tiles) | on | 13567 | 1239 | 1.00× | – | – |
| `high` 400×300 (6 tiles) | off | 16505 | 729 | 1.22× | yes | 0 |

A first run of the `fast` cases gave 493 / 525 ms at 400×300 (1.07×) and 1829 / 3402 ms at 800×600
(1.86×), with max RSS 357 / 431 MB and 990 / 569 MB, so the 400 px time ratio varies a lot between runs
(1.07× to 1.45×); the 800 px ratio (1.75× to 1.86×) and the memory figures are stable.

Reading: the output is **lossless** (every byte equal in all three cases) but turning the arena off is
**costly** in time: the model call is about 1.2× (`high`) to 1.8× (`fast` at 800 px) slower, while
peak memory falls by about 40% (`fast` 800 px: ~1.0 GB to ~0.57 GB; `high` 400 px: ~1.24 GB to ~0.73 GB).
At 400×300 `fast` the memory was not lower in one of two runs (431 vs 357 MB), so there is no
reliable saving there. The option is not free; whether the memory is worth the time is the owner's
decision (see the note on task M4 in `TASKS.md`).
