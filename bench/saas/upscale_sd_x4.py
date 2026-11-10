"""Run the ONNX Stable Diffusion x4 upscaler (ssube/stable-diffusion-x4-upscaler-onnx) on a crop.

Usage: python bench/saas/upscale_sd_x4.py <pipeline_dir> <image> <out.png> <x0> <y0> <size> [steps]
Needs: pip install diffusers transformers torch onnxruntime pillow (build-time tooling only).
Prompt is fixed and generic; seed fixed. CPU only. Prints wall time and peak RSS.
"""
import resource
import sys
import time

import numpy as np
import torch
from PIL import Image
from diffusers import OnnxStableDiffusionUpscalePipeline

pipe_dir, img, out, x0, y0, size = sys.argv[1], sys.argv[2], sys.argv[3], *map(int, sys.argv[4:7])
steps = int(sys.argv[7]) if len(sys.argv) > 7 else 20
pipe = OnnxStableDiffusionUpscalePipeline.from_pretrained(pipe_dir, provider="CPUExecutionProvider")
crop = Image.open(img).convert("RGB").crop((x0, y0, x0 + size, y0 + size))
t = time.time()
res = pipe("a photo of a product, high detail", image=crop, num_inference_steps=steps,
           noise_level=20, generator=np.random.RandomState(0)).images[0]
dt = time.time() - t
res.save(out)
print(f"{res.size} {dt:.1f} s, {steps} steps, peak RSS {resource.getrusage(resource.RUSAGE_SELF).ru_maxrss // 1024} MB")
