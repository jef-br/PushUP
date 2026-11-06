"""Read tensors from a PyTorch .pth checkpoint without PyTorch.

Uses a restricted unpickler that only rebuilds float tensors, so arbitrary
code in the pickle cannot run.
"""
import pickle
import zipfile
import numpy as np

_DTYPES = {"FloatStorage": np.float32, "HalfStorage": np.float16, "DoubleStorage": np.float64}


class _Storage:
    def __init__(self, dtype):
        self.dtype = dtype


def _rebuild_tensor_v2(storage, offset, size, stride, *_):
    arr, dtype = storage
    itemsize = np.dtype(dtype).itemsize
    return np.lib.stride_tricks.as_strided(
        arr[offset:], shape=tuple(size), strides=tuple(s * itemsize for s in stride)
    ).copy()


def load(path):
    zf = zipfile.ZipFile(path)
    names = zf.namelist()
    prefix = names[0].split("/")[0]

    class Unpickler(pickle.Unpickler):
        def find_class(self, module, name):
            if module == "torch._utils" and name == "_rebuild_tensor_v2":
                return _rebuild_tensor_v2
            if module == "torch" and name in _DTYPES:
                return _Storage(_DTYPES[name])
            if module == "collections" and name == "OrderedDict":
                import collections
                return collections.OrderedDict
            raise pickle.UnpicklingError(f"blocked {module}.{name}")

        def persistent_load(self, pid):
            _, storage, key, _, _ = pid
            raw = zf.read(f"{prefix}/data/{key}")
            return (np.frombuffer(raw, dtype=storage.dtype), storage.dtype)

    obj = Unpickler(zf.open(f"{prefix}/data.pkl")).load()
    for k in ("params_ema", "params"):
        if isinstance(obj, dict) and k in obj:
            return obj[k]
    return obj
