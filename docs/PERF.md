# Latency profile

## Methodology

`node bench/profile.js [--runs 5] [--sizes 400,600,800] [--factor 1.5]`

- Synthetic 4:3 images (gradient + noise). Latency depends on pixel count, not content.
- `total` is the public `upscale()` call, median of N runs after one warm-up call (so the
  one-off ONNX session load is excluded). Stage columns replay the same steps in the
  script, median of N runs, and are indicative (they don't sum exactly to `total`).
- Machine: 4 vCPU cloud container, Node 22, onnxruntime-node 1.31, sharp 0.35,
  `DEFAULT_LANCZOS_MIX` 0.2, full input fed to the model. Re-measure on your own hardware.

## Results (median ms)

Factor 1.5 (800 px input is capped to a 1000 px output):

| Input | total | toTensor | inference | fromTensor | Lanczos resize | Lanczos mix (incl. plain resize) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 400×300 | 823 | 1 | 737 | 50 | 6 | 17 |
| 600×450 | 1933 | 2 | 1708 | 136 | 11 | 35 |
| 800×600 | 3513 | 2 | 3190 | 233 | 18 | 44 |

Factor 1.0 totals (`--factor 1.0`): 861 / 2034 / 3450 ms (same sizes) — the model always runs at 4×, so the
factor barely matters.

## Findings

- **Model inference is ~90% of the time** and scales roughly with input pixel count
  (4× the pixels → ~4.3× the time).
- Next biggest: `fromTensor` (float → clamped bytes, a JS loop over the 4× output) at ~5–7%.
- Pre/post resizing with sharp and the Lanczos mix are each ≲ 1–2%.
- First call additionally pays session creation (not measured here).

## Follow-up ideas (not implemented)

See `TASKS.md` T5: replace the per-pixel `Math.round`/clamp loop in `fromTensor` with a
`Uint8ClampedArray` write (native round+clamp), estimated (not measured) to save ~100–150 ms
at 800 px (~4%). Output must stay byte-identical; verify with a test and the benchmark. Larger wins
(fp16/int8 quantisation, thread tuning) change output quality or are hardware-dependent
and need a human decision first.
