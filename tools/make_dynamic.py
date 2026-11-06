"""Make the H/W dims of a fully-convolutional ONNX model symbolic.

Only shape metadata changes; weights and ops are untouched.
Usage: python tools/make_dynamic.py in.onnx out.onnx
"""
import sys
import onnx

src, dst = sys.argv[1], sys.argv[2]
m = onnx.load(src)
for vi in list(m.graph.input) + list(m.graph.output):
    dims = vi.type.tensor_type.shape.dim
    dims[2].ClearField("dim_value"); dims[2].dim_param = "h" if vi in m.graph.input else "H"
    dims[3].ClearField("dim_value"); dims[3].dim_param = "w" if vi in m.graph.input else "W"
del m.graph.value_info[:]  # drop stale intermediate shapes
onnx.checker.check_model(m)
onnx.save(m, dst)
print("wrote", dst)
