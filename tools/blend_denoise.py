"""Write an ONNX copy of realesr-general-x4v3 with a chosen denoise strength.

Real-ESRGAN's official "denoise strength" (dn) blends two checkpoints that
share one architecture:
    weights = dn * realesr-general-x4v3 + (1 - dn) * realesr-general-wdn-x4v3
dn=1 is the stock model (strong denoise, smoother); lower dn keeps more
texture. Only weight values change; the graph is reused as-is.

Usage: python tools/blend_denoise.py base.onnx x4v3.pth wdn-x4v3.pth DN out.onnx
"""
import re
import sys
import numpy as np
import onnx
from onnx import numpy_helper

sys.path.insert(0, __import__("os").path.dirname(__file__))
import pth_weights

base, pth_main, pth_wdn, dn, out = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4]), sys.argv[5]
a, b = pth_weights.load(pth_main), pth_weights.load(pth_wdn)
m = onnx.load(base)

# ONNX initializer name -> checkpoint key. Conv weights keep their names
# ("model." prefix); PReLU slopes are anonymous, so map them via the Conv
# that feeds each PReLU node (body.N conv -> body.N+1 PReLU).
key_of = {}
for name in (i.name for i in m.graph.initializer):
    if name.startswith("model.") and name[6:] in a:
        key_of[name] = name[6:]
for node in m.graph.node:
    if node.op_type == "PRelu":
        idx = int(re.search(r"body\.(\d+)/Conv", node.input[0]).group(1))
        key_of[node.input[1]] = f"body.{idx + 1}.weight"
assert set(key_of.values()) == set(a), "checkpoint keys not fully mapped"

for init in m.graph.initializer:
    if init.name not in key_of:
        continue
    cur = numpy_helper.to_array(init)
    k = key_of[init.name]
    assert np.array_equal(cur.reshape(-1), a[k].reshape(-1)), f"base ONNX differs from checkpoint at {k}"
    new = (dn * a[k] + (1 - dn) * b[k]).astype(np.float32).reshape(cur.shape)
    init.CopyFrom(numpy_helper.from_array(new, init.name))

onnx.save(m, out)
print(f"wrote {out} (denoise strength {dn})")
