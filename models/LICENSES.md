# Model licenses and attribution

The ONNX files here were converted from published PyTorch weights with the tools in
`tools/` (no retraining; weights unchanged). Each keeps its original license.

| File | Original model | Author | License | Source weights (SHA-256) | ONNX SHA-256 |
|---|---|---|---|---|---|
| `4xLSDIRCompactC3.onnx` | [4xLSDIRCompactC3](https://openmodeldb.info/models/4x-LSDIRCompactC3) | Philip Hofmann (helaman) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `4xLSDIRCompactC3.pth`, `a330cac38d95…` ([Phhofm/models](https://github.com/Phhofm/models)) | `6a711c3d521ddeec8dc4acd361cd27d34a4a8cb0991dab71962a6e51cf49054f` |
| `4x_foolhardy_Remacri.onnx` | [4x_foolhardy_Remacri](https://openmodeldb.info/models/4x-Remacri) | foolhardy | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) | `4x_foolhardy_Remacri.pth`, `e1a73bd89c2d…` (as listed on OpenModelDB) | `8ebe93f0f606279b564f5729fd02f4f6337ee32d0c2f01f9ac3b08a7249cf692` |

The `ONNX SHA-256` column is the hash of the file in this directory; `test/models.test.js`
checks it, so a changed or swapped model file fails the tests until the hash is updated on
purpose (re-run `sha256sum models/*.onnx` after rebuilding with `tools/`).

**CC BY-NC-SA 4.0 (Remacri):** non-commercial use only; credit the author; the converted
`4x_foolhardy_Remacri.onnx` is shared under the same license. PushUP is a non-commercial
project. If PushUP is ever used commercially, remove this model (set `PUSHUP_QUALITY=fast`
and delete the file) — the fast mode has no such restriction.
