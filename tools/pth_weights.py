"""Read tensors from PyTorch checkpoints without PyTorch.

Supports .safetensors, zip-format .pth (torch >= 1.6) and legacy .pth.
A restricted unpickler only rebuilds tensors, so arbitrary code in a
pickle cannot run.
"""
import collections
import pickle
import struct
import zipfile
import numpy as np

_DTYPES = {"FloatStorage": np.float32, "HalfStorage": np.float16, "DoubleStorage": np.float64}


class _Storage:
    def __init__(self, dtype):
        self.dtype = dtype


class _LazyTensor:
    """Tensor whose storage bytes may only be available after unpickling."""

    def __init__(self, storage, offset, size, stride):
        self.storage, self.offset, self.size, self.stride = storage, offset, size, stride

    def resolve(self):
        arr = self.storage()
        itemsize = arr.dtype.itemsize
        return np.lib.stride_tricks.as_strided(
            arr[self.offset:], shape=tuple(self.size), strides=tuple(s * itemsize for s in self.stride)
        ).copy()


def _rebuild_tensor_v2(storage, offset, size, stride, *_):
    return _LazyTensor(storage, offset, size, stride)


def _unpickler(fp, persistent_load):
    class U(pickle.Unpickler):
        def find_class(self, module, name):
            if module == "torch._utils" and name == "_rebuild_tensor_v2":
                return _rebuild_tensor_v2
            if module == "torch" and name in _DTYPES:
                return _Storage(_DTYPES[name])
            if module == "collections" and name == "OrderedDict":
                return collections.OrderedDict
            raise pickle.UnpicklingError(f"blocked {module}.{name}")

    u = U(fp)
    u.persistent_load = persistent_load
    return u


def _load_zip(path):
    zf = zipfile.ZipFile(path)
    prefix = zf.namelist()[0].split("/")[0]

    def persistent_load(pid):
        _, storage, key, _, _ = pid
        raw = zf.read(f"{prefix}/data/{key}")
        return lambda: np.frombuffer(raw, dtype=storage.dtype)

    return _unpickler(zf.open(f"{prefix}/data.pkl"), persistent_load).load()


def _load_legacy(path):
    f = open(path, "rb")
    safe = lambda: _unpickler(f, lambda pid: None).load()
    safe(); safe(); safe()  # magic number, protocol version, sys info
    storages = {}

    def persistent_load(pid):
        _, storage, key, _, _, _ = pid
        storages.setdefault(key, {"dtype": storage.dtype})
        return lambda: storages[key]["data"]

    obj = _unpickler(f, persistent_load).load()
    keys = safe()
    for key in keys:
        (n,) = struct.unpack("<q", f.read(8))
        dt = np.dtype(storages[key]["dtype"])
        storages[key]["data"] = np.frombuffer(f.read(n * dt.itemsize), dtype=dt)
    return obj


def _resolve(obj):
    if isinstance(obj, _LazyTensor):
        return obj.resolve()
    if isinstance(obj, dict):
        return {k: _resolve(v) for k, v in obj.items()}
    return obj


def load(path):
    if path.endswith(".safetensors"):
        from safetensors.numpy import load_file
        return dict(load_file(path))
    obj = _resolve(_load_zip(path) if zipfile.is_zipfile(path) else _load_legacy(path))
    for k in ("params_ema", "params"):
        if isinstance(obj, dict) and k in obj:
            return obj[k]
    return obj
