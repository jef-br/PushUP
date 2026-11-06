"""Build an ONNX model for an ESRGAN/Real-ESRGAN RRDBNet x4 checkpoint.

Covers 4x-UltraSharp, 4x_foolhardy_Remacri, 4x_NMKD-Siax, RealESRGAN_x4plus
and other 23-block, 64-feature RRDBNet x4 models, in both the old ESRGAN
key layout (model.0, model.1.sub.N.RDBk...) and the new BasicSR layout
(conv_first, body.N.rdbk...). The graph is written directly with onnx.helper;
no PyTorch is needed. Height and width are dynamic. Input/output: float32
RGB in [0, 1], NCHW.

Usage: python tools/build_rrdb_onnx.py weights.(pth|safetensors) out.onnx
"""
import os
import re
import sys
import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

sys.path.insert(0, os.path.dirname(__file__))
import pth_weights


def to_new_keys(w):
    """Map old ESRGAN key names to the BasicSR RRDBNet names."""
    if "conv_first.weight" in w:
        return w
    top = {"0": "conv_first", "3": "conv_up1", "6": "conv_up2", "8": "conv_hr", "10": "conv_last"}
    out = {}
    for k, v in w.items():
        m = re.fullmatch(r"model\.1\.sub\.(\d+)\.RDB(\d)\.conv(\d)\.0\.(weight|bias)", k)
        if m:
            out[f"body.{m[1]}.rdb{m[2]}.conv{m[3]}.{m[4]}"] = v
            continue
        m = re.fullmatch(r"model\.1\.sub\.(\d+)\.(weight|bias)", k)
        if m:
            out[f"conv_body.{m[2]}"] = v  # last entry of the trunk is the trunk conv
            continue
        m = re.fullmatch(r"model\.(\d+)\.(weight|bias)", k)
        if m and m[1] in top:
            out[f"{top[m[1]]}.{m[2]}"] = v
            continue
        raise KeyError(f"unexpected key {k}")
    return out


def build(w):
    nodes, inits = [], []
    n_blocks = 1 + max(int(k.split(".")[1]) for k in w if k.startswith("body."))
    counter = [0]

    def name(prefix):
        counter[0] += 1
        return f"{prefix}_{counter[0]}"

    def conv(x, key):
        wt, b = w[f"{key}.weight"], w[f"{key}.bias"]
        inits.append(numpy_helper.from_array(wt.astype(np.float32), f"{key}.weight"))
        inits.append(numpy_helper.from_array(b.astype(np.float32), f"{key}.bias"))
        y = name(key)
        nodes.append(helper.make_node("Conv", [x, f"{key}.weight", f"{key}.bias"], [y],
                                      kernel_shape=[3, 3], pads=[1, 1, 1, 1]))
        return y

    def lrelu(x):
        y = name("lrelu")
        nodes.append(helper.make_node("LeakyRelu", [x], [y], alpha=0.2))
        return y

    def op(kind, inputs, **attrs):
        y = name(kind.lower())
        nodes.append(helper.make_node(kind, inputs, [y], **attrs))
        return y

    inits.append(numpy_helper.from_array(np.array(0.2, np.float32), "res_scale"))
    inits.append(numpy_helper.from_array(np.array([1, 1, 2, 2], np.float32), "up2"))

    def rdb(x, key):
        feats = [x]
        for i in range(1, 5):
            inp = feats[0] if len(feats) == 1 else op("Concat", feats, axis=1)
            feats.append(lrelu(conv(inp, f"{key}.conv{i}")))
        x5 = conv(op("Concat", feats, axis=1), f"{key}.conv5")
        return op("Add", [op("Mul", [x5, "res_scale"]), x])

    feat = conv("input", "conv_first")
    body = feat
    for b in range(n_blocks):
        out = body
        for r in (1, 2, 3):
            out = rdb(out, f"body.{b}.rdb{r}")
        body = op("Add", [op("Mul", [out, "res_scale"]), body])
    feat = op("Add", [feat, conv(body, "conv_body")])
    for up in ("conv_up1", "conv_up2"):
        feat = op("Resize", [feat, "", "up2"], mode="nearest",
                  coordinate_transformation_mode="asymmetric", nearest_mode="floor")
        feat = lrelu(conv(feat, up))
    out = conv(lrelu(conv(feat, "conv_hr")), "conv_last")
    nodes.append(helper.make_node("Identity", [out], ["output"]))

    graph = helper.make_graph(
        nodes, "rrdbnet_x4",
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
    weights = to_new_keys(pth_weights.load(src))
    onnx.save(build(weights), dst)
    print("wrote", dst)
