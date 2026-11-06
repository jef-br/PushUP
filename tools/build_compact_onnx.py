"""Build an ONNX model for a Real-ESRGAN SRVGGNetCompact checkpoint.

Covers realesr-general-x4v3, 4xLSDIRCompact*, 4x-Rybu and other "compact"
models (conv + PReLU chain, pixel shuffle, plus a nearest-upsampled copy of
the input). Layer count and scale are read from the weights. The graph is
written directly with onnx.helper; no PyTorch is needed. Height and width
are dynamic. Input/output: float32 RGB in [0, 1], NCHW.

Usage: python tools/build_compact_onnx.py weights.(pth|safetensors) out.onnx
"""
import os
import sys
import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

sys.path.insert(0, os.path.dirname(__file__))
import pth_weights


def build(w):
    idx = sorted({int(k.split(".")[1]) for k in w if k.startswith("body.")})
    nodes, inits = [], []
    x = "input"
    for i in idx:
        wt = w[f"body.{i}.weight"]
        inits.append(numpy_helper.from_array(wt.astype(np.float32), f"body.{i}.weight"))
        y = f"body{i}"
        if wt.ndim == 4:  # conv
            inits.append(numpy_helper.from_array(w[f"body.{i}.bias"].astype(np.float32), f"body.{i}.bias"))
            nodes.append(helper.make_node("Conv", [x, f"body.{i}.weight", f"body.{i}.bias"], [y],
                                          kernel_shape=[3, 3], pads=[1, 1, 1, 1]))
        else:  # PReLU, one slope per channel
            inits[-1] = numpy_helper.from_array(wt.astype(np.float32).reshape(-1, 1, 1), f"body.{i}.weight")
            nodes.append(helper.make_node("PRelu", [x, f"body.{i}.weight"], [y]))
        x = y
    out_ch = w[f"body.{idx[-1]}.weight"].shape[0]
    scale = int(round((out_ch / 3) ** 0.5))
    assert scale * scale * 3 == out_ch, "unexpected output channels"
    nodes.append(helper.make_node("DepthToSpace", [x], ["shuffled"], blocksize=scale, mode="CRD"))
    inits.append(numpy_helper.from_array(np.array([1, 1, scale, scale], np.float32), "up"))
    nodes.append(helper.make_node("Resize", ["input", "", "up"], ["base"], mode="nearest",
                                  coordinate_transformation_mode="asymmetric", nearest_mode="floor"))
    nodes.append(helper.make_node("Add", ["shuffled", "base"], ["output"]))
    graph = helper.make_graph(
        nodes, "srvgg_compact",
        [helper.make_tensor_value_info("input", TensorProto.FLOAT, [1, 3, "h", "w"])],
        [helper.make_tensor_value_info("output", TensorProto.FLOAT, [1, 3, "H", "W"])],
        inits,
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)])
    model.ir_version = 8
    onnx.checker.check_model(model)
    return model


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    onnx.save(build(pth_weights.load(src)), dst)
    print("wrote", dst)
