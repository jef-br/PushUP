# Model licenses and attribution

The ONNX files here were converted from published PyTorch weights with the tools in
`tools/` (no retraining; weights unchanged). Each keeps its original license.

| File | Original model | Author | License | Source weights (SHA-256) |
|---|---|---|---|---|
| `4xLSDIRCompactC3.onnx` | [4xLSDIRCompactC3](https://openmodeldb.info/models/4x-LSDIRCompactC3) | Philip Hofmann (helaman) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `4xLSDIRCompactC3.pth`, `a330cac38d95…` ([Phhofm/models](https://github.com/Phhofm/models)) |
| `4x_foolhardy_Remacri.onnx` | [4x_foolhardy_Remacri](https://openmodeldb.info/models/4x-Remacri) | foolhardy | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) | `4x_foolhardy_Remacri.pth`, `e1a73bd89c2d…` (as listed on OpenModelDB) |

**CC BY-NC-SA 4.0 (Remacri):** non-commercial use only; credit the author; the converted
`4x_foolhardy_Remacri.onnx` is shared under the same license. PushUP is a non-commercial
project. If PushUP is ever used commercially, remove this model (set `PUSHUP_QUALITY=fast`
and delete the file) — the fast mode has no such restriction.
