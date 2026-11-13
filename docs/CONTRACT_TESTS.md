# Contract → tests

`CLAUDE.md` says every row of the public contract has a test. This file lists which ones, and
`test/contract-tests.test.js` fails if a listed test no longer exists (renamed or deleted), if a
section below has no listed test, or if a row of the contract table in `CLAUDE.md` has no section.

Format: each bullet is `` - `test/<file>.js`: "<exact test name>" `` — only tests whose name is a
string literal are listed (tests generated from a template literal inside a loop are described in
prose instead and are not checked).

Known limit of the check: it confirms a `test('<name>'` call starts a line in the listed file. It
does not notice a test that sits in a `/* … */` block comment or is disabled with a `{ skip: true }`
option (`//`-commented lines, `test.skip(` and `test.todo(` are caught).

## Input — 8-bit RGB, largest side 400–800 px, else `RangeError`

- `test/upscale.test.js`: "rejects out-of-range input sizes"
- `test/upscale.test.js`: "largest-side bounds: 399 and 801 rejected, 400 and 800 accepted"
- `test/upscale.test.js`: "rejects bad arguments"
- `test/readme-errors.test.js`: "every row of the README Errors list rejects with the documented error class"
- `test/readme-errors.test.js`: "README rows are in check order, and only the first problem is reported"
- `test/length.test.js`: "a plain number[] gives the same output as a Uint8Array of the same pixels"
- `test/arr-types.test.js`: "a whole Buffer is accepted and gives the same output as a Uint8Array"
- `test/arr-types.test.js`: "other typed arrays, DataView, ArrayBuffer and strings reject with TypeError"
- `test/arr-types.test.js`: "a plain Array holding a Symbol or a BigInt rejects with TypeError"

Also covered by `test/arr-types.test.js` (name with escaped quotes, not checked): a plain `Array`
is converted as by `Uint8Array.from` (300 → 44, `'x'` → 0).

Also covered by `test/aspect.test.js` (generated names, not checked): thin and square inputs
such as 800×1 and 4×800 resolve with the right shape.

## `stride` — bytes per row = `width * 3` (+0–2 padding), width = `floor(stride / 3)`

- `test/upscale.test.js`: "row padding in stride is handled"
- `test/upscale.test.js`: "stride padding of 0, 1 and 2 bytes works for odd and even widths"
- `test/length.test.js`: "arr shorter than one row rejects with RangeError"
- `test/readme-errors.test.js`: "every row of the README Errors list rejects with the documented error class"

Also covered by `test/length.test.js` (generated names, not checked): with padding 1 and 2, a
last row without its padding gives the same output; with padding 0 and 2, trailing bytes
shorter than one row (up to `width * 3 − 1`) are ignored.

Also covered by `test/input.test.js` (generated names, not checked): padding 0 and 2 on an
odd-width image, input bytes untouched, `Buffer` slices and `Uint8Array` views with a
non-zero `byteOffset`.

Also covered by `test/determinism.test.js` (generated names, not checked): at factors 1.0 and
1.5, an input with +2 bytes of stride padding gives the same output bytes as the tightly packed
input.

## `upscale_factor` — default 1.0; output largest side = `min(round(input_largest * factor), 1000)`

- `test/upscale.test.js`: "default factor 1.0 keeps the size"
- `test/upscale.test.js`: "factor scales the input, capped at 1000px"
- `test/upscale.test.js`: "output cap: largest side never exceeds 1000px"
- `test/upscale.test.js`: "upscale_factor below 1 downsizes: min(round(largest * factor), 1000)"
- `test/upscale.test.js`: "invalid upscale_factor values are rejected"
- `test/readme-errors.test.js`: "every row of the README Errors list rejects with the documented error class"
- `test/aspect.test.js`: "literal expected shapes for thin inputs (guards the formula in this file)"

## Output — `[arr_out, stride_out]`, tightly packed RGB, `stride_out = out_width * 3`

- `test/upscale.test.js`: "output is tightly packed: stride_out = out_width * 3"
- `test/upscale.test.js`: "output colours stay close to input (no shift)"
- `test/readme.test.js`: "the README upscale example runs and returns the documented shape"

Also covered by `test/determinism.test.js` (generated names, not checked): at factors 1.0 and
1.5 the same call twice in a row, and once more after a fresh session (`_reset()`), returns equal
`arr_out` bytes and equal `stride_out`.

## Async, one at a time (the sentence under the table)

- `test/upscale.test.js`: "concurrent calls resolve"
- `test/queue.test.js`: "an inference that fails inside the queue does not poison later calls"
- `test/queue.test.js`: "calls run one at a time, in the order they were made"
- `test/mixed-queue.test.js`: "four queued calls of mixed sizes and factors return their own result, equal to a solo call"
